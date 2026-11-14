const crypto = require("crypto");

function getEncryptionKey() {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("APP_ENCRYPTION_KEY is required to encrypt Meta credentials");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(value) {
  const [ivHex, tagHex, encryptedHex] = (value || "").split(":");
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error("Stored Meta credential is invalid");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final()
  ]).toString("utf8");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = { encrypt, decrypt, safeEqual };
