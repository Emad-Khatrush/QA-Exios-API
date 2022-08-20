const Orders = require('../models/order');
const Activities = require('../models/activities');
const orderid = require('order-id')('key');
const ErrorHandler = require('../utils/errorHandler');
const { uploadFromBuffer } = require('../utils/cloudinary');
const { errorMessages } = require('../constants/errorTypes');
const Offices = require('../models/office');
const { addChangedField, getTapTypeQuery } = require('../middleware/helper');
const { orderLabels } = require('../constants/orderLabels');
const mongoose = require('mongoose');

module.exports.getInvoices = async (req, res, next) => {
  try {
    const orders = await Orders.find({});
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
    const orders = await Orders.find(tabTypeQuery).populate('user').sort({ createdAt: -1 }).skip(skip).limit(limit);
    const totalOrders = await Orders.count();
    const activeOrders = await Orders.aggregate([
      { $match: { isFinished: false,  unsureOrder: false } },
    ])

    const shipmentOrders = await Orders.aggregate([
      { $match: { isShipment: true,  unsureOrder: false, isPayment: false,  isFinished: false } },
    ])

    const arrivingOrders = await Orders.aggregate([
      { $match: { isPayment: true,  orderStatus: 1 } },
    ])

    const unpaidOrders = await Orders.aggregate([
      { $match: { unsureOrder: false,  orderStatus: 0, isPayment: true } },
    ])

    const finishedOrders = await Orders.aggregate([
      { $match: { isFinished: true } },
    ])
    
    const unsureOrders = await Orders.aggregate([
      { $match: { unsureOrder: true } },
    ])
    
    res.status(200).json({
      orders,
      activeOrdersCount: activeOrders.length,
      shipmentOrdersCount: shipmentOrders.length,
      finishedOrdersCount: finishedOrders.length,
      unpaidOrdersCount: unpaidOrders.length,
      unsureOrdersCount: unsureOrders.length,
      arrivingOrdersCount: arrivingOrders.length,
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
    const activeOrders = await Orders.aggregate([
      { $match: { isFinished: false,  unsureOrder: false } },
    ])

    const shipmentOrders = await Orders.aggregate([
      { $match: { isShipment: true,  unsureOrder: false, isPayment: false,  isFinished: false } },
    ])

    const arrivingOrders = await Orders.aggregate([
      { $match: { isPayment: true,  orderStatus: 1 } },
    ])

    const unpaidOrders = await Orders.aggregate([
      { $match: { unsureOrder: false,  orderStatus: 0 } },
    ])

    const finishedOrders = await Orders.aggregate([
      { $match: { isFinished: true } },
    ])
    
    const unsureOrders = await Orders.aggregate([
      { $match: { unsureOrder: true } },
    ])
    
    const orders = await Orders.aggregate(query);
    res.status(200).json({
      orders,
      activeOrdersCount: activeOrders.length,
      shipmentOrdersCount: shipmentOrders.length,
      finishedOrdersCount: finishedOrders.length,
      unpaidOrdersCount: unpaidOrders.length,
      unsureOrdersCount: unsureOrders.length,
      arrivingOrdersCount: arrivingOrders.length,
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
    const { fullName, email, phone, fromWhere, toWhere, method, exiosShipmentPrice, originShipmentPrice, weight, packageCount, netIncome, currency, debt } = req.body;
    const orderId = orderid.generate().slice(7, 17);
    const isOrderIdTaken = await Orders.findOne({ orderId });
    if (!!isOrderIdTaken) {
      return next(new ErrorHandler(400, errorMessages.ORDER_ID_TAKEN));
    }

    const images = [];
    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const uploadedImg = await uploadFromBuffer(req.files[i], "exios-admin-invoices");
        images.push({
          path: uploadedImg.secure_url,
          filename: uploadedImg.public_id,
          folder: uploadedImg.folder,
          bytes: uploadedImg.bytes,
          category: req.body.invoicesCount > i ? 'invoice' : 'receipts'
        });
      }
    }

    const paymentList = JSON.parse(req.body.paymentList).map(data => ({
      link: data.paymentLink,
      status: {
        arrived: data.arrived,
        paid: data.paid,
      },
      deliveredPackages: {
        weight: {
          total: data.deliveredPackages?.weight,
          measureUnit: data.deliveredPackages?.measureUnit
        },
        trackingNumber: data.deliveredPackages?.trackingNumber,
        originPrice: data.deliveredPackages.originPrice,
        exiosPrice: data.deliveredPackages.exiosPrice
      },
      note: data.note,
    }))

    const order = await Orders.create({
      ...req.body,
      user: req.user,
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

    // add money if the office received
    if (order.receivedShipmentUSD !== 0) {
      await Offices.findOneAndUpdate({ office: order.placedAt }, {
        $inc: {
          'usaDollar.value': order.receivedShipmentUSD
        }
      }, {
        new: true
      });
    }

    if (order.receivedShipmentLYD !== 0) {
      await Offices.findOneAndUpdate({ office: order.placedAt }, {
        $inc: {
          'libyanDinar.value': order.receivedShipmentLYD
        }
      }, {
        new: true
      });
    }

    if (order.receivedUSD !== 0) {
      await Offices.findOneAndUpdate({ office: order.placedAt }, {
        $inc: {
          'usaDollar.value': order.receivedUSD
        }
      }, {
        new: true
      });
    }
    if (order.receivedLYD !== 0) {
      await Offices.findOneAndUpdate({ office: order.placedAt }, {
        $inc: {
          'libyanDinar.value': order.receivedLYD
        }
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
    let query = { orderId : String(id) };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    }
    const order = await Orders.findOne(query);

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
    const newOrder = await Orders.findOneAndUpdate({ _id: String(id) }, update, { new: true });
    if (!newOrder) return next(new ErrorHandler(404, errorMessages.ORDER_NOT_FOUND));
    
    // calculate the revenue of the order
    const dollarDifference =  newOrder.receivedUSD - oldOrder.receivedUSD;
    const dinnarDifference =  newOrder.receivedLYD - oldOrder.receivedLYD;

    const dinnarShipmentDifference =  newOrder.receivedShipmentLYD - oldOrder.receivedShipmentLYD;
    const dollarShipmentDifference =  newOrder.receivedShipmentUSD - oldOrder.receivedShipmentUSD;

    if (dollarShipmentDifference !== 0) {
      await Offices.findOneAndUpdate({ office: newOrder.placedAt }, {
        $inc: {
          'usaDollar.value': dollarShipmentDifference
        }
      }, {
        new: true
      });
    }
    if (dinnarShipmentDifference !== 0) {
      await Offices.findOneAndUpdate({ office: newOrder.placedAt }, {
        $inc: {
          'libyanDinar.value': dinnarShipmentDifference
        }
      }, {
        new: true
      });
    }

    if (dollarDifference !== 0) {
      await Offices.findOneAndUpdate({ office: newOrder.placedAt }, {
        $inc: {
          'usaDollar.value': dollarDifference
        }
      }, {
        new: true
      });
    }
    if (dinnarDifference !== 0) {
      await Offices.findOneAndUpdate({ office: newOrder.placedAt }, {
        $inc: {
          'libyanDinar.value': dinnarDifference
        }
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
        fromWhere: '.',
        toWhere: '.',
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

module.exports.uploadFiles= async (req, res, next) => {
  const { id } = req.body;

  const images = [];
  const changedFields = [];

    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const uploadedImg = await uploadFromBuffer(req.files[i], "exios-admin-invoices");
        images.push({
          path: uploadedImg.secure_url,
          filename: uploadedImg.public_id,
          folder: uploadedImg.folder,
          bytes: uploadedImg.bytes,
          category: req.body.type
        });
        changedFields.push({
          label: 'image',
          value: 'image',
          changedFrom: '',
          changedTo: uploadedImg.secure_url
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
