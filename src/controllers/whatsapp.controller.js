const Contact = require("../models/Contact");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const MetaConfig = require("../models/MetaConfig");
const path = require("path");
const { decrypt } = require("../utils/secrets");
const {
  findActiveConfigByPhoneNumberId,
  findWebhookConfig,
  verifyWebhookSignature
} = require("../services/meta-config.service");
const { sendWhatsAppMessage, uploadMedia } = require("../services/whatsapp.service");

const mediaTypes = new Set(["image", "video", "audio", "document"]);

async function verifyWebhook(req, res, next) {
  try {
    const config = await findWebhookConfig(req.query["hub.verify_token"]);
    if (req.query["hub.mode"] === "subscribe" && config) {
      return res.status(200).send(req.query["hub.challenge"]);
    }
    return res.sendStatus(403);
  } catch (error) {
    return next(error);
  }
}

async function receiveWebhook(req, res, next) {
  try {
    const validSignature = await verifyWebhookSignature(
      req.rawBody,
      req.get("X-Hub-Signature-256")
    );
    if (!validSignature) {
      return res.sendStatus(401);
    }
  } catch (error) {
    return next(error);
  }

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") {
      return res.sendStatus(200);
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        const config = await findActiveConfigByPhoneNumberId(phoneNumberId);
        if (!config) {
          console.warn("Webhook ignored: no active WhatsApp settings for phone number", {
            phoneNumberId
          });
          continue;
        }

        for (const message of value.messages || []) {
          await processIncomingMessage(message, value, config);
        }
        for (const status of value.statuses || []) {
          await processMessageStatus(status);
        }
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    return next(error);
  }
}

