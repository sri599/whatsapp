const requiredEnv = [
  "MONGODB_URI",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "META_APP_ID",
  "META_APP_SECRET",
  "GRAPH_API_VERSION"
];

function validateEnvironment() {
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

module.exports = { validateEnvironment };
