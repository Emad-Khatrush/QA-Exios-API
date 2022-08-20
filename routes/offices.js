const express = require('express');

const { getOffice, createOffice } = require('../controllers/offices');
const { protect } = require('../middleware/check-auth');

const router  = express.Router();

router.route('/office/:officeName')
      .get(protect, getOffice)

router.route('/office')
      .post(createOffice)

module.exports = router;