async function processIncomingMessage(message, value, config) {
  const whatsappUserId = message.from;
  const profileName = value.contacts?.find((contact) => contact.wa_id === whatsappUserId)
    ?.profile?.name || null;

  const contact = await Contact.findOneAndUpdate(
    { ownerId: config.ownerId, whatsappUserId },
    { $set: { phoneNumber: message.from, profileName } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  let conversation = await Conversation.findOne({
    ownerId: config.ownerId,
    contactId: contact._id,
    status: "open"
  });
  if (!conversation) {
    conversation = await Conversation.create({
      ownerId: config.ownerId,
      contactId: contact._id,
      whatsappPhoneNumberId: config.phoneNumberId,
      status: "open"
    });
  }

  let messageText = null;
  let mediaId = null;
  if (message.type === "text") {
    messageText = message.text?.body || null;
  } else if (message[message.type]) {
    mediaId = message[message.type].id || null;
    messageText = message[message.type].caption || null;
  }

  try {
    await Message.create({
      conversationId: conversation._id,
      whatsappMessageId: message.id,
      direction: "incoming",
      messageType: message.type,
      messageText,
      mediaId,
      status: "received",
      whatsappTimestamp: message.timestamp
        ? new Date(Number(message.timestamp) * 1000)
        : null
    });
  } catch (error) {
    if (error.code === 11000) return;
    throw error;
  }

  await Conversation.findByIdAndUpdate(conversation._id, { lastMessageAt: new Date() });
}

async function processMessageStatus(status) {
  if (!["sent", "delivered", "read", "failed"].includes(status.status)) return;
  const update = { status: status.status };
  if (status.errors) update.error = status.errors;
  await Message.findOneAndUpdate({ whatsappMessageId: status.id }, update);
}

async function sendMessage(req, res, next) {
  try {
    const config = await getSendConfig(req);
    if (!config) {
      return res.status(400).json({
        success: false,
        message: "Configure WhatsApp Cloud API settings before sending messages"
      });
    }

    const content = parseContent(req);
    const recipient = await resolveRecipient(req.body, config);
    if (recipient.error) {
      return res.status(recipient.status).json({ success: false, message: recipient.error });
    }
    const mediaId = req.file ? await uploadMedia(config, req.file) : null;
    const whatsappResponse = await sendWhatsAppMessage(config, recipient.phoneNumber, {
      ...content,
      mediaId
    });
    const whatsappMessageId = whatsappResponse.messages?.[0]?.id;
    if (!whatsappMessageId) {
      return res.status(502).json({
        success: false,
        message: "Meta did not return a WhatsApp message ID",
        data: whatsappResponse
      });
    }

    const savedMessage = await saveOutgoingMessage(
      recipient.conversation,
      whatsappMessageId,
      content,
      mediaId
    );
    return res.json({
      success: true,
      data: { whatsapp: whatsappResponse, message: savedMessage }
    });
  } catch (error) {
    return handleSendError(error, res, next);
  }
}

async function sendBulkMessages(req, res, next) {
  try {
    const config = await getSendConfig(req);
    if (!config) {
      return res.status(400).json({
        success: false,
        message: "Configure WhatsApp Cloud API settings before sending messages"
      });
    }
    const content = parseContent(req);
    const recipients = parseRecipients(req.body.recipients);
    if (!recipients || recipients.length === 0 || recipients.length > 100) {
      return res.status(400).json({
        success: false,
        message: "recipients must contain between 1 and 100 WhatsApp phone numbers"
      });
    }
    for (const number of recipients) {
      if (!isValidPhoneNumber(number)) {
        return res.status(400).json({
          success: false,
          message: `Invalid WhatsApp phone number: ${number}`
        });
      }
    }
    if (new Set(recipients).size !== recipients.length) {
      return res.status(400).json({
        success: false,
        message: "recipients must not contain duplicate phone numbers"
      });
    }

    const mediaId = req.file ? await uploadMedia(config, req.file) : null;
    const results = [];
    for (const phoneNumber of recipients) {
      try {
        const { conversation } = await findOrCreateConversation(config, phoneNumber);
        const response = await sendWhatsAppMessage(config, phoneNumber, { ...content, mediaId });
        const whatsappMessageId = response.messages?.[0]?.id;
        if (!whatsappMessageId) {
          throw new Error("Meta did not return a WhatsApp message ID");
        }
        const message = await saveOutgoingMessage(
          conversation,
          whatsappMessageId,
          content,
          mediaId
        );
        results.push({ to: phoneNumber, success: true, message });
      } catch (error) {
        console.error("Bulk WhatsApp send failed:", {
          to: phoneNumber,
          error: error.response?.data || error.message
        });
        results.push({
          to: phoneNumber,
          success: false,
          error: error.response?.data || error.message
        });
      }
    }

    const sent = results.filter((result) => result.success).length;
    return res.status(sent === results.length ? 200 : sent ? 207 : 502).json({
      success: sent === results.length,
      data: { sent, failed: results.length - sent, results }
    });
  } catch (error) {
    return handleSendError(error, res, next);
  }
}

async function getSendConfig(req) {
  const ownerId = req.user.role === "admin" && req.body.userId
    ? req.body.userId
    : req.user._id;
  const configRecord = await MetaConfig.findOne({ ownerId, isActive: true });
  if (!configRecord) return null;
  return {
    ownerId: configRecord.ownerId,
    appId: configRecord.appId,
    businessAccountId: configRecord.businessAccountId,
    phoneNumberId: configRecord.phoneNumberId,
    graphApiVersion: configRecord.graphApiVersion,
    accessToken: decrypt(configRecord.encryptedSecrets.accessToken),
    appSecret: decrypt(configRecord.encryptedSecrets.appSecret)
  };
}

function parseContent(req) {
  let text = req.body.text;
  if (typeof text !== "string") text = "";
  const hasMedia = Boolean(req.file || req.body.mediaUrl);
  if (!text.trim() && !hasMedia) {
    throw new InputError("text or a media file/mediaUrl is required");
  }
  if (text.length > 4096) {
    throw new InputError("text must not exceed 4096 characters");
  }

  let mediaType;
  let mediaUrl;
  let fileName;
  if (req.file) {
    mediaType = inferMediaType(req.file.mimetype);
    if (!mediaType) {
      throw new InputError("Only image, video, audio, and document files are supported");
    }
    fileName = safeFileName(req.file.originalname);
    if (mediaType === "image" && req.file.size > 5 * 1024 * 1024) {
      throw new InputError("Images must not exceed 5 MB");
    }
  } else if (req.body.mediaUrl) {
    mediaUrl = validateMediaUrl(req.body.mediaUrl);
    mediaType = req.body.mediaType;
    if (!mediaTypes.has(mediaType)) {
      throw new InputError("mediaType must be image, video, audio, or document");
    }
    if (typeof req.body.fileName === "string") {
      fileName = safeFileName(req.body.fileName);
    }
  }
  return { text, mediaType, mediaUrl, fileName };
}

function inferMediaType(mimeType) {
  const mime = mimeType.split(";")[0].toLowerCase();
  if (["image/jpeg", "image/png"].includes(mime)) return "image";
  if (["video/mp4", "video/3gpp"].includes(mime)) return "video";
  if ([
    "audio/aac",
    "audio/amr",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg"
  ].includes(mime)) return "audio";
  if ([
    "application/pdf",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "text/plain"
  ].includes(mime)) return "document";
  return null;
}

function validateMediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new InputError("mediaUrl must be a valid public HTTPS URL");
  }
}

