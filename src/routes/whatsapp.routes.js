const express = require("express");
const {
  verifyWebhook,
  receiveWebhook,
  sendMessage
} = require("../controllers/whatsapp.controller");

const router = express.Router();

router.get("/webhook/whatsapp", verifyWebhook);
router.post("/webhook/whatsapp", receiveWebhook);
router.post("/api/whatsapp/send", sendMessage);

module.exports = router;
