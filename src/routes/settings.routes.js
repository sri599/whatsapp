const express = require("express");
const {
  deactivateConfig,
  getConfig,
  putConfig
} = require("../controllers/settings.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/api/settings/whatsapp", requireAuth, getConfig);
router.put("/api/settings/whatsapp", requireAuth, putConfig);
router.delete("/api/settings/whatsapp", requireAuth, deactivateConfig);

module.exports = router;
