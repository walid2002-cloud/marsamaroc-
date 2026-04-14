const express = require("express");
const path = require("path");
const {
  insertSource,
  getSourceById,
  listSources,
  updateSource,
  deleteSource,
  processSource,
  searchRelevantChunks,
  toPublicSource,
} = require("../services/knowledgeService");
const { uploadKnowledgeDoc } = require("../middleware/knowledgeUpload");

const router = express.Router();

const parseJsonSafely = (value, fallback) => {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

router.get("/sources", async (_req, res) => {
  try {
    const sources = await listSources();
    return res.status(200).json(sources);
  } catch (err) {
    console.error("List knowledge sources error:", err);
    return res.status(500).json({ error: "Impossible de lister les sources." });
  }
});

router.get("/sources/:id", async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ error: "ID source invalide." });
  }
  try {
    const source = await getSourceById(sourceId);
    if (!source) return res.status(404).json({ error: "Source introuvable." });
    return res.status(200).json(toPublicSource(source));
  } catch (err) {
    console.error("Get knowledge source error:", err);
    return res.status(500).json({ error: "Impossible de charger la source." });
  }
});

router.post("/sources/text", async (req, res) => {
  const { title, content, description, isActive } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "title et content sont requis." });
  }

  try {
    const sourceId = await insertSource({
      typeSource: "text",
      title: String(title).trim(),
      description: description || null,
      originalContent: String(content),
      isActive,
    });

    const processed = await processSource(sourceId);
    return res.status(201).json({
      message: "Source texte ajoutée et traitée.",
      sourceId,
      processing: processed,
    });
  } catch (err) {
    console.error("Create text source error:", err);
    return res
      .status(500)
      .json({ error: "Échec ajout source texte.", details: err.message });
  }
});

router.post("/sources/document", uploadKnowledgeDoc.single("file"), async (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();

  if (!title) {
    return res.status(400).json({ error: "Le titre est requis." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Le fichier est requis." });
  }

  try {
    const sourceId = await insertSource({
      typeSource: "document",
      title,
      description: description || null,
      fileName: req.file.originalname,
      filePath: req.file.path,
      originalContent: null,
      isActive: req.body.isActive,
    });

    const processed = await processSource(sourceId);
    return res.status(201).json({
      message: "Document ajouté et traité.",
      sourceId,
      file: {
        name: req.file.originalname,
        path: req.file.path,
        ext: path.extname(req.file.originalname || "").toLowerCase(),
      },
      processing: processed,
    });
  } catch (err) {
    console.error("Create document source error:", err);
    return res
      .status(500)
      .json({ error: "Échec upload document.", details: err.message });
  }
});

router.post("/sources/api", async (req, res) => {
  const {
    title,
    description,
    apiUrl,
    apiMethod = "GET",
    apiHeaders = {},
    apiBody = null,
    isActive,
  } = req.body;
  if (!title || !apiUrl) {
    return res.status(400).json({ error: "title et apiUrl sont requis." });
  }

  try {
    const sourceId = await insertSource({
      typeSource: "api",
      title: String(title).trim(),
      description: description || null,
      apiUrl: String(apiUrl).trim(),
      apiMethod: String(apiMethod || "GET").toUpperCase(),
      apiHeaders,
      apiBody: apiBody ? String(apiBody) : null,
      isActive,
    });

    const processed = await processSource(sourceId);
    return res.status(201).json({
      message: "Source API ajoutée et synchronisée.",
      sourceId,
      processing: processed,
    });
  } catch (err) {
    console.error("Create API source error:", err);
    return res
      .status(500)
      .json({ error: "Échec ajout source API.", details: err.message });
  }
});

router.put("/sources/:id", async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ error: "ID source invalide." });
  }

  try {
    const updated = await updateSource(sourceId, {
      typeSource: req.body.typeSource,
      title: req.body.title,
      description: req.body.description,
      originalContent: req.body.content,
      apiUrl: req.body.apiUrl,
      apiMethod: req.body.apiMethod,
      apiHeaders: parseJsonSafely(req.body.apiHeaders, req.body.apiHeaders),
      apiBody: req.body.apiBody,
      isActive: req.body.isActive,
    });
    if (!updated) {
      return res.status(404).json({ error: "Source introuvable." });
    }
    return res.status(200).json({
      message: "Source mise à jour. Relancez le traitement.",
      source: toPublicSource(updated),
    });
  } catch (err) {
    console.error("Update source error:", err);
    return res.status(500).json({
      error: "Échec mise à jour source.",
      details: err.message,
    });
  }
});

router.delete("/sources/:id", async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ error: "ID source invalide." });
  }
  try {
    await deleteSource(sourceId);
    return res.status(200).json({ message: "Source supprimée." });
  } catch (err) {
    console.error("Delete source error:", err);
    return res.status(500).json({ error: "Échec suppression source." });
  }
});

router.post("/sources/:id/process", async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ error: "ID source invalide." });
  }
  try {
    const result = await processSource(sourceId);
    return res.status(200).json({
      message: "Source traitée.",
      processing: result,
    });
  } catch (err) {
    console.error("Process source error:", err);
    return res
      .status(500)
      .json({ error: "Échec traitement source.", details: err.message });
  }
});

router.post("/sources/:id/refresh-api", async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ error: "ID source invalide." });
  }
  try {
    const source = await getSourceById(sourceId);
    if (!source) return res.status(404).json({ error: "Source introuvable." });
    if (source.type_source !== "api") {
      return res.status(400).json({ error: "Cette source n'est pas de type API." });
    }
    const result = await processSource(sourceId);
    return res.status(200).json({ message: "API rafraîchie.", processing: result });
  } catch (err) {
    console.error("Refresh API source error:", err);
    return res.status(500).json({
      error: "Échec rafraîchissement API.",
      details: err.message,
    });
  }
});

router.post("/search", async (req, res) => {
  const question = String(req.body.question || "");
  const limit = Number(req.body.limit || 5);
  if (!question.trim()) {
    return res.status(400).json({ error: "question requise." });
  }
  try {
    const hits = await searchRelevantChunks(question, limit);
    return res.status(200).json({ hits });
  } catch (err) {
    console.error("Knowledge search error:", err);
    return res.status(500).json({ error: "Échec recherche knowledge base." });
  }
});

module.exports = router;
