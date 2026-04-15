const express = require("express");
const {
  createBotHandler,
  listBotsHandler,
  getBotHandler,
  updateBotHandler,
  patchBotStatusHandler,
  deleteBotHandler,
} = require("../controllers/botController");

const router = express.Router();

router.post("/", createBotHandler);
router.get("/", listBotsHandler);
router.get("/:id", getBotHandler);
router.put("/:id", updateBotHandler);
router.patch("/:id/status", patchBotStatusHandler);
router.delete("/:id", deleteBotHandler);

module.exports = router;

