const { dbQuery } = require("../utils/dbQuery");

async function upsertSession(botId, sessionName) {
  await dbQuery(
    `INSERT INTO bot_whatsapp_sessions
      (bot_id, session_name, session_status, created_at, updated_at)
     VALUES (?, ?, 'initializing', NOW(), NOW())
     ON DUPLICATE KEY UPDATE session_name = VALUES(session_name), updated_at = NOW()`,
    [botId, sessionName]
  );
}

async function updateSession(botId, patch) {
  const fields = [];
  const values = [];
  const map = {
    session_status: patch.sessionStatus,
    qr_code_data: patch.qrCodeData,
    phone_number: patch.phoneNumber,
    last_connected_at: patch.lastConnectedAt,
    error_message: patch.errorMessage,
  };

  Object.entries(map).forEach(([col, val]) => {
    if (val !== undefined) {
      fields.push(`${col} = ?`);
      values.push(val);
    }
  });
  if (!fields.length) return;
  values.push(botId);
  await dbQuery(
    `UPDATE bot_whatsapp_sessions
     SET ${fields.join(", ")}, updated_at = NOW()
     WHERE bot_id = ?`,
    values
  );
}

async function getSessionByBotId(botId) {
  const rows = await dbQuery(
    "SELECT * FROM bot_whatsapp_sessions WHERE bot_id = ? LIMIT 1",
    [botId]
  );
  return rows[0] || null;
}

async function listSessions() {
  return dbQuery("SELECT * FROM bot_whatsapp_sessions ORDER BY updated_at DESC");
}

module.exports = {
  upsertSession,
  updateSession,
  getSessionByBotId,
  listSessions,
};

