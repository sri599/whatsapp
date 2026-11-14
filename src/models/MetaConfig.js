const mongoose = require("mongoose");

const metaConfigSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    appId: { type: String, required: true },
    businessAccountId: { type: String, required: true },
    phoneNumberId: { type: String, required: true, unique: true, index: true },
    graphApiVersion: { type: String, required: true },
    encryptedSecrets: {
      accessToken: { type: String, required: true },
      appSecret: { type: String, required: true },
      verifyToken: { type: String, required: true }
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("MetaConfig", metaConfigSchema);
