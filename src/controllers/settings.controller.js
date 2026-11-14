const MetaConfig = require("../models/MetaConfig");
const User = require("../models/User");
const {
  publicConfig,
  saveConfig
} = require("../services/meta-config.service");

function configOwnerId(req) {
  return req.user.role === "admin" && req.body.userId
    ? req.body.userId
    : req.user._id;
}

async function getConfig(req, res, next) {
  try {
    if (req.user.role === "admin" && !req.query.userId) {
      const configs = await MetaConfig.find().sort({ updatedAt: -1 });
      return res.json({
        success: true,
        data: configs.map((config) => ({
          ownerId: config.ownerId,
          ...publicConfig(config)
        }))
      });
    }

    const ownerId = req.user.role === "admin" && req.query.userId
      ? req.query.userId
      : req.user._id;
    const config = await MetaConfig.findOne({ ownerId });
    return res.json({ success: true, data: config ? publicConfig(config) : null });
  } catch (error) {
    return next(error);
  }
}

async function putConfig(req, res, next) {
  try {
    const ownerId = configOwnerId(req);
    if (req.user.role === "admin" && req.body.userId) {
      const userExists = await User.exists({ _id: ownerId });
      if (!userExists) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
    }

    const config = await saveConfig(ownerId, req.body);
    return res.json({ success: true, data: publicConfig(config) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That WhatsApp phone number is already configured for another account"
      });
    }
    if (
      error.message.endsWith("is required") ||
      error.message === "isActive must be a boolean" ||
      error.message.startsWith("graphApiVersion")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

async function deactivateConfig(req, res, next) {
  try {
    const ownerId = req.user.role === "admin" && req.body.userId
      ? req.body.userId
      : req.user._id;
    const config = await MetaConfig.findOneAndUpdate(
      { ownerId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!config) {
      return res.status(404).json({ success: false, message: "WhatsApp settings not found" });
    }
    return res.json({ success: true, data: publicConfig(config) });
  } catch (error) {
    return next(error);
  }
}

module.exports = { deactivateConfig, getConfig, putConfig };
