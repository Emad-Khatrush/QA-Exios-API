const express = require('express');

const users = require('../controllers/users');
const { protect } = require('../middleware/check-auth');

const router  = express.Router();

router.route('/home')
      .get(protect, users.getHomeData)
router.post('/signup', users.createUser);
router.post('/verifyToken', users.verifyToken);
router.post('/login', users.login);

module.exports = router;