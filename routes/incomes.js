const express = require('express');
const incomes = require('../controllers/incomes');
const { protect, isAdmin } = require('../middleware/check-auth');
const multer = require('multer');

const upload = multer();

const router  = express.Router();

router.route('/incomes')
      .get(protect, isAdmin, incomes.getIncomes)
      .post(protect, isAdmin, upload.array('files'), incomes.createIncome);
      
router.route('/income/:id')
      .get(protect, isAdmin, incomes.getIncome)
      .put(protect, isAdmin, incomes.updateIncome);

router.route('/income/uploadFiles')
      .post(protect, isAdmin, upload.array('files'), incomes.uploadFiles);

router.route('/income/deleteFiles')
      .delete(protect, isAdmin, incomes.deleteFiles);


module.exports = router;
