const express = require('express');
const ativities = require('../controllers/activities');
const { protect } = require('../middleware/check-auth');

const router  = express.Router();

router.route('/activities')
      .get(protect, ativities.getActivities);

module.exports = router;
