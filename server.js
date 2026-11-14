require("dotenv").config();

const app = require("./src/app");
const connectDatabase = require("./src/config/db");
const { validateEnvironment } = require("./src/config/env");
const User = require("./src/models/User");
const MetaConfig = require("./src/models/MetaConfig");
const Contact = require("./src/models/Contact");
const Conversation = require("./src/models/Conversation");
const { encrypt } = require("./src/utils/secrets");
const { hashPassword } = require("./src/utils/password");

async function initializeAdmin() {
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  let admin = await User.findOne({ email });
  if (!admin) {
    admin = await User.create({
      name: process.env.ADMIN_NAME || "Administrator",
      email,
      passwordHash: await hashPassword(process.env.ADMIN_PASSWORD),
      role: "admin"
    });
    console.log("Bootstrap admin account created");
  } else if (admin.role !== "admin") {
    throw new Error("ADMIN_EMAIL belongs to an account that is not an administrator");
  }

  await migrateLegacyInbox(admin._id);

  const legacyCredentials = {
    appId: process.env.META_APP_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    graphApiVersion: process.env.GRAPH_API_VERSION,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN
  };
  if (Object.values(legacyCredentials).every(Boolean)) {
    const configExists = await MetaConfig.exists({ ownerId: admin._id });
    if (!configExists) {
      await MetaConfig.create({
        ownerId: admin._id,
        appId: legacyCredentials.appId,
        businessAccountId: legacyCredentials.businessAccountId,
        phoneNumberId: legacyCredentials.phoneNumberId,
        graphApiVersion: legacyCredentials.graphApiVersion.replace(/^v/, ""),
        encryptedSecrets: {
          accessToken: encrypt(legacyCredentials.accessToken),
          appSecret: encrypt(legacyCredentials.appSecret),
          verifyToken: encrypt(legacyCredentials.verifyToken)
        }
      });
      console.log("Legacy WhatsApp environment settings migrated to encrypted storage");
    }
  }
}

async function migrateLegacyInbox(adminId) {
  if (!(await collectionExists(Contact))) {
    await Contact.createCollection();
  }
  if (!(await collectionExists(Conversation))) {
    await Conversation.createCollection();
  }
  const indexes = await Contact.collection.indexes();
  const legacyUniqueIndex = indexes.find(
    (index) => index.unique && index.key?.whatsappUserId === 1 && !index.key.ownerId
  );
  if (legacyUniqueIndex) {
    await Contact.collection.dropIndex(legacyUniqueIndex.name);
  }
  await Contact.updateMany(
    { ownerId: { $exists: false } },
    { $set: { ownerId: adminId } }
  );
  await Conversation.updateMany(
    { ownerId: { $exists: false } },
    { $set: { ownerId: adminId } }
  );
  await Contact.collection.createIndex({ ownerId: 1, whatsappUserId: 1 }, { unique: true });
}

async function collectionExists(model) {
  return model.collection.db
    .listCollections({ name: model.collection.name }, { nameOnly: true })
    .hasNext();
}

async function startServer() {
  try {
    validateEnvironment();
    await connectDatabase();
    await initializeAdmin();

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
