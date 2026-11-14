const express = require("express");
const multer = require("multer");
const {
  verifyWebhook,
  receiveWebhook,
  sendMessage,
  sendBulkMessages
} = require("../controllers/whatsapp.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024, files: 1 }
});

router.get("/webhook/whatsapp", verifyWebhook);
router.post("/webhook/whatsapp", receiveWebhook);
router.post("/api/whatsapp/send", requireAuth, upload.single("file"), sendMessage);
router.post("/api/whatsapp/send/bulk", requireAuth, upload.single("file"), sendBulkMessages);

module.exports = router;
