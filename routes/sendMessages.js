const express = require('express');

const sendMessages = require('../controllers/sendMessages');
const { protect } = require('../middleware/check-auth');

const router  = express.Router();

router.route('/sendWhatsupMessage')
      .post(protect, sendMessages.sendWhatsupMessage)

module.exports = router;
