const requiredEnv = [
  "MONGODB_URI",
  "APP_ENCRYPTION_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD"
];

function validateEnvironment() {
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  if (process.env.APP_ENCRYPTION_KEY.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY must be at least 32 characters");
  }
  if (process.env.ADMIN_PASSWORD.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  }
}

module.exports = { validateEnvironment };
