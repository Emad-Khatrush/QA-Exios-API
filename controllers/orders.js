const Orders = require('../models/order');
const Activities = require('../models/activities');
const orderid = require('order-id')('key');
const ErrorHandler = require('../utils/errorHandler');
const { uploadToGoogleCloud } = require('../utils/googleClould');
const { errorMessages } = require('../constants/errorTypes');
const Offices = require('../models/office');
const { addChangedField, getTapTypeQuery, convertObjDataFromStringToNumberType } = require('../middleware/helper');
const { orderLabels } = require('../constants/orderLabels');
const mongoose = require('mongoose');
const Users = require('../models/user');

module.exports.getInvoices = async (req, res, next) => {
  try {
    const orders = await Orders.find({}).populate(['user', 'madeBy']);
    res.status(200).json({
      orders
    });
  } catch (error) {
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getOrders = async (req, res, next) => {
  try {
    const { limit, skip, tabType } = req.query;
    // await Orders.deleteMany({})
    const tabTypeQuery = getTapTypeQuery(tabType);
    tabTypeQuery.isCanceled = false;
    const orders = await Orders.find(tabTypeQuery).populate('user').sort({ createdAt: -1 }).skip(skip).limit(limit);
    const allOrders = await Orders.find({ isCanceled: false });
    const totalOrders = allOrders.length;

    let activeOrders = 0, arrivingOrders = 0, shipmentOrders = 0, unpaidOrders = 0, finishedOrders = 0, unsureOrders = 0;
    allOrders.forEach((order => {
      if (!order.isFinished &&  !order.unsureOrder) activeOrders++;
      if (order.isShipment &&  !order.unsureOrder && !order.isPayment &&  !order.isFinished) shipmentOrders++;
      if (order.isPayment &&  order.orderStatus === 1) arrivingOrders++;
      if (order.isPayment &&  !order.unsureOrder && order.orderStatus === 0) unpaidOrders++;
      if (order.isFinished) finishedOrders++;
      if (order.unsureOrder) unsureOrders++;
    }))
    
    res.status(200).json({
      orders,
      activeOrdersCount: activeOrders,
      shipmentOrdersCount: shipmentOrders,
      finishedOrdersCount: finishedOrders,
      unpaidOrdersCount: unpaidOrders,
      unsureOrdersCount: unsureOrders,
      arrivingOrdersCount: arrivingOrders,
      tabType: tabType ? tabType : 'active',
      total: totalOrders,
      query: {
        limit: Number(limit),
        skip: Number(skip)
      }
    });
  } catch (error) {
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getOrdersTab = async (req, res, next) => {
  try {
    const { limit, skip, tabType } = req.query;
    // await Orders.deleteMany({})
    const tabTypeQuery = getTapTypeQuery(tabType);
    tabTypeQuery.isCanceled = false;
    const orders = await Orders.find(tabTypeQuery).populate('user').sort({ createdAt: -1 }).skip(skip).limit(limit);
    const totalOrders = await Orders.count();
    
    res.status(200).json({
      orders,
      tabType: tabType ? tabType : 'active',
      total: totalOrders,
      query: {
        limit: Number(limit),
        skip: Number(skip)
      }
    });
  } catch (error) {
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getOrdersBySearch = async (req, res, next) => {
  const { searchValue, searchType } = req.params;
  const { tabType } = req.query;

  let query = [{ $match: { $or: [{orderId: { $regex: new RegExp(searchValue.toLowerCase(), 'i') }}, { 'customerInfo.fullName': { $regex: new RegExp(searchValue.toLowerCase(), 'i') } }] } }];
  const totalOrders = await Orders.count();
  if (searchType === 'trackingNumber') {
    query = [
      { $unwind: '$paymentList' },
      { $match: { $or: [ { 'paymentList.deliveredPackages.trackingNumber': { $regex: new RegExp(searchValue.trim().toLowerCase(), 'i') } }, { 'customerInfo.fullName': { $regex: new RegExp(searchValue.toLowerCase(), 'i') } } ] } }
    ]
  }

  try {
    const orders = await Orders.aggregate(query);
    res.status(200).json({
      orders,
      tabType: tabType ? tabType : 'active',
      total: totalOrders
    })
  } catch (error) {
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.createOrder = async (req, res, next) => {
  try {
    if (!req.body) {
      return next(new ErrorHandler(400, errorMessages.FIELDS_EMPTY));
    }
    const { fullName, email, customerId, phone, fromWhere, toWhere, method, exiosShipmentPrice, originShipmentPrice, weight, packageCount, netIncome, currency, debt } = req.body;
    const orderId = orderid.generate().slice(7, 17);
    const isOrderIdTaken = await Orders.findOne({ orderId });
    if (!!isOrderIdTaken) {
      return next(new ErrorHandler(400, errorMessages.ORDER_ID_TAKEN));
    }

    const user = await Users.findOne({ customerId });
    if (!user) return next(new ErrorHandler(400, errorMessages.USER_NOT_FOUND));

    const images = [];
    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const uploadedImg = await uploadToGoogleCloud(req.files[i], "exios-admin-invoices");
        images.push({
          path: uploadedImg.publicUrl,
          filename: uploadedImg.filename,
          folder: uploadedImg.folder,
          bytes: uploadedImg.bytes,
          category: req.body.invoicesCount > i ? 'invoice' : 'receipts',
          fileType: req.files[i].mimetype
        });
      }
    }

    const paymentList = JSON.parse(req.body.paymentList).map(data => ({
      link: data.paymentLink,
      status: {
        arrived: data.arrived,
        arrivedLibya: data.arrivedLibya,
        paid: data.paid,
        received: data.received
      },
      deliveredPackages: {
        weight: {
          total: data.deliveredPackages?.weight,
          measureUnit: data.deliveredPackages?.measureUnit
        },
        trackingNumber: data.deliveredPackages?.trackingNumber,
        originPrice: data.deliveredPackages.originPrice,
        exiosPrice: data.deliveredPackages.exiosPrice,
        receivedShipmentUSD: data.deliveredPackages.receivedShipmentUSD,
        receivedShipmentLYD: data.deliveredPackages.receivedShipmentLYD,
      },
      note: data.note,
    }))

    const order = await Orders.create({
      ...req.body,
      user,
      orderId,
      customerInfo: {
        fullName,
        email,
        phone
      },
      shipment: {
        fromWhere,
        toWhere,
        method,
        exiosShipmentPrice,
        originShipmentPrice,
        weight,
        packageCount
      },
      netIncome: [{
        nameOfIncome: 'payment',
        total: netIncome
      }],
      debt: {
        currency,
        total: debt
      },
      activity: [{
        country: req.body.placedAt === 'tripoli' ? 'مكتب طرابلس' : 'مكتب بنغازي',
        description: 'في مرحلة تجهيز الطلبية'
      }],
      images,
      paymentList
    });

    await Activities.create({
      user: req.user,
      details: {
        path: '/invoices',
        status: 'added',
        type: 'order',
        actionId: order._id
      }
    })

    let totalIncreaseOfDollar = (order.receivedShipmentUSD + order.receivedUSD) || 0;
    let totalIncreaseOfDinnar = (order.receivedShipmentLYD + order.receivedLYD) || 0;

    // calculate received shipment for each package
    for (let i = 0; i < order.paymentList?.length; i++) {
      console.log(order.paymentList[i]?.deliveredPackages?.receivedShipmentUSD);
      totalIncreaseOfDollar += (order.paymentList[i]?.deliveredPackages?.receivedShipmentUSD || 0);
      totalIncreaseOfDinnar += (order.paymentList[i]?.deliveredPackages?.receivedShipmentLYD || 0);
    }

    const updateQuery = {};

    if (totalIncreaseOfDollar !== 0) {
      updateQuery['usaDollar.value'] = totalIncreaseOfDollar;
    }

    if (totalIncreaseOfDinnar !== 0) {
      updateQuery['libyanDinar.value'] = totalIncreaseOfDinnar;
    }

    if (totalIncreaseOfDollar || totalIncreaseOfDinnar) {
      await Offices.findOneAndUpdate({ office: order.placedAt }, {
        $inc: updateQuery
      }, {
        new: true
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getOrder = async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));

  try {
    let query = { $or: [{ orderId : String(id) }] };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    }
    const order = await Orders.findOne(query).populate(['madeBy', 'user']);

    if (!order) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));
    
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.cancelOrder = async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));

  try {
    let query = { orderId : String(id) };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    }

    const updateQuery = {
      isCanceled: true,
      cancelation: {
        reason: req.body.cancelationReason
      }
    }

    const order = await Orders.findOneAndUpdate(query, updateQuery, { new: true }).populate('madeBy');

    if (!order) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));
    
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.updateOrder = async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));

  try {
    let user;
    if (!!req.body.customerId) {
      user = await Users.findOne({ customerId: req.body.customerId });
      if (!user) return next(new ErrorHandler(400, errorMessages.USER_NOT_FOUND));
    }
    const oldOrder = await Orders.findOne({ _id: String(id) });
    const update = {
      ...req.body,
      customerInfo: {
        ...oldOrder.customerInfo,
        ...req.body.customerInfo
      },
      shipment: {
        ...oldOrder.shipment,
        ...req.body.shipment
      },
      debt: {
        ...oldOrder.debt,
        ...req.body.debt
      }
    }
    if (user) update.user = user;
    const newOrder = await Orders.findOneAndUpdate({ _id: String(id) }, update, { new: true });
    if (!newOrder) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));

    // calculate the revenue of the order
    const dollarDifference =  newOrder.receivedUSD - oldOrder.receivedUSD;
    const dinnarDifference =  newOrder.receivedLYD - oldOrder.receivedLYD;

    const dinnarShipmentDifference =  newOrder.receivedShipmentLYD - oldOrder.receivedShipmentLYD;
    const dollarShipmentDifference =  newOrder.receivedShipmentUSD - oldOrder.receivedShipmentUSD;

    let totalIncreaseOfDollar = dollarDifference + dollarShipmentDifference;
    let totalIncreaseOfDinnar = dinnarDifference + dinnarShipmentDifference;

    // calculate received shipment for each package
    for (let i = 0; i < newOrder.paymentList?.length; i++) {
      totalIncreaseOfDollar += (newOrder.paymentList[i]?.deliveredPackages?.receivedShipmentUSD - (oldOrder.paymentList[i]?.deliveredPackages?.receivedShipmentUSD || 0)) || 0;
      totalIncreaseOfDinnar += (newOrder.paymentList[i]?.deliveredPackages?.receivedShipmentLYD - (oldOrder.paymentList[i]?.deliveredPackages?.receivedShipmentLYD || 0)) || 0;
    }
    const updateQuery = {};

    if (totalIncreaseOfDollar !== 0) {
      updateQuery['usaDollar.value'] = totalIncreaseOfDollar;
    }

    if (totalIncreaseOfDinnar !== 0) {
      updateQuery['libyanDinar.value'] = totalIncreaseOfDinnar;
    }

    if (totalIncreaseOfDollar || totalIncreaseOfDinnar) {
      await Offices.findOneAndUpdate({ office: newOrder.placedAt }, {
        $inc: updateQuery
      }, {
        new: true
      });
    }
    
    // add activity to the order
    const changedFields = [];
    if (Object.keys(req.body).length > 3) {
      for (const fieldName in req.body) {
        if (!(fieldName === 'isPayment' || fieldName === 'orderStatus' || fieldName === 'isFinished' || fieldName === 'isShipment' || fieldName === 'shipment' || fieldName === 'customerInfo' || fieldName === 'netIncome' || fieldName === 'unsureOrder')) {
          changedFields.push(addChangedField(fieldName, newOrder[fieldName], oldOrder[fieldName], orderLabels));
        }
      }
    }
    await Activities.create({
      user: req.user,
      details: {
        path: '/invoices',
        status: 'updated',
        type: 'order',
        actionId: newOrder._id
      },
      changedFields
    });
    res.status(200).json(newOrder);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getPackagesOfOrders = async (req, res, next) => {
  try {
    let packages = await Orders.aggregate([
      {
        $match: { isCanceled: false }
      },
      {
        $unwind: '$paymentList'
      }
    ]);
    packages = await Orders.populate(packages, { path: "madeBy" });

    res.status(200).send(packages);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(400, error.message));
  }
}

