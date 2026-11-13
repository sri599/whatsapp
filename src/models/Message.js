const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    // Unique: Meta can retry webhooks, so this prevents duplicates.
    whatsappMessageId: { type: String, required: true, unique: true },
    direction: { type: String, enum: ["incoming", "outgoing"], required: true },
    messageType: { type: String, required: true },
    messageText: { type: String, default: null },
    mediaId: { type: String, default: null },
    status: {
      type: String,
      enum: ["received", "sent", "delivered", "read", "failed"],
      default: "received"
    },
    whatsappTimestamp: { type: Date, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
