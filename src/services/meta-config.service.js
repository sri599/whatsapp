const MetaConfig = require("../models/MetaConfig");
const { decrypt, encrypt, safeEqual } = require("../utils/secrets");
const { verifyMetaSignature } = require("../utils/signature");

const secretFields = ["accessToken", "appSecret", "verifyToken"];
const requiredFields = [
  "appId",
  "businessAccountId",
  "phoneNumberId",
  "graphApiVersion",
  ...secretFields
];

function toCredentials(config) {
  return {
    ownerId: config.ownerId,
    appId: config.appId,
    businessAccountId: config.businessAccountId,
    phoneNumberId: config.phoneNumberId,
    graphApiVersion: config.graphApiVersion,
    accessToken: decrypt(config.encryptedSecrets.accessToken),
    appSecret: decrypt(config.encryptedSecrets.appSecret),
    verifyToken: decrypt(config.encryptedSecrets.verifyToken)
  };
}

function publicConfig(config) {
  return {
    appId: config.appId,
    businessAccountId: config.businessAccountId,
    phoneNumberId: config.phoneNumberId,
    graphApiVersion: config.graphApiVersion,
    isActive: config.isActive,
    credentialsConfigured: true,
    updatedAt: config.updatedAt
  };
}

async function saveConfig(ownerId, input) {
  const existing = await MetaConfig.findOne({ ownerId });
  const values = { ...(input || {}) };
  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    throw new Error("isActive must be a boolean");
  }

  for (const field of requiredFields) {
    if (!values[field] && existing && secretFields.includes(field)) {
      values[field] = decrypt(existing.encryptedSecrets[field]);
    }
    if (typeof values[field] !== "string" || !values[field].trim()) {
      throw new Error(`${field} is required`);
    }
    values[field] = values[field].trim();
  }
  if (!/^\d+\.\d+$/.test(values.graphApiVersion.replace(/^v/, ""))) {
    throw new Error("graphApiVersion must use the format v23.0");
  }

  const update = {
    appId: values.appId,
    businessAccountId: values.businessAccountId,
    phoneNumberId: values.phoneNumberId,
    graphApiVersion: values.graphApiVersion.replace(/^v/, ""),
    encryptedSecrets: {
      accessToken: encrypt(values.accessToken),
      appSecret: encrypt(values.appSecret),
      verifyToken: encrypt(values.verifyToken)
    },
    isActive: input.isActive === undefined ? true : Boolean(input.isActive)
  };

  return MetaConfig.findOneAndUpdate(
    { ownerId },
    { $set: update },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function findActiveConfigByPhoneNumberId(phoneNumberId) {
  const configs = await MetaConfig.find({ isActive: true, phoneNumberId });
  for (const config of configs) {
    return toCredentials(config);
  }
  return null;
}

async function findWebhookConfig(verifyToken) {
  const configs = await MetaConfig.find({ isActive: true });
  for (const config of configs) {
    const credentials = toCredentials(config);
    if (safeEqual(credentials.verifyToken, verifyToken)) {
      return credentials;
    }
  }
  return null;
}

async function verifyWebhookSignature(rawBody, signature) {
  if (!rawBody || !signature) {
    return false;
  }

  const configs = await MetaConfig.find({ isActive: true });
  for (const config of configs) {
    const credentials = toCredentials(config);
    if (verifyMetaSignature(rawBody, signature, credentials.appSecret)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  findActiveConfigByPhoneNumberId,
  findWebhookConfig,
  publicConfig,
  saveConfig,
  toCredentials,
  verifyWebhookSignature
};
