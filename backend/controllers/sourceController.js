const {
  createSource,
  listSourcesByBot,
  getSourceById,
  updateSource,
  listApiLogsByBot,
} = require("../models/sourceModel");
const { processSource } = require("../services/botSourceService");

function parseJsonSafe(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function listSourcesHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const rows = await listSourcesByBot(botId);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

async function createTextSourceHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const { title, contentText, isActive } = req.body;
    if (!title || !contentText) {
      return res.status(400).json({ error: "title et contentText requis." });
    }
    const source = await createSource({
      botId,
      sourceType: "text",
      title: String(title).trim(),
      contentText: String(contentText),
      isActive,
    });
    const processing = await processSource(source.id);
    return res.status(201).json({ source, processing });
  } catch (err) {
    return next(err);
  }
}

async function createPdfSourceHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ error: "Titre requis." });
    if (!req.file) return res.status(400).json({ error: "Fichier PDF requis." });
    const source = await createSource({
      botId,
      sourceType: "pdf",
      title,
      filePath: req.file.path,
      isActive: req.body.isActive,
    });
    const processing = await processSource(source.id);
    return res.status(201).json({ source, processing });
  } catch (err) {
    return next(err);
  }
}

async function createApiSourceHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const { title, apiUrl, apiMethod = "GET", apiHeadersJson, apiMappingJson, isActive } = req.body;
    if (!title || !apiUrl) return res.status(400).json({ error: "title et apiUrl requis." });

    const source = await createSource({
      botId,
      sourceType: "api",
      title: String(title).trim(),
      apiUrl: String(apiUrl).trim(),
      apiMethod: String(apiMethod).toUpperCase(),
      apiHeadersJson: JSON.stringify(parseJsonSafe(apiHeadersJson, {})),
      apiMappingJson: JSON.stringify(parseJsonSafe(apiMappingJson, {})),
      isActive,
    });
    const processing = await processSource(source.id);
    return res.status(201).json({ source, processing });
  } catch (err) {
    return next(err);
  }
}

async function updateSourceHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const sourceId = Number(req.params.sourceId);
    const source = await getSourceById(sourceId);
    if (!source || source.botId !== botId) {
      return res.status(404).json({ error: "Source introuvable." });
    }
    const updated = await updateSource(sourceId, {
      title: req.body.title ?? source.title,
      contentText: req.body.contentText ?? source.contentText,
      apiUrl: req.body.apiUrl ?? source.apiUrl,
      apiMethod: req.body.apiMethod ?? source.apiMethod,
      apiHeadersJson:
        req.body.apiHeadersJson != null
          ? JSON.stringify(parseJsonSafe(req.body.apiHeadersJson, {}))
          : source.apiHeadersJson,
      apiMappingJson:
        req.body.apiMappingJson != null
          ? JSON.stringify(parseJsonSafe(req.body.apiMappingJson, {}))
          : source.apiMappingJson,
      isActive: req.body.isActive == null ? source.isActive : !!req.body.isActive,
    });
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

async function processSourceHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const sourceId = Number(req.params.sourceId);
    const source = await getSourceById(sourceId);
    if (!source || source.botId !== botId) {
      return res.status(404).json({ error: "Source introuvable." });
    }
    const result = await processSource(sourceId);
    return res.status(200).json({ processing: result });
  } catch (err) {
    return next(err);
  }
}

async function listApiLogsHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const rows = await listApiLogsByBot(botId);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listSourcesHandler,
  createTextSourceHandler,
  createPdfSourceHandler,
  createApiSourceHandler,
  updateSourceHandler,
  processSourceHandler,
  listApiLogsHandler,
};

