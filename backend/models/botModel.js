const { dbQuery } = require("../utils/dbQuery");

function mapBot(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    domain: row.domain,
    description: row.description,
    status: row.status,
    whatsappEnabled: !!row.whatsapp_enabled,
    whatsappPhone: row.whatsapp_phone,
    promptGuardrails: row.prompt_guardrails,
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createBot(payload) {
  const result = await dbQuery(
    `INSERT INTO bots
      (name, slug, domain, description, status, whatsapp_enabled, whatsapp_phone, prompt_guardrails, created_by_admin_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      payload.name,
      payload.slug,
      payload.domain,
      payload.description || null,
      payload.status || "active",
      payload.whatsappEnabled ? 1 : 0,
      payload.whatsappPhone || null,
      payload.promptGuardrails || null,
      payload.createdByAdminId || null,
    ]
  );
  return getBotById(result.insertId);
}

async function listBots() {
  const rows = await dbQuery("SELECT * FROM bots ORDER BY created_at DESC, id DESC");
  return rows.map(mapBot);
}

async function listBotDomains() {
  const rows = await dbQuery("SELECT id, domain FROM bots WHERE status = 'active'");
  return rows.map((r) => ({ id: r.id, domain: r.domain }));
}

async function getBotById(id) {
  const rows = await dbQuery("SELECT * FROM bots WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? mapBot(rows[0]) : null;
}

async function updateBot(id, payload) {
  await dbQuery(
    `UPDATE bots
     SET name = ?, slug = ?, domain = ?, description = ?, status = ?, whatsapp_enabled = ?,
         whatsapp_phone = ?, prompt_guardrails = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      payload.name,
      payload.slug,
      payload.domain,
      payload.description || null,
      payload.status || "active",
      payload.whatsappEnabled ? 1 : 0,
      payload.whatsappPhone || null,
      payload.promptGuardrails || null,
      id,
    ]
  );
  return getBotById(id);
}

async function patchBotStatus(id, status) {
  await dbQuery("UPDATE bots SET status = ?, updated_at = NOW() WHERE id = ?", [status, id]);
  return getBotById(id);
}

async function deleteBot(id) {
  await dbQuery("DELETE FROM bots WHERE id = ?", [id]);
}

module.exports = {
  createBot,
  listBots,
  getBotById,
  updateBot,
  patchBotStatus,
  deleteBot,
  listBotDomains,
};

