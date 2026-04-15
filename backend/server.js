require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const apiRoutes = require("./routes");
const botWhatsappManager = require("./services/botWhatsappManager");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

app.get("/", (_req, res) => {
  res.status(200).json({
    service: "Marsa Maroc AI Admin API",
    mode: "bot-centric",
    version: "2.0.0",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "marsa-backend" });
});

app.use("/api", apiRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log("API namespace: /api");
  console.log("User OTP / QR access flow removed. Bot-centric WhatsApp flow enabled.");
  try {
    await botWhatsappManager.restoreTrackedSessions();
  } catch (err) {
    console.error("Failed to restore WhatsApp sessions:", err.message);
  }
});

