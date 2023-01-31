const express = require('express');

const tasks = require('../controllers/tasks');
const { protect } = require('../middleware/check-auth');
const multer = require('multer');
const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
            fileSize: 10 * 1024 * 1024, // No larger than 5mb, change as you need
      },
});
const router  = express.Router();

router.route('/mytasks')
      .get(protect, tasks.getMyTasks)

router.route('/task/:id')
      .get(protect, tasks.getTask)
      .put(protect, tasks.updateTask)

router.route('/task/:id/status')
      .put(protect, tasks.changeTaskStatus)

router.route('/create/task')
      .post(protect, upload.array('files'), tasks.createTask)

router.route('/task/uploadFiles')
      .post(protect, upload.array('files'), tasks.uploadFiles)
      .delete(protect, tasks.deleteFile)

router.route('/task/:id/comments')
      .get(protect, tasks.getComments)
      .post(protect, tasks.createComment)

module.exports = router;
