const { dbQuery } = require("../utils/dbQuery");

async function findOrCreateConversation(botId, contactPhone, contactName = null) {
  const rows = await dbQuery(
    "SELECT * FROM bot_conversations WHERE bot_id = ? AND contact_phone = ? LIMIT 1",
    [botId, contactPhone]
  );
  if (rows[0]) {
    await dbQuery(
      `UPDATE bot_conversations
       SET contact_name = COALESCE(?, contact_name), last_message_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [contactName, rows[0].id]
    );
    return rows[0].id;
  }

  const result = await dbQuery(
    `INSERT INTO bot_conversations
      (bot_id, contact_phone, contact_name, started_at, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW(), NOW(), NOW())`,
    [botId, contactPhone, contactName]
  );
  return result.insertId;
}

async function addMessage(payload) {
  const result = await dbQuery(
    `INSERT INTO bot_messages
      (conversation_id, bot_id, sender_type, message_text, message_type, wa_message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      payload.conversationId,
      payload.botId,
      payload.senderType,
      payload.messageText,
      payload.messageType || "text",
      payload.waMessageId || null,
    ]
  );
  await dbQuery(
    "UPDATE bot_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?",
    [payload.conversationId]
  );
  return result.insertId;
}

async function listConversationsByBot(botId) {
  return dbQuery(
    `SELECT id, bot_id, contact_phone, contact_name, started_at, last_message_at, created_at, updated_at
     FROM bot_conversations
     WHERE bot_id = ?
     ORDER BY last_message_at DESC`,
    [botId]
  );
}

async function listMessagesByConversation(botId, conversationId) {
  return dbQuery(
    `SELECT id, conversation_id, bot_id, sender_type, message_text, message_type, wa_message_id, created_at
     FROM bot_messages
     WHERE bot_id = ? AND conversation_id = ?
     ORDER BY created_at ASC, id ASC`,
    [botId, conversationId]
  );
}

module.exports = {
  findOrCreateConversation,
  addMessage,
  listConversationsByBot,
  listMessagesByConversation,
};

