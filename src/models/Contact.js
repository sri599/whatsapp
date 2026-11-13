const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    whatsappUserId: { type: String, required: true, unique: true },
    phoneNumber: { type: String, index: true },
    name: { type: String, default: null },
    profileName: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", contactSchema);
