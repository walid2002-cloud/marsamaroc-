const express = require("express");
const {
  initWhatsappHandler,
  statusWhatsappHandler,
  qrWhatsappHandler,
  disconnectWhatsappHandler,
  restartWhatsappHandler,
} = require("../controllers/whatsappController");

const router = express.Router({ mergeParams: true });

router.post("/init", initWhatsappHandler);
router.get("/status", statusWhatsappHandler);
router.get("/qr", qrWhatsappHandler);
router.post("/disconnect", disconnectWhatsappHandler);
router.post("/restart", restartWhatsappHandler);

module.exports = router;