module.exports.createUnsureOrder = async (req, res, next) => {
  try {
    if (!req.body) {
      return next(new ErrorHandler(400, errorMessages.FIELDS_EMPTY));
    }
    const orderId = orderid.generate().slice(7, 17);
    const isOrderIdTaken = await Orders.findOne({ orderId });
    if (!!isOrderIdTaken) {
      return next(new ErrorHandler(400, errorMessages.ORDER_ID_TAKEN));
    }
    const order = await Orders.create({
      user: req.user,
      orderId,
      customerInfo: {
        fullName: req.body.fullName,
        phone: req.body.phone,
      },
      placedAt: req.body.placedAt,
      shipment: {
        fromWhere: req.body.fromWhere,
        toWhere: req.body.toWhere,
        method: req.body.method
      },
      isShipment: true,
      unsureOrder: true
    });
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(400, error.message));
  }
}
module.exports.uploadFilesToLinks= async (req, res, next) => {
  const { id, paymentListId } = req.body;
  
  const images = [];
  const changedFields = [];

    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const uploadedImg = await uploadToGoogleCloud(req.files[i], "exios-admin-invoices");
        images.push({
          path: uploadedImg.publicUrl,
          filename: uploadedImg.filename,
          folder: uploadedImg.folder,
          bytes: uploadedImg.bytes,
          fileType: req.files[i].mimetype
        });
        changedFields.push({
          label: 'image',
          value: 'image',
          changedFrom: '',
          changedTo: uploadedImg.publicUrl
        })
      }
    }

  await Orders.updateOne({ _id: id, 'paymentList._id': paymentListId }, {
    $push: { 'paymentList.$.images': images },
  }, { safe: true, upsert: true, new: true });

  const order = await Orders.findOne({ _id: id });

  await Activities.create({
    user: req.user,
    details: {
      path: '/invoices',
      status: 'added',
      type: 'order',
      actionName: 'image',
      actionId: order._id
    },
    changedFields
  })

  res.status(200).json(order);
}

