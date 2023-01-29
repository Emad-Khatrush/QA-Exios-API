const express = require('express');

const users = require('../controllers/users');
const { protect } = require('../middleware/check-auth');

const router  = express.Router();

router.route('/employeeHome')
      .get(protect, users.getEmpoyeeHomeData)

router.route('/home')
      .get(protect, users.getHomeData)

router.route('/employees')
      .get(protect, users.getEmployees)

router.post('/account/create', users.createUser);

router.route('/account/update')
      .put(protect, users.updateUser);

router.post('/verifyToken', users.verifyToken);

router.post('/login', users.login);

module.exports = router;