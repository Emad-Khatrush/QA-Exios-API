const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const commentSchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  message: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Comment", commentSchema);
