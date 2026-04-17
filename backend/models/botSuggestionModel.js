const { dbQuery } = require("../utils/dbQuery");

function mapSuggestion(row) {
  return {
    id: row.id,
    botId: row.bot_id,
    questionText: row.question_text,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listSuggestionsByBot(botId) {
  try {
    const rows = await dbQuery(
      `SELECT id, bot_id, question_text, category, created_at, updated_at
       FROM bot_suggestions
       WHERE bot_id = ?
       ORDER BY id ASC`,
      [botId]
    );
    return rows.map(mapSuggestion);
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") {
      return [];
    }
    throw err;
  }
}

async function createSuggestion(botId, questionText, category = null) {
  const result = await dbQuery(
    `INSERT INTO bot_suggestions (bot_id, question_text, category, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [botId, questionText, category]
  );
  const rows = await dbQuery(
    `SELECT id, bot_id, question_text, category, created_at, updated_at
     FROM bot_suggestions
     WHERE id = ?
     LIMIT 1`,
    [result.insertId]
  );
  return rows[0] ? mapSuggestion(rows[0]) : null;
}

async function updateSuggestion(botId, suggestionId, patch) {
  await dbQuery(
    `UPDATE bot_suggestions
     SET question_text = ?, category = ?, updated_at = NOW()
     WHERE id = ? AND bot_id = ?`,
    [patch.questionText, patch.category || null, suggestionId, botId]
  );

  const rows = await dbQuery(
    `SELECT id, bot_id, question_text, category, created_at, updated_at
     FROM bot_suggestions
     WHERE id = ? AND bot_id = ?
     LIMIT 1`,
    [suggestionId, botId]
  );
  return rows[0] ? mapSuggestion(rows[0]) : null;
}

async function deleteSuggestion(botId, suggestionId) {
  const result = await dbQuery("DELETE FROM bot_suggestions WHERE id = ? AND bot_id = ?", [
    suggestionId,
    botId,
  ]);
  return result.affectedRows > 0;
}

module.exports = {
  listSuggestionsByBot,
  createSuggestion,
  updateSuggestion,
  deleteSuggestion,
};

