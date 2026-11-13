const Contact = require("../models/Contact");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { sendTextMessage } = require("../services/whatsapp.service");
const { verifyMetaSignature } = require("../utils/signature");

async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

async function receiveWebhook(req, res) {
  const signature = req.get("X-Hub-Signature-256");

  if (!verifyMetaSignature(req.rawBody, signature)) {
    console.warn("Invalid webhook signature - request rejected", {
      hasSignatureHeader: Boolean(signature),
      hasRawBody: Boolean(req.rawBody),
      rawBodyLength: req.rawBody ? req.rawBody.length : 0,
      userAgent: req.get("User-Agent")
    });
    return res.sendStatus(401);
  }

  res.sendStatus(200);

  try {
    const body = req.body;

    const value = body.entry?.[0]?.changes?.[0]?.value;
    console.log("Webhook received:", {
      object: body.object,
      messages: value?.messages?.length || 0,
      statuses: value?.statuses?.length || 0
    });

    if (body.object !== "whatsapp_business_account") {
      return;
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") {
          continue;
        }

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;

        for (const message of value.messages || []) {
          await processIncomingMessage(message, value, phoneNumberId);
        }

        for (const status of value.statuses || []) {
          await processMessageStatus(status);
        }
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error.message);
  }
}

async function processIncomingMessage(message, value, phoneNumberId) {
  const whatsappUserId = message.from;
  const profileName = value.contacts?.[0]?.profile?.name || null;

  const contact = await Contact.findOneAndUpdate(
    { whatsappUserId },
    { $set: { whatsappUserId, phoneNumber: message.from, profileName } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  let conversation = await Conversation.findOne({
    contactId: contact._id,
    status: "open"
  });

  if (!conversation) {
    conversation = await Conversation.create({
      contactId: contact._id,
      whatsappPhoneNumberId: phoneNumberId,
      status: "open",
      lastMessageAt: new Date()
    });
  }

  let messageText = null;
  let mediaId = null;

  if (message.type === "text") {
    messageText = message.text?.body || null;
  }

  if (["image", "video", "audio", "document", "sticker"].includes(message.type)) {
    mediaId = message[message.type]?.id || null;
    messageText = message[message.type]?.caption || null;
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
    if (error.code === 11000) {
      console.log(`Duplicate message ignored: ${message.id}`);
      return;
    }
    throw error;
  }

  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessageAt: new Date()
  });

  console.log("Incoming message saved:", {
    contactId: contact._id,
    conversationId: conversation._id,
    whatsappMessageId: message.id,
    messageType: message.type,
    messageText
  });
}

async function processMessageStatus(status) {
  const allowedStatuses = ["sent", "delivered", "read", "failed"];

  if (!allowedStatuses.includes(status.status)) {
    return;
  }

  const update = { status: status.status };

  if (status.errors) {
    update.error = status.errors;
  }

  await Message.findOneAndUpdate({ whatsappMessageId: status.id }, update);

  console.log(`Message ${status.id} status: ${status.status}`);
}

async function sendMessage(req, res) {
  try {
    const { to, text, conversationId } = req.body;

    if (!to || !text) {
      return res.status(400).json({
        success: false,
        message: "to and text are required"
      });
    }

    const whatsappResponse = await sendTextMessage(to, text);
    const whatsappMessageId = whatsappResponse.messages?.[0]?.id;

    if (conversationId && whatsappMessageId) {
      await Message.create({
        conversationId,
        whatsappMessageId,
        direction: "outgoing",
        messageType: "text",
        messageText: text,
        status: "sent"
      });
    }

    return res.status(200).json({ success: true, data: whatsappResponse });
  } catch (error) {
    console.error(
      "Send WhatsApp message error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to send WhatsApp message",
      error: error.response?.data || error.message
    });
  }
}

module.exports = { verifyWebhook, receiveWebhook, sendMessage };
