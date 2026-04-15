const express = require("express");
const adminRoutes = require("./adminRoutes");
const botRoutes = require("./botRoutes");
const sourceRoutes = require("./sourceRoutes");
const whatsappRoutes = require("./whatsappRoutes");
const conversationRoutes = require("./conversationRoutes");

const router = express.Router();

router.use("/admin", adminRoutes);
router.use("/bots", botRoutes);
router.use("/bots/:id/sources", sourceRoutes);
router.use("/bots/:id/whatsapp", whatsappRoutes);
router.use("/bots/:id/conversations", conversationRoutes);

module.exports = router;

