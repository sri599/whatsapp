const express = require("express");
const {
  getMessages,
  listContacts,
  listConversations,
  updateConversation
} = require("../controllers/inbox.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/api/contacts", requireAuth, listContacts);
router.get("/api/conversations", requireAuth, listConversations);
router.get("/api/conversations/:conversationId/messages", requireAuth, getMessages);
router.patch("/api/conversations/:conversationId", requireAuth, updateConversation);

module.exports = router;
