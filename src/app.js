const express = require("express");
const authRoutes = require("./routes/auth.routes");
const inboxRoutes = require("./routes/inbox.routes");
const settingsRoutes = require("./routes/settings.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");

const app = express();

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

// Keep the exact raw body so the Meta signature can be validated.
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use((req, res, next) => {
  req.body = req.body || {};
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "WhatsApp Integration API is running"
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "whatsapp-integration",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

app.use(whatsappRoutes);
app.use(authRoutes);
app.use(inboxRoutes);
app.use(settingsRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.name === "MulterError") {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (error.name === "CastError") {
    return res.status(400).json({ success: false, message: "Invalid resource identifier" });
  }
  console.error("Request error:", error);
  return res.status(500).json({ success: false, message: "Internal server error" });
});

module.exports = app;