module.exports.uploadFiles= async (req, res, next) => {
  const { id } = req.body;
  
  const images = [];
  const changedFields = [];

    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const uploadedImg = await uploadToGoogleCloud(req.files[i], "exios-admin-invoices");
        images.push({
          path: uploadedImg.publicUrl,
          filename: uploadedImg.filename,
          folder: uploadedImg.folder,
          bytes: uploadedImg.bytes,
          category: req.body.type,
          fileType: req.files[i].mimetype
        });
        changedFields.push({
          label: 'image',
          value: 'image',
          changedFrom: '',
          changedTo: uploadedImg.publicUrl
        })
      }
    }

  const order = await Orders.findByIdAndUpdate(id, {
    $push: { "images": images },
  }, { safe: true, upsert: true, new: true });

  await Activities.create({
    user: req.user,
    details: {
      path: '/invoices',
      status: 'added',
      type: 'order',
      actionName: 'image',
      actionId: order._id
    },
    changedFields
  })

  res.status(200).json(order)
}

module.exports.deleteLinkFiles= async (req, res, next) => {
  try {
    const order = await Orders.findOneAndUpdate({ _id: req.body.id, 'paymentList._id': req.body.paymentListId }, {
      $pull: {
        'paymentList.$.images': {
          filename: req.body.filename
        }
      }
    }, { safe: true, upsert: true, new: true });
    console.log(order.paymentList[1]);

    // const response = await cloudinary.uploader.destroy(req.body.image.filename);
    // if (response.result !== 'ok') {
    //   return next(new ErrorHandler(404, errorMessages.IMAGE_NOT_FOUND));
    // }

    // await Activities.create({
    //   user: req.user,
    //   details: {
    //     path: '/invoices',
    //     status: 'deleted',
    //     type: 'order',
    //     actionName: 'image',
    //     actionId: order._id
    //   },
    //   changedFields: [{
    //     label: 'image',
    //     value: 'image',
    //     changedFrom: req.body.image.path,
    //     changedTo: ''
    //   }]
    // })
    
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.deleteFiles= async (req, res, next) => {
  try {
    const order = await Orders.findByIdAndUpdate(req.body.id, {
      $pull: {
        images: {
          filename: req.body.image.filename
        }
      }
    }, { safe: true, upsert: true, new: true });

    // const response = await cloudinary.uploader.destroy(req.body.image.filename);
    // if (response.result !== 'ok') {
    //   return next(new ErrorHandler(404, errorMessages.IMAGE_NOT_FOUND));
    // }

    await Activities.create({
      user: req.user,
      details: {
        path: '/invoices',
        status: 'deleted',
        type: 'order',
        actionName: 'image',
        actionId: order._id
      },
      changedFields: [{
        label: 'image',
        value: 'image',
        changedFrom: req.body.image.path,
        changedTo: ''
      }]
    })
    
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.createOrderActivity = async (req, res, next) => {
  try {
    const order = await Orders.findByIdAndUpdate(req.params.id, {
      $push: {
        activity: req.body
      }
    }, { new: true });

    await Activities.create({
      user: req.user,
      details: {
        path: '/invoices',
        status: 'added',
        type: 'activity',
        actionId: order._id
      }
    })
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

// Client Interface Controllers
module.exports.getClientHomeData = async (req, res, next) => {
  try {
    const receivedOrders = await Orders.count({ user: req.user._id, isFinished: true, unsureOrder: false });
    const readyForReceivement = await Orders.count({ user: req.user._id, $or: [ { isPayment: true, orderStatus: 4 }, { isPayment: false, orderStatus: 3 } ] });
    const activeOrders = await Orders.count({ user: req.user._id, isCanceled: false, unsureOrder: false, isFinished: false });
    const totalPaidInvoices = (await Orders.aggregate([
      { $match: { user: req.user._id, isCanceled: false, unsureOrder: false } },
      { $group: { _id: 'id', total: { $sum: '$totalInvoice' } } },
      { $project: { _id: 0 } }
    ]))[0]?.total || 0;

    res.status(200).json({
      results: {
        countList: {
          receivedOrders,
          readyForReceivement,
          totalPaidInvoices,
          activeOrders
        }
      }
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getOrdersForUser = async (req, res, next) => {
  try {
    const { type } = req.params;
    const query = convertObjDataFromStringToNumberType(req.query);

    let orders;
    if (type === 'all') {
      orders = await Orders.find({ user: req.user._id, isCanceled: false, unsureOrder: false, isFinished: false }, query).sort({ createdAt: -1 });
    } else {
      const queryType = getTapTypeQuery(type);
      orders = await Orders.find({ ...queryType, user: req.user._id, isCanceled: false }, query).sort({ createdAt: -1 });
    }

    let ordersCountList = (await Orders.aggregate([
      { $match: { isCanceled: false, user: req.user._id } },
      {
        $group: {
          _id: null,
          finishedOrders: {
            $sum: {
              $cond: [
                { $eq: ["$isFinished", true] },
                1,
                0
              ]
            }
          },
          activeOrders: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$isFinished", false] }, { $eq: ["$unsureOrder", false] }] },
                1,
                0
              ]
            }
          },
          unsureOrders: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$isFinished", false] }, { $eq: ["$unsureOrder", true] }] },
                1,
                0
              ]
            }
          },
          warehouseArrived: {
            $sum: {
              $cond: [
                { $and: [ { $or: [{ $and: [{ $eq: ["$isPayment", true] }, { $eq: ["$orderStatus", 2] }] }, { $and: [{ $eq: ["$isPayment", false] }, { $eq: ["$orderStatus", 1] }] }] } ,{ $eq: ["$unsureOrder", false] }] },
                1,
                0
              ]
            }
          },
          readyForReceivement: {
            $sum: {
              $cond: [
                { $and: [ { $or: [{ $and: [{ $eq: ["$isPayment", true] }, { $eq: ["$orderStatus", 4] }] }, { $and: [{ $eq: ["$isPayment", false] }, { $eq: ["$orderStatus", 3] }] }] } ,{ $eq: ["$unsureOrder", false] }] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0
        }
      }
    ]))[0];

    if (!ordersCountList) {
      ordersCountList = {
        finishedOrders: 0,
        activeOrders: 0,
        unsureOrders: 0,
        warehouseArrived: 0,
        readyForReceivement: 0
      }
    }

    res.status(200).json({
      results: {
        orders,
        countList: ordersCountList || []
      }
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getOrdersClientBySearch= async (req, res, next) => {
  const { value } = req.params;

  let query = [
    { $match: { unsureOrder: false, $or: [ {orderId: { $regex: new RegExp(value.toLowerCase(), 'i') }, user: req.user._id}, { 'paymentList.deliveredPackages.trackingNumber': { $regex: new RegExp(value.trim().toLowerCase(), 'i') }, user: req.user._id }, { 'customerInfo.fullName': { $regex: new RegExp(value.toLowerCase(), 'i') }, user: req.user._id } ] } }
  ]

  if (value === '') {
    query = [
      { $match: { user: req.user._id, isCanceled: false, unsureOrder: false } }
    ]
  }

  // sort newest order to top
  query.push({
    $sort: { createdAt: -1 }
  })

  // show only the important fields
  const orderedList = convertObjDataFromStringToNumberType(req.query);
  query.push({
    $project: orderedList
  })

  try {
    const orders = await Orders.aggregate(query);
    res.status(200).json({
      results: {
        orders
      }
    })
  } catch (error) {
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.deleteUnsureOrder = async (req, res, next) => {
  try {
    const order = await Orders.findOne({ user: req.user, _id: req.params.id });
    if (!order) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));
    if (!order.unsureOrder) return next(new ErrorHandler(404, errorMessages.ORDER_CANT_DELETE));

    await Orders.deleteOne({ user: req.user, _id: req.params.id });
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.createTrackingNumbersForClient = async (req, res, next) => {
  try {
    const trackingArray = [];
    req.body.forEach(({ trackingNumber }) => {
      trackingArray.push({
        deliveredPackages: {
          trackingNumber
        }
      })
    })
    const orderId = orderid.generate().slice(7, 17);

    const order = await Orders.create({
      user: req.user,
      orderId,
      customerInfo: {
        fullName: '.',
        phone: 0,
      },
      placedAt: 'tripoli',
      shipment: {
        fromWhere: '.',
        toWhere: '.',
        method: 'air'
      },
      isShipment: true,
      unsureOrder: true,
      paymentList: trackingArray
    });
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getClientOrder = async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));

  const orderedByList = convertObjDataFromStringToNumberType(req.query);
  try {
    let query = { orderId : String(id), user: req.user._id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id, user: req.user._id };
    }
    const order = await Orders.findOne(query, orderedByList);
    if (!order) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));
    order.images = order.images.filter(img => img.category === 'receipts');
    order.paymentList = order.paymentList.filter(package => package.settings.visableForClient);
    
    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}
