const Task = require('../models/task');
const ErrorHandler = require('../utils/errorHandler');
const { errorMessages } = require('../constants/errorTypes');
const Order = require('../models/order');
const { uploadToGoogleCloud } = require('../utils/googleClould');

module.exports.getMyTasks = async (req, res, next) => {
  const { taskType } = req.query;
  try {
    let tasks = await Task.find({ $or: [ { reviewers: { $in: [req.user._id] } } ] }).populate(['order', 'createdBy', 'reviewers']).sort({ createdAt: -1 });
    let requestedTasks = await Task.find({ createdBy: req.user._id }).populate(['order', 'createdBy', 'reviewers']).sort({ createdAt: -1 });
    let newCount = 0;
    let myTasksCount = 0;
    let urgentCount = 0;
    let requestedTasksCount = requestedTasks.length;
    let finishedCount = 0;
    
    tasks.forEach(task => {
      var nowDate = new Date();
      nowDate.setDate(nowDate.getDate() - 2);
      if (task.createdAt >= nowDate) newCount++;
      
      if (task.status === 'processing') myTasksCount++;

      if (task.label === 'urgent') {
        urgentCount++;
      }
      
      if (task.status === 'finished') {
        finishedCount++;
      }
    });

    if (taskType === 'new') {
      var nowDate = new Date();
      // get last 2 date
      nowDate.setDate(nowDate.getDate() - 2);
      tasks = tasks.filter((task) => task.createdAt >= nowDate);
    } else if (taskType === 'urgent') {
      tasks = tasks.filter((task) => task.label === taskType);
    } else if (taskType === 'finished') {
      tasks = tasks.filter((task) => task.status === taskType);
    } else if (taskType === 'requestedTasks') {
      tasks = requestedTasks;
    } else {
      tasks = tasks.filter((task) => task.status === 'processing');
    }

    // add count list
    res.status(200).json({
      results: tasks,
      countList: {
        newCount,
        myTasksCount,
        urgentCount,
        finishedCount,
        requestedTasksCount
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
    const task = await Task.findOne({ _id: id }).populate(['order', 'createdBy', 'reviewers']);
    
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
    
    const task = await Task.findByIdAndUpdate(String(id), updateQuery, { safe: true, upsert: true, new: true }).populate(['order', 'createdBy', 'reviewers']);
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
