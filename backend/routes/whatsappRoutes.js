const express = require("express");
const {
  initWhatsappHandler,
  statusWhatsappHandler,
  qrWhatsappHandler,
  disconnectWhatsappHandler,
  resetWhatsappSessionHandler,
  restartWhatsappHandler,
} = require("../controllers/whatsappController");

const router = express.Router({ mergeParams: true });

router.post("/init", initWhatsappHandler);
router.get("/status", statusWhatsappHandler);
router.get("/qr", qrWhatsappHandler);
router.post("/disconnect", disconnectWhatsappHandler);
router.post("/reset-session", resetWhatsappSessionHandler);
router.post("/restart", restartWhatsappHandler);

module.exports = router;

