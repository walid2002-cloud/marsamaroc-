const {
  listConversationsByBot,
  listMessagesByConversation,
} = require("../models/conversationModel");

async function listConversationsHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const rows = await listConversationsByBot(botId);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

async function listMessagesHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const conversationId = Number(req.params.conversationId);
    const rows = await listMessagesByConversation(botId, conversationId);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listConversationsHandler,
  listMessagesHandler,
};

