const fs = require("fs/promises");
const path = require("path");
const db = require("../db");

const loadPdfParse = () => require("pdf-parse");
const loadMammoth = () => require("mammoth");

const SOURCE_TYPES = new Set(["document", "text", "api"]);
const SOURCE_STATUS = {
  PENDING: "pending",
  PROCESSED: "processed",
  ERROR: "error",
};

const dbQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });

const normalizeText = (value) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const chunkText = (text, maxLength = 1200) => {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const paragraphs = normalized.split("\n\n");
  const chunks = [];
  let current = "";

  for (const p of paragraphs) {
    if (!p.trim()) continue;
    if ((current + "\n\n" + p).trim().length > maxLength) {
      if (current.trim()) chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const stringifyHeaders = (headers) => {
  if (!headers) return null;
  if (typeof headers === "string") return headers;
  return JSON.stringify(headers);
};

const extractFromDocument = async (source) => {
  const ext = path.extname(source.file_path || "").toLowerCase();
  if (!source.file_path) {
    throw new Error("Aucun chemin de fichier pour cette source.");
  }

  if (ext === ".txt") {
    const txt = await fs.readFile(source.file_path, "utf8");
    return normalizeText(txt);
  }

  if (ext === ".pdf") {
    const buf = await fs.readFile(source.file_path);
    const result = await loadPdfParse()(buf);
    return normalizeText(result.text);
  }

  if (ext === ".docx") {
    const result = await loadMammoth().extractRawText({ path: source.file_path });
    return normalizeText(result.value);
  }

  throw new Error("Format non supporté. Utilisez PDF, DOCX ou TXT.");
};

const fetchApiContentAsText = async (source) => {
  if (!source.api_url) {
    throw new Error("URL API manquante.");
  }

  const method = (source.api_method || "GET").toUpperCase();
  const headers = safeJsonParse(source.api_headers, {});
  const body = source.api_body && method !== "GET" ? source.api_body : undefined;

  const response = await fetch(source.api_url, {
    method,
    headers: typeof headers === "object" ? headers : {},
    body,
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`API HTTP ${response.status}: ${txt.slice(0, 400)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return normalizeText(JSON.stringify(data, null, 2));
  }

  const text = await response.text();
  return normalizeText(text);
};

const toPublicSource = (row) => ({
  id: row.id,
  typeSource: row.type_source,
  title: row.title,
  description: row.description,
  fileName: row.file_name,
  filePath: row.file_path,
  apiUrl: row.api_url,
  apiMethod: row.api_method,
  apiHeaders: safeJsonParse(row.api_headers, {}),
  apiBody: row.api_body,
  status: row.status,
  isActive: !!row.is_active,
  processedAt: row.processed_at,
  lastError: row.last_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const insertSource = async (payload) => {
  if (!SOURCE_TYPES.has(payload.typeSource)) {
    throw new Error("typeSource invalide.");
  }

  const result = await dbQuery(
    `INSERT INTO knowledge_sources
      (type_source, title, description, original_content, processed_content, file_name, file_path,
       api_url, api_method, api_headers, api_body, status, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      payload.typeSource,
      payload.title,
      payload.description || null,
      payload.originalContent || null,
      payload.fileName || null,
      payload.filePath || null,
      payload.apiUrl || null,
      payload.apiMethod || "GET",
      stringifyHeaders(payload.apiHeaders),
      payload.apiBody || null,
      SOURCE_STATUS.PENDING,
      payload.isActive == null ? 1 : payload.isActive ? 1 : 0,
    ]
  );
  return result.insertId;
};

const getSourceById = async (sourceId) => {
  const rows = await dbQuery(
    "SELECT * FROM knowledge_sources WHERE id = ? LIMIT 1",
    [sourceId]
  );
  return rows[0] || null;
};

const listSources = async () => {
  const rows = await dbQuery(
    `SELECT id, type_source, title, description, file_name, file_path, api_url, api_method,
            api_headers, api_body, status, is_active, processed_at, last_error, created_at, updated_at
     FROM knowledge_sources
     ORDER BY updated_at DESC, id DESC`
  );
  return rows.map(toPublicSource);
};

const updateSource = async (sourceId, payload) => {
  const current = await getSourceById(sourceId);
  if (!current) return null;

  const nextType = payload.typeSource || current.type_source;
  if (!SOURCE_TYPES.has(nextType)) {
    throw new Error("typeSource invalide.");
  }

  await dbQuery(
    `UPDATE knowledge_sources
     SET type_source = ?,
         title = ?,
         description = ?,
         original_content = ?,
         api_url = ?,
         api_method = ?,
         api_headers = ?,
         api_body = ?,
         is_active = ?,
         status = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [
      nextType,
      payload.title ?? current.title,
      payload.description ?? current.description,
      payload.originalContent ?? current.original_content,
      payload.apiUrl ?? current.api_url,
      payload.apiMethod ?? current.api_method,
      stringifyHeaders(payload.apiHeaders ?? safeJsonParse(current.api_headers, {})),
      payload.apiBody ?? current.api_body,
      payload.isActive == null ? current.is_active : payload.isActive ? 1 : 0,
      SOURCE_STATUS.PENDING,
      sourceId,
    ]
  );

  return getSourceById(sourceId);
};

const deleteSource = async (sourceId) => {
  await dbQuery("DELETE FROM knowledge_sources WHERE id = ?", [sourceId]);
};

const setSourceStatus = async ({
  sourceId,
  status,
  processedContent,
  lastError = null,
}) => {
  await dbQuery(
    `UPDATE knowledge_sources
     SET status = ?,
         processed_content = ?,
         processed_at = CASE WHEN ? = 'processed' THEN NOW() ELSE processed_at END,
         last_error = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [status, processedContent || null, status, lastError, sourceId]
  );
};

const replaceChunks = async (sourceId, chunks) => {
  await dbQuery("DELETE FROM knowledge_chunks WHERE source_id = ?", [sourceId]);
  if (!chunks.length) return;

  const values = chunks.map((chunk, idx) => [sourceId, idx + 1, chunk, chunk.length]);
  await dbQuery(
    `INSERT INTO knowledge_chunks
      (source_id, chunk_index, chunk_text, token_count_estimate)
     VALUES ?`,
    [values]
  );
};

const processSource = async (sourceId) => {
  const source = await getSourceById(sourceId);
  if (!source) {
    throw new Error("Source introuvable.");
  }

  try {
    let rawText = "";
    if (source.type_source === "text") {
      rawText = normalizeText(source.original_content);
    } else if (source.type_source === "document") {
      rawText = await extractFromDocument(source);
    } else if (source.type_source === "api") {
      rawText = await fetchApiContentAsText(source);
    }

    if (!rawText) {
      throw new Error("Le contenu extrait est vide.");
    }

    const chunks = chunkText(rawText);
    await replaceChunks(sourceId, chunks);
    await setSourceStatus({
      sourceId,
      status: SOURCE_STATUS.PROCESSED,
      processedContent: rawText,
      lastError: null,
    });

    return {
      sourceId,
      chunks: chunks.length,
      processedLength: rawText.length,
    };
  } catch (err) {
    await setSourceStatus({
      sourceId,
      status: SOURCE_STATUS.ERROR,
      processedContent: null,
      lastError: err.message,
    });
    throw err;
  }
};

const searchRelevantChunks = async (question, limit = 5) => {
  const cleanQuestion = normalizeText(question);
  if (!cleanQuestion) return [];

  const tokens = Array.from(
    new Set(
      cleanQuestion
        .toLowerCase()
        .split(/[^a-zA-Z0-9àâäéèêëïîôöùûüç]+/g)
        .filter((t) => t.length >= 3)
        .slice(0, 8)
    )
  );

  if (!tokens.length) return [];

  const scoreExpr = tokens
    .map(() => "CASE WHEN LOWER(kc.chunk_text) LIKE ? THEN 1 ELSE 0 END")
    .join(" + ");
  const scoreParams = tokens.map((t) => `%${t}%`);

  const rows = await dbQuery(
    `SELECT kc.id,
            kc.source_id,
            kc.chunk_text,
            ks.title AS source_title,
            ks.type_source,
            (${scoreExpr}) AS score
     FROM knowledge_chunks kc
     JOIN knowledge_sources ks ON ks.id = kc.source_id
     WHERE ks.is_active = 1
       AND ks.status = 'processed'
     ORDER BY score DESC, kc.id DESC
     LIMIT ?`,
    [...scoreParams, Number(limit) || 5]
  );

  return rows.filter((row) => Number(row.score) > 0);
};

module.exports = {
  SOURCE_STATUS,
  insertSource,
  getSourceById,
  listSources,
  updateSource,
  deleteSource,
  processSource,
  searchRelevantChunks,
  toPublicSource,
  dbQuery,
};
