const Task = require('../models/task');
const ErrorHandler = require('../utils/errorHandler');
const { errorMessages } = require('../constants/errorTypes');
const Order = require('../models/order');
const { uploadToGoogleCloud } = require('../utils/googleClould');
const Comment = require('../models/comment');

module.exports.getMyTasks = async (req, res, next) => {
  const { taskType } = req.query;
  try {
    const nowDate = new Date();
    nowDate.setDate(nowDate.getDate() - 2);
    let mongoQuery = {
      new: { $or: [ { reviewers: { $in: [req.user._id] } } ], status: 'processing', createdAt: { $gte: nowDate } },
      urgent: { $or: [ { reviewers: { $in: [req.user._id] } } ], status: 'processing', label: 'urgent' },
      myTasks: { $or: [ { reviewers: { $in: [req.user._id] } } ], status: 'processing' },
      requestedTasks: { createdBy: req.user._id, status: 'processing' },
      needsApproval: { $or: [ { reviewers: { $in: [req.user._id] } }, { createdBy: req.user._id } ], status: 'needsApproval' },
      finished: { $or: [ { reviewers: { $in: [req.user._id] } }, { createdBy: req.user._id } ], status: 'finished' }
    };
    let tasks = await Task.aggregate([
      { $match: mongoQuery[taskType] }
    ]);
    tasks = await Task.populate(tasks, [{ path: 'reviewers' }, { path: 'order' }, { path: 'createdBy' }, { path: 'comments' }]);

    let newCount = await Task.count(mongoQuery['new']);
    let myTasksCount = await Task.count(mongoQuery['myTasks']);
    let urgentCount = await Task.count(mongoQuery['urgent']);
    let requestedTasksCount = await Task.count(mongoQuery['requestedTasks']);
    let needsApproval = await Task.count(mongoQuery['needsApproval']);
    let finishedCount = await Task.count(mongoQuery['finished']);

    // add count list
    res.status(200).json({
      results: tasks,
      countList: {
        newCount,
        myTasksCount,
        urgentCount,
        finishedCount,
        requestedTasksCount,
        needsApproval
      }
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, errorMessages.SERVER_ERROR));
  }
}

module.exports.createTask = async (req, res, next) => {
  try {
    if (!req.body) {
      return next(new ErrorHandler(400, errorMessages.FIELDS_EMPTY));
    }
    const { orderId, title, description, label, limitedTime } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return next(new ErrorHandler(400, errorMessages.ORDER_NOT_FOUND));
    }

    const files = [];
    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const uploadedImg = await uploadToGoogleCloud(req.files[i], "exios-admin-tasks");
        files.push({
          path: uploadedImg.publicUrl,
          filename: uploadedImg.filename,
          folder: uploadedImg.folder,
          bytes: uploadedImg.bytes,
          fileType: req.files[i].mimetype
        });
      }
    }
  
    const reviewers = JSON.parse(req.body.reviewers[1]);

    const tasks = await Task.create({
      order: order,
      createdBy: req.user,
      title,
      description,
      label,
      files,
      reviewers,
      limitedTime
    })

    res.status(200).json(tasks);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, errorMessages.SERVER_ERROR));
  }
}

module.exports.getTask = async (req, res, next) => {
  try {
    const { id } = req.params
    const task = await Task.findOne({ _id: id }).populate(['order', 'createdBy', 'reviewers', 'comments']);
    
    if (!task) next(new ErrorHandler(404, errorMessages.TASK_NOT_FOUND));

    res.status(200).json(task);

  } catch (error) {
    return next(new ErrorHandler(404, errorMessages.SERVER_ERROR));
  }
}

