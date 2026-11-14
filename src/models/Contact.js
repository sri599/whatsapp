const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    whatsappUserId: { type: String, required: true },
    phoneNumber: { type: String, index: true },
    name: { type: String, default: null },
    profileName: { type: String, default: null }
  },
  { timestamps: true }
);

contactSchema.index({ ownerId: 1, whatsappUserId: 1 }, { unique: true });

module.exports = mongoose.model("Contact", contactSchema);
