const crypto = require("crypto");

// Validates Meta's X-Hub-Signature-256 header against the RAW request body.
function verifyMetaSignature(rawBody, signature) {
  if (!signature || !rawBody) {
    return false;
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET)
      .update(rawBody)
      .digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  // timingSafeEqual throws if lengths differ, so check first.
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyMetaSignature };
