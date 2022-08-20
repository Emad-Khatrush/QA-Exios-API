const express = require('express');
const expenses = require('../controllers/expenses');
const { protect } = require('../middleware/check-auth');
const multer = require('multer');

// cloudinary settings
// const { storage } = require('../utils/cloudinary');
const upload = multer();

const router  = express.Router();

router.route('/expenses')
      .get(protect, expenses.getExpenses)
      .post(protect, upload.array('files'), expenses.createExpense);

      
      router.route('/expense/uploadFiles')
      .post(protect, upload.array('files'), expenses.uploadFiles);
      
      router.route('/expense/deleteFiles')
      .delete(protect, expenses.deleteFiles);

      router.route('/expense/:id')
            .get(protect, expenses.getExpense)
            .put(protect, expenses.updateExpense);

module.exports = router;
