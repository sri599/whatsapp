const crypto = require("crypto");
const Session = require("../models/Session");
const User = require("../models/User");
const MetaConfig = require("../models/MetaConfig");
const { hashToken } = require("../middleware/auth");
const { hashPassword, verifyPassword } = require("../utils/password");

const SESSION_DAYS = 7;

async function login(req, res, next) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    const user = await User.findOne({ email }).select("+passwordHash");

    if (
      typeof password !== "string" ||
      !user ||
      !user.isActive ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await Session.create({ userId: user._id, tokenHash: hashToken(token), expiresAt });

    return res.json({
      success: true,
      data: { token, expiresAt, user: userSummary(user) }
    });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    await Session.findByIdAndDelete(req.sessionId);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  return res.json({ success: true, data: userSummary(req.user) });
}

function userSummary(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive
  };
}

async function createUser(req, res, next) {
  try {
    const { name, email, password, role = "user" } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 10
    ) {
      return res.status(400).json({
        success: false,
        message: "name, email, and a password of at least 10 characters are required"
      });
    }
    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be admin or user" });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role
    });
    return res.status(201).json({ success: true, data: userSummary(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Email is already registered" });
    }
    return next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.json({ success: true, data: users.map(userSummary) });
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const { role, isActive, name, password } = req.body;
    if (role !== undefined && !["admin", "user"].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be admin or user" });
    }
    if (password !== undefined && (typeof password !== "string" || password.length < 10)) {
      return res.status(400).json({
        success: false,
        message: "password must be at least 10 characters"
      });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive must be a boolean" });
    }
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ success: false, message: "name must not be empty" });
    }
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (
      String(user._id) === String(req.user._id) &&
      (isActive === false || role === "user")
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate or demote yourself"
      });
    }
    if (
      user.role === "admin" &&
      user.isActive &&
      (role === "user" || isActive === false) &&
      (await User.countDocuments({ role: "admin", isActive: true })) <= 1
    ) {
      return res.status(409).json({
        success: false,
        message: "At least one active administrator must remain"
      });
    }

    const update = {};
    if (role !== undefined) update.role = role;
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (name !== undefined) update.name = String(name).trim();
    if (password !== undefined) update.passwordHash = await hashPassword(password);
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: "At least one field is required" });
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.userId, update, {
      new: true,
      runValidators: true
    });
    if (isActive === false || password !== undefined) {
      await Session.deleteMany({ userId: updatedUser._id });
    }
    if (isActive === false) {
      await MetaConfig.updateOne({ ownerId: updatedUser._id }, { $set: { isActive: false } });
    }
    return res.json({ success: true, data: userSummary(updatedUser) });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createUser, listUsers, login, logout, me, updateUser };