module.exports.uploadFiles= async (req, res, next) => {
  const { id } = req.body;
  
  const images = [];
  const changedFields = [];

    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const uploadedImg = await uploadToGoogleCloud(req.files[i], "exios-admin-tasks");
        images.push({
          path: uploadedImg.publicUrl,
          filename: uploadedImg.filename,
          folder: uploadedImg.folder,
          bytes: uploadedImg.bytes,
          category: req.body.type,
          fileType: req.files[i].mimetype
        });
        changedFields.push({
          label: 'image',
          value: 'image',
          changedFrom: '',
          changedTo: uploadedImg.publicUrl
        })
      }
    }

  const task = await Task.findByIdAndUpdate(id, {
    $push: { "files": images },
  }, { safe: true, upsert: true, new: true });

  // await Activities.create({
  //   user: req.user,
  //   details: {
  //     path: '/invoices',
  //     status: 'added',
  //     type: 'order',
  //     actionName: 'image',
  //     actionId: task._id
  //   },
  //   changedFields
  // })

  res.status(200).json(task)
}

module.exports.updateTask = async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(new ErrorHandler(404, errorMessages.TASK_NOT_FOUND));

  try {
    const order = await Order.findOne({ orderId: req.body.orderId });
    if (!order) {
      return next(new ErrorHandler(400, errorMessages.ORDER_NOT_FOUND));
    }
    
    const updateQuery = {
      ...req.body,
      $set: { "reviewers": req.body.reviewers },
    }
    
    const task = await Task.findByIdAndUpdate(String(id), updateQuery, { safe: true, upsert: true, new: true }).populate(['order', 'createdBy', 'reviewers', 'comments']);
    if (!task) return next(new ErrorHandler(404, errorMessages.TASK_NOT_FOUND));

    // await Activities.create({
    //   user: req.user,
    //   details: {
    //     path: '/invoices',
    //     status: 'updated',
    //     type: 'order',
    //     actionId: newOrder._id
    //   },
    //   changedFields
    // });
    res.status(200).json(task);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}
module.exports.deleteFile = async (req, res, next) => {
  try {
    const task = await Task.findByIdAndUpdate(req.body.id, {
      $pull: {
        files: {
          filename: req.body.file.filename
        }
      }
    }, { safe: true, upsert: true, new: true });

    // const response = await cloudinary.uploader.destroy(req.body.image.filename);
    // if (response.result !== 'ok') {
    //   return next(new ErrorHandler(404, errorMessages.IMAGE_NOT_FOUND));
    // }

    // await Activities.create({
    //   user: req.user,
    //   details: {
    //     path: '/invoices',
    //     status: 'deleted',
    //     type: 'order',
    //     actionName: 'image',
    //     actionId: order._id
    //   },
    //   changedFields: [{
    //     label: 'image',
    //     value: 'image',
    //     changedFrom: req.body.image.path,
    //     changedTo: ''
    //   }]
    // })
    
    res.status(200).json(task);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.changeTaskStatus = async (req, res, next) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, {
      status: req.body.status
    }, { safe: true, upsert: true, new: true });
    res.status(200).json(task);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.getComments = async (req, res, next) => {
  try {
    let task = await Task.findOne({ _id: req.params.id });
    if (!task) {
      return next(new ErrorHandler(400, errorMessages.TASK_NOT_FOUND));
    }

    const comments = await Comment.find({ task }).sort({ createdAt: -1 }).populate('createdBy');
    
    res.status(200).json(comments);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}

module.exports.createComment = async (req, res, next) => {
  try {
    let task = await Task.findOne({ _id: req.params.id });
    if (!task) {
      return next(new ErrorHandler(400, errorMessages.TASK_NOT_FOUND));
    }

    const comment = await Comment.create({
      createdBy: req.user,
      message: req.body.message,
      task
    });

    const updateQuery = {
      $push: { "comments": comment },
    }
    
    task = await Task.findByIdAndUpdate(String(req.params.id), updateQuery, { safe: true, upsert: true, new: true }).populate(['order', 'createdBy', 'reviewers']);
    res.status(200).json(task);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(404, error.message));
  }
}
