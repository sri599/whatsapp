const express = require("express");
const whatsappRoutes = require("./routes/whatsapp.routes");

const app = express();

// Keep the exact raw body so the Meta signature can be validated.
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

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

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

module.exports = app;