function safeFileName(value) {
  return path.basename(value.replace(/\\/g, "/"));
}

function parseRecipients(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

async function resolveRecipient(body, config) {
  const ownerId = config.ownerId;
  if (body.conversationId) {
    const conversation = await Conversation.findOne({
      _id: body.conversationId,
      ownerId
    }).populate("contactId");
    if (!conversation) {
      return { status: 404, error: "Conversation not found" };
    }
    const phoneNumber = conversation.contactId?.phoneNumber;
    if (!isValidPhoneNumber(phoneNumber)) {
      return { status: 400, error: "Conversation has no valid WhatsApp phone number" };
    }
    return { conversation, phoneNumber };
  }
  if (!isValidPhoneNumber(body.to)) {
    return { status: 400, error: "to must be a WhatsApp phone number in international format" };
  }
  return findOrCreateConversation(config, body.to);
}

async function findOrCreateConversation(config, phoneNumber) {
  const ownerId = config.ownerId;
  const contact = await Contact.findOneAndUpdate(
    { ownerId, whatsappUserId: phoneNumber },
    { $set: { phoneNumber } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  let conversation = await Conversation.findOne({
    ownerId,
    contactId: contact._id,
    status: "open"
  });
  if (!conversation) {
    conversation = await Conversation.create({
      ownerId,
      contactId: contact._id,
      whatsappPhoneNumberId: config.phoneNumberId || "",
      status: "open"
    });
  }
  return { conversation, phoneNumber };
}

async function saveOutgoingMessage(conversation, whatsappMessageId, content, mediaId) {
  const message = await Message.create({
    conversationId: conversation._id,
    whatsappMessageId,
    direction: "outgoing",
    messageType: content.mediaType || "text",
    messageText: content.text || null,
    mediaId,
    mediaUrl: content.mediaUrl || null,
    status: "sent"
  });
  await Conversation.findByIdAndUpdate(conversation._id, { lastMessageAt: new Date() });
  return message;
}

function isValidPhoneNumber(value) {
  return typeof value === "string" && /^\d{6,20}$/.test(value);
}

function handleSendError(error, res, next) {
  if (error instanceof InputError) {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (error.response) {
    console.error("Send WhatsApp message error:", error.response.data);
    return res.status(502).json({
      success: false,
      message: "WhatsApp Cloud API rejected the message",
      error: error.response.data
    });
  }
  console.error("Send WhatsApp message error:", error);
  return next(error);
}

class InputError extends Error {}

module.exports = { receiveWebhook, sendBulkMessages, sendMessage, verifyWebhook };
