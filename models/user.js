const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  customerId: {
    type: String,
    unique: true
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  imgUrl: {
    type: String,
  },
  orders: [{
    type: Schema.Types.ObjectId,
    ref: "Order",
  }],
  roles: {
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isEmployee: {
      type: Boolean,
      default: false,
    },
    isClient: {
      type: Boolean,
      default: false,
    },
  }
}, { timestamps: true });

userSchema.methods.matchPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
}

userSchema.methods.getSignedToken = function() {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  })
}

module.exports = mongoose.model("User", userSchema);
