const express = require("express");
const {
  createUser,
  listUsers,
  login,
  logout,
  me,
  updateUser
} = require("../controllers/auth.controller");
const { requireAdmin, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/api/auth/login", login);
router.get("/api/auth/me", requireAuth, me);
router.post("/api/auth/logout", requireAuth, logout);
router.get("/api/admin/users", requireAuth, requireAdmin, listUsers);
router.post("/api/admin/users", requireAuth, requireAdmin, createUser);
router.patch("/api/admin/users/:userId", requireAuth, requireAdmin, updateUser);

module.exports = router;
