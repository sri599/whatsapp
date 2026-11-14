const crypto = require("crypto");
const Session = require("../models/Session");
const User = require("../models/User");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function requireAuth(req, res, next) {
  const authorization = req.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const session = await Session.findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() }
    });
    const user = session ? await User.findById(session.userId) : null;

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "Session is invalid or expired" });
    }

    req.user = user;
    req.sessionId = session._id;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin role required" });
  }
  return next();
}

module.exports = { hashToken, requireAuth, requireAdmin };
