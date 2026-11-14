const Contact = require("../models/Contact");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

function ownerFilter(req) {
  return req.user.role === "admin" ? {} : { ownerId: req.user._id };
}

async function listContacts(req, res, next) {
  try {
    const filter = ownerFilter(req);
    const search = String(req.query.search || "").trim();
    if (search) {
      filter.$or = [
        { name: new RegExp(escapeRegex(search), "i") },
        { profileName: new RegExp(escapeRegex(search), "i") },
        { phoneNumber: new RegExp(escapeRegex(search), "i") }
      ];
    }

    const contacts = await Contact.find(filter).sort({ updatedAt: -1 }).limit(200);
    return res.json({ success: true, data: contacts });
  } catch (error) {
    return next(error);
  }
}

async function listConversations(req, res, next) {
  try {
    const filter = ownerFilter(req);
    if (req.query.status && ["open", "closed"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const conversations = await Conversation.find(filter)
      .populate("contactId")
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(200);
    return res.json({ success: true, data: conversations });
  } catch (error) {
    return next(error);
  }
}

async function getMessages(req, res, next) {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      ...ownerFilter(req)
    });
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && Number.isNaN(before.getTime())) {
      return res.status(400).json({ success: false, message: "before must be a valid date" });
    }
    const filter = { conversationId: conversation._id };
    if (before) filter.createdAt = { $lt: before };
    const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(limit);
    return res.json({ success: true, data: messages.reverse() });
  } catch (error) {
    return next(error);
  }
}

async function updateConversation(req, res, next) {
  try {
    if (!["open", "closed"].includes(req.body.status)) {
      return res.status(400).json({ success: false, message: "status must be open or closed" });
    }
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.conversationId, ...ownerFilter(req) },
      { $set: { status: req.body.status } },
      { new: true }
    );
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }
    return res.json({ success: true, data: conversation });
  } catch (error) {
    return next(error);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { getMessages, listContacts, listConversations, updateConversation };
