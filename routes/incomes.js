const express = require('express');
const incomes = require('../controllers/incomes');
const { protect } = require('../middleware/check-auth');
const multer = require('multer');

const upload = multer();

const router  = express.Router();

router.route('/incomes')
      .get(protect, incomes.getIncomes)
      .post(protect, upload.array('files'), incomes.createIncome);
      
router.route('/income/:id')
      .get(protect, incomes.getIncome)
      .put(protect, incomes.updateIncome);

router.route('/income/uploadFiles')
      .post(protect, upload.array('files'), incomes.uploadFiles);

router.route('/income/deleteFiles')
      .delete(protect, incomes.deleteFiles);


module.exports = router;
