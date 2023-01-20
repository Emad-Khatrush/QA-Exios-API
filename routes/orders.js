const express = require('express');

const orders = require('../controllers/orders');
const { protect } = require('../middleware/check-auth');
const multer = require('multer');
// cloudinary settings
const { storage } = require('../utils/cloudinary');
const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
            fileSize: 10 * 1024 * 1024, // No larger than 5mb, change as you need
      },
});

const router  = express.Router();

// Admin Routes
router.route('/invoices')
      .get(protect, orders.getInvoices);

router.route('/orders')
      .get(protect, orders.getOrders)
      .post(protect, upload.array('files'), orders.createOrder);

router.route('/packages/orders')
      .get(protect, orders.getPackagesOfOrders)

router.route('/currentOrdersTab')
      .get(protect, orders.getOrdersTab)

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

router.route('/order/:id/cancel')
      .post(protect, orders.cancelOrder);

router.route('/order/:id/addActivity')
      .post(protect, orders.createOrderActivity)

// Client Routes

router.route('/client/home')
      .get(protect, orders.getClientHomeData)

router.route('/user/:id/orders/:type')
      .get(protect, orders.getOrdersForUser)

router.route('/client/orders/search/:value')
      .get(protect, orders.getOrdersClientBySearch)

router.route('/client/order/:id')
      .get(protect, orders.getClientOrder)

module.exports = router;
