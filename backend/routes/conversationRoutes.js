const express = require("express");
const {
  listConversationsHandler,
  listMessagesHandler,
} = require("../controllers/conversationController");

const router = express.Router({ mergeParams: true });

router.get("/", listConversationsHandler);
router.get("/:conversationId/messages", listMessagesHandler);

module.exports = router;

