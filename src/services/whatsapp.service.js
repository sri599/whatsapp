const axios = require("axios");
const crypto = require("crypto");

function getGraphUrl() {
  return `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

function generateAppSecretProof() {
  return crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(process.env.WHATSAPP_ACCESS_TOKEN)
    .digest("hex");
}

async function sendTextMessage(to, text) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text }
  };

  const response = await axios.post(getGraphUrl(), payload, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    params: { appsecret_proof: generateAppSecretProof() },
    timeout: 30000
  });

  return response.data;
}

module.exports = { sendTextMessage };
