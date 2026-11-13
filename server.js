require("dotenv").config();

const app = require("./src/app");
const connectDatabase = require("./src/config/db");
const { validateEnvironment } = require("./src/config/env");

async function startServer() {
  try {
    validateEnvironment();
    await connectDatabase();

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
