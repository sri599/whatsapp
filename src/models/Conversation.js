const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true
    },
    whatsappPhoneNumberId: { type: String, required: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    lastMessageAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
