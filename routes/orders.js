const express = require('express');

const orders = require('../controllers/orders');
const { protect } = require('../middleware/check-auth');
const multer = require('multer');

// cloudinary settings
const { storage } = require('../utils/cloudinary');
const upload = multer({ storage });

const router  = express.Router();

router.route('/invoices')
      .get(protect, orders.getInvoices);

router.route('/orders')
      .get(protect, orders.getOrders)
      .post(protect, upload.array('files'), orders.createOrder);

router.route('/orders/:searchValue/:searchType')
      .get(orders.getOrdersBySearch)

router.route('/unsureOrder/add')
      .post(protect, orders.createUnsureOrder);

router.route('/order/uploadFiles')
      .post(protect, upload.array('files'), orders.uploadFiles);
      
router.route('/order/deleteFiles')
      .delete(protect, orders.deleteFiles);

router.route('/order/:id')
      .get(orders.getOrder)
      .put(protect, orders.updateOrder);

router.route('/order/:id/addActivity')
      .post(protect, orders.createOrderActivity)

module.exports = router;
