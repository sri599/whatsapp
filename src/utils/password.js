const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = (passwordHash || "").split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const stored = Buffer.from(storedHash, "hex");
  const derived = await scrypt(password, salt, stored.length);
  return stored.length === derived.length && crypto.timingSafeEqual(stored, derived);
}

module.exports = { hashPassword, verifyPassword };
