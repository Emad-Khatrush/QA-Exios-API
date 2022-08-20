const User = require('../models/user');
const Orders = require('../models/order');

const ErrorHandler = require('../utils/errorHandler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { errorMessages } = require('../constants/errorTypes');
const moment = require('moment-timezone');
const Office = require('../models/office');
const { generateString } = require('../middleware/helper');

module.exports.createUser = async (req, res) => {
  try {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';

    const customerId = generateString(1, characters) + generateString(3, numbers);
    const userFound = await User.findOne({ customerId });
    if (!!userFound) return next(new ErrorHandler(400, errorMessages.USER_EXIST));
    
    const hashedPassword = await bcrypt.hash(req.body.password, 12);
    const user = await User.create({
      username: req.body.username,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      imgUrl: req.body.imgUrl,
      password: hashedPassword,
      customerId
    });

    const token = await user.getSignedToken();
    res.status(200).json({ success: true, token: token });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, errorMessages.SERVER_ERROR));
  }
}

module.exports.login = async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return next(new ErrorHandler(400, errorMessages.FIELDS_EMPTY));
  }

  try {
    const user = await User.findOne({ username: { $regex: `^${username}$`, $options: 'i'} }).select('+password');
    if (!user) {
      return next(new ErrorHandler(404, errorMessages.USER_NOT_FOUND));
    }
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return next(new ErrorHandler(404, errorMessages.INVALID_CREDENTIALS));
    }

    const token = await user.getSignedToken();
    res.status(200).json({
      success: true,
      account: user,
      token
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, errorMessages.SERVER_ERROR));
  }
}

module.exports.verifyToken = async (req, res, next) => {
  const { token } = req.body;

  if (!token) next(new ErrorHandler(404, errorMessages.TOKEN_NOT_FOUND));

  try {
    const tokenConfig = await jwt.verify(token, process.env.JWT_SECRET);

    res.status(200).json({
      token,
      tokenConfig
    })
  } catch (error) {
    return next(new ErrorHandler(401, errorMessages.INVALID_TOKEN));
  }
}

module.exports.getHomeData = async (req, res, next) => {
  const currentMonthByNumber = moment().month() + 1; // from Jun 0 to Dec 11
  try {
    const offices = await Office.find({ office: ['tripoli', 'benghazi'] });

    const activeOrdersCount = await Orders.count({ isFinished: false, unsureOrder: false, isCanceled: false });

    const totalDebts = await Orders.aggregate([
      { $match: { 'debt.total': { $ne: 0 } } },
      { $group: { _id: { office: '$placedAt', currency: '$debt.currency'}, totalDebts: { $sum: '$debt.total' } } },
      { $project: { _id: 0, office: '$_id.office', currency: '$_id.currency', totalDebts: 1 } },
      { $sort: { office: 1 , currency: -1 } }
    ])

    const totalInvoices = (await Orders.aggregate([
      { $addFields: { 'month': { $month: '$createdAt' } } },
      { $match: { isFinished: false, unsureOrder: false, isCanceled: false, month: currentMonthByNumber } },
      { $group: { _id: '$month', totalInvoices: { $sum: '$totalInvoice' } } },
      { $project: { totalInvoices: 1, _id: 0 } },
    ]))[0]?.totalInvoices || 0;

    const thisMonthlyEarning = (await Orders.aggregate([
      { $addFields: { 'month': { $month: '$createdAt' } } },
      { $match: { isFinished: false, unsureOrder: false, isCanceled: false, month: currentMonthByNumber } },
      { $unwind: '$netIncome' },
      { $group: { _id: '$month', totalNetOfMonth: { $sum: '$netIncome.total' } } },
      { $project: { _id: 0, totalNetOfMonth: 1 } },
    ]))[0]?.totalNetOfMonth || 0;

    const previousMonthlyEarning = (await Orders.aggregate([
      { $addFields: { 'month': { $month: '$createdAt' } } },
      { $match: { isFinished: false, unsureOrder: false, isCanceled: false, month: currentMonthByNumber - 1 } },
      { $unwind: '$netIncome' },
      { $group: { _id: '$month', totalNetOfMonth: { $sum: '$netIncome.total' } } },
      { $project: { _id: 0, totalNetOfMonth: 1 } },
    ]))[0]?.totalNetOfMonth || 0;

    const thisShipmentMonthlyEarning = (await Orders.aggregate([
      { $addFields: { 'month': { $month: '$createdAt' } } },
      { $match: { isFinished: false, unsureOrder: false, isCanceled: false, month: currentMonthByNumber } },
      { $unwind: '$paymentList' },
      {
        $group: {
          _id: '$month', totalNetOfMonth: {
            $sum: {
              $multiply: ['$paymentList.deliveredPackages.weight.total', { $subtract: ['$paymentList.deliveredPackages.exiosPrice', '$paymentList.deliveredPackages.originPrice'] }]
            }
          }
        }
      },
      { $project: { _id: 0, totalNetOfMonth: 1 } },
    ]))[0]?.totalNetOfMonth || 0;

    const previousShipmentMonthlyEarning = (await Orders.aggregate([
      { $addFields: { 'month': { $month: '$createdAt' } } },
      { $match: { isFinished: false, unsureOrder: false, isCanceled: false, month: currentMonthByNumber - 1 } },
      { $unwind: '$paymentList' },
      {
        $group: {
          _id: '$month', totalNetOfMonth: {
            $sum: {
              $multiply: ['$paymentList.deliveredPackages.weight.total', { $subtract: ['$paymentList.deliveredPackages.exiosPrice', '$paymentList.deliveredPackages.originPrice'] }]
            }
          }
        }
      },
      { $project: { _id: 0, totalNetOfMonth: 1 } },
    ]))[0]?.totalNetOfMonth || 0;

    const thisMonthlyEarningPercentage = ((thisMonthlyEarning + thisShipmentMonthlyEarning) * 100) / totalInvoices;
    const previousMonthlyEarningPercentage = ((previousMonthlyEarning + previousShipmentMonthlyEarning) * 100) / totalInvoices;

    res.status(200).json({
      monthlyEarning: [
        {
          type: 'payment',
          total: thisMonthlyEarning,
        },
        {
          type: 'shipment',
          total: thisShipmentMonthlyEarning,
        }
      ],
      totalMonthlyEarning: thisMonthlyEarning + thisShipmentMonthlyEarning,
      betterThenPreviousMonth: (thisMonthlyEarning + thisShipmentMonthlyEarning) > (previousMonthlyEarning + previousShipmentMonthlyEarning),
      percentage: Math.floor(Math.abs(thisMonthlyEarningPercentage - previousMonthlyEarningPercentage)),
      activeOrdersCount,
      totalInvoices,
      offices,
      totalDebts
    })
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, errorMessages.SERVER_ERROR));
  }
}
