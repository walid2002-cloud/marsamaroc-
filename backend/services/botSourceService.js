const fs = require("fs/promises");
const path = require("path");
const {
  getSourceById,
  setSourceStatus,
  replaceChunks,
  getRelevantChunks,
  logApiCall,
} = require("../models/sourceModel");

const loadPdfParse = () => require("pdf-parse");

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function chunkText(text, maxLength = 1200) {
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
}

async function extractSourceText(source) {
  if (source.sourceType === "text") {
    return normalizeText(source.contentText);
  }

  if (source.sourceType === "pdf") {
    if (!source.filePath) throw new Error("Le chemin du PDF est manquant.");
    const absolute = path.resolve(source.filePath);
    const buf = await fs.readFile(absolute);
    const parsed = await loadPdfParse()(buf);
    return normalizeText(parsed.text);
  }

  if (source.sourceType === "api") {
    if (!source.apiUrl) throw new Error("L'URL API est manquante.");
    const headers = source.apiHeadersJson ? JSON.parse(source.apiHeadersJson) : {};
    const method = (source.apiMethod || "GET").toUpperCase();
    const response = await fetch(source.apiUrl, {
      method,
      headers: typeof headers === "object" ? headers : {},
    });
    const bodyText = await response.text();
    await logApiCall({
      botId: source.botId,
      sourceId: source.id,
      requestSummary: `${method} ${source.apiUrl}`,
      responseSummary: bodyText.slice(0, 1000),
      statusCode: response.status,
    });
    if (!response.ok) {
      throw new Error(`API ${response.status}: ${bodyText.slice(0, 180)}`);
    }
    return normalizeText(bodyText);
  }

  return "";
}

async function processSource(sourceId) {
  const source = await getSourceById(sourceId);
  if (!source) throw new Error("Source introuvable.");

  try {
    const content = await extractSourceText(source);
    if (!content) throw new Error("Aucun contenu exploitable.");
    const chunks = chunkText(content);
    if (!chunks.length) throw new Error("Aucun chunk généré.");
    await replaceChunks(source.botId, source.id, chunks);
    await setSourceStatus(source.id, "processed", null);
    return { chunks: chunks.length, status: "processed" };
  } catch (err) {
    await setSourceStatus(source.id, "error", err.message);
    throw err;
  }
}

async function searchBotKnowledge(botId, question, limit = 6) {
  return getRelevantChunks(botId, question, limit);
}

module.exports = {
  processSource,
  searchBotKnowledge,
  chunkText,
  normalizeText,
};

