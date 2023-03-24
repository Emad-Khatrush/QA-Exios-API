const express = require('express');

const sendMessages = require('../controllers/sendMessages');
const { protect, isAdmin, isEmployee } = require('../middleware/check-auth');

const router  = express.Router();

router.route('/sendWhatsupMessage')
      .post(protect, isAdmin, isEmployee, sendMessages.sendWhatsupMessage)

module.exports = router;
