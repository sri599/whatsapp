const axios = require("axios");
const crypto = require("crypto");
const FormData = require("form-data");
const path = require("path");

function getGraphUrl(config, endpoint) {
  return `https://graph.facebook.com/v${config.graphApiVersion}/${config.phoneNumberId}/${endpoint}`;
}

function getRequestOptions(config) {
  return {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json"
    },
    params: {
      appsecret_proof: crypto
        .createHmac("sha256", config.appSecret)
        .update(config.accessToken)
        .digest("hex")
    },
    timeout: 30000
  };
}

async function uploadMedia(config, file) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", file.buffer, {
    filename: path.basename(file.originalname),
    contentType: file.mimetype
  });

  const response = await axios.post(getGraphUrl(config, "media"), form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${config.accessToken}`
    },
    params: {
      appsecret_proof: crypto
        .createHmac("sha256", config.appSecret)
        .update(config.accessToken)
        .digest("hex")
    },
    timeout: 60000,
    maxBodyLength: 20 * 1024 * 1024
  });
  if (!response.data.id) {
    throw new Error("Meta did not return a media ID");
  }
  return response.data.id;
}

async function sendWhatsAppMessage(config, to, content) {
  const { text, mediaId, mediaUrl, mediaType, fileName } = content;
  let type = "text";
  let value;

  if (mediaId || mediaUrl) {
    type = mediaType;
    value = mediaId ? { id: mediaId } : { link: mediaUrl };
    if (text && type !== "audio") value.caption = text;
    if (type === "document" && fileName) value.filename = fileName;
  } else {
    value = { preview_url: false, body: text };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type,
    [type]: value
  };

  const response = await axios.post(getGraphUrl(config, "messages"), payload, getRequestOptions(config));
  return response.data;
}

module.exports = { sendWhatsAppMessage, uploadMedia };
