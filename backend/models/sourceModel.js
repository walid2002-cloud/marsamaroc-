const { dbQuery } = require("../utils/dbQuery");

function mapSource(row) {
  return {
    id: row.id,
    botId: row.bot_id,
    sourceType: row.source_type,
    title: row.title,
    contentText: row.content_text,
    filePath: row.file_path,
    apiUrl: row.api_url,
    apiMethod: row.api_method,
    apiHeadersJson: row.api_headers_json,
    apiMappingJson: row.api_mapping_json,
    isActive: !!row.is_active,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createSource(payload) {
  const result = await dbQuery(
    `INSERT INTO bot_sources
      (bot_id, source_type, title, content_text, file_path, api_url, api_method, api_headers_json, api_mapping_json, is_active, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
    [
      payload.botId,
      payload.sourceType,
      payload.title,
      payload.contentText || null,
      payload.filePath || null,
      payload.apiUrl || null,
      payload.apiMethod || null,
      payload.apiHeadersJson || null,
      payload.apiMappingJson || null,
      payload.isActive == null ? 1 : payload.isActive ? 1 : 0,
    ]
  );
  return getSourceById(result.insertId);
}

async function getSourceById(sourceId) {
  const rows = await dbQuery("SELECT * FROM bot_sources WHERE id = ? LIMIT 1", [sourceId]);
  return rows[0] ? mapSource(rows[0]) : null;
}

async function listSourcesByBot(botId) {
  const rows = await dbQuery(
    "SELECT * FROM bot_sources WHERE bot_id = ? ORDER BY updated_at DESC, id DESC",
    [botId]
  );
  return rows.map(mapSource);
}

async function updateSource(sourceId, payload) {
  await dbQuery(
    `UPDATE bot_sources
     SET title = ?, content_text = ?, api_url = ?, api_method = ?, api_headers_json = ?, api_mapping_json = ?,
         is_active = ?, status = 'pending', updated_at = NOW()
     WHERE id = ?`,
    [
      payload.title,
      payload.contentText || null,
      payload.apiUrl || null,
      payload.apiMethod || null,
      payload.apiHeadersJson || null,
      payload.apiMappingJson || null,
      payload.isActive == null ? 1 : payload.isActive ? 1 : 0,
      sourceId,
    ]
  );
  return getSourceById(sourceId);
}

async function setSourceStatus(sourceId, status, lastError = null) {
  await dbQuery(
    "UPDATE bot_sources SET status = ?, last_error = ?, updated_at = NOW() WHERE id = ?",
    [status, lastError, sourceId]
  );
}

async function replaceChunks(botId, sourceId, chunks) {
  await dbQuery("DELETE FROM bot_knowledge_chunks WHERE source_id = ?", [sourceId]);
  if (!chunks.length) return;
  const values = chunks.map((chunk, idx) => [
    botId,
    sourceId,
    chunk,
    idx + 1,
    JSON.stringify({ length: chunk.length }),
  ]);
  await dbQuery(
    `INSERT INTO bot_knowledge_chunks
      (bot_id, source_id, chunk_text, chunk_index, metadata_json, created_at)
     VALUES ?`,
    [values]
  );
}

async function getRelevantChunks(botId, query, limit = 5) {
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);

  if (!terms.length) {
    const rows = await dbQuery(
      `SELECT chunk_text, chunk_index, source_id
       FROM bot_knowledge_chunks
       WHERE bot_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [botId, limit]
    );
    return rows;
  }

  const conditions = terms.map(() => "LOWER(chunk_text) LIKE ?").join(" OR ");
  const params = [botId, ...terms.map((t) => `%${t}%`), limit];
  const rows = await dbQuery(
    `SELECT chunk_text, chunk_index, source_id
     FROM bot_knowledge_chunks
     WHERE bot_id = ? AND (${conditions})
     ORDER BY chunk_index ASC
     LIMIT ?`,
    params
  );
  return rows;
}

async function logApiCall(payload) {
  await dbQuery(
    `INSERT INTO bot_api_logs
      (bot_id, source_id, request_summary, response_summary, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      payload.botId,
      payload.sourceId || null,
      payload.requestSummary || null,
      payload.responseSummary || null,
      payload.statusCode || null,
    ]
  );
}

async function listApiLogsByBot(botId) {
  return dbQuery(
    "SELECT * FROM bot_api_logs WHERE bot_id = ? ORDER BY created_at DESC LIMIT 200",
    [botId]
  );
}

module.exports = {
  createSource,
  getSourceById,
  listSourcesByBot,
  updateSource,
  setSourceStatus,
  replaceChunks,
  getRelevantChunks,
  logApiCall,
  listApiLogsByBot,
};

