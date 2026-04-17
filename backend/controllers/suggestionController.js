const { getBotById } = require("../models/botModel");
const {
  listSuggestionsByBot,
  createSuggestion,
  updateSuggestion,
  deleteSuggestion,
} = require("../models/botSuggestionModel");

async function listSuggestionsHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const bot = await getBotById(botId);
    if (!bot) return res.status(404).json({ error: "Bot introuvable." });
    const rows = await listSuggestionsByBot(botId);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

async function createSuggestionHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const bot = await getBotById(botId);
    if (!bot) return res.status(404).json({ error: "Bot introuvable." });

    const questionText = String(req.body.questionText || "").trim();
    const category = req.body.category ? String(req.body.category).trim() : null;
    if (!questionText) {
      return res.status(400).json({ error: "questionText est requis." });
    }

    const item = await createSuggestion(botId, questionText, category);
    return res.status(201).json(item);
  } catch (err) {
    return next(err);
  }
}

async function updateSuggestionHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const suggestionId = Number(req.params.suggestionId);
    const questionText = String(req.body.questionText || "").trim();
    const category = req.body.category ? String(req.body.category).trim() : null;

    if (!questionText) {
      return res.status(400).json({ error: "questionText est requis." });
    }

    const item = await updateSuggestion(botId, suggestionId, {
      questionText,
      category,
    });
    if (!item) return res.status(404).json({ error: "Suggestion introuvable." });
    return res.status(200).json(item);
  } catch (err) {
    return next(err);
  }
}

async function deleteSuggestionHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const suggestionId = Number(req.params.suggestionId);
    const ok = await deleteSuggestion(botId, suggestionId);
    if (!ok) return res.status(404).json({ error: "Suggestion introuvable." });
    return res.status(200).json({ message: "Suggestion supprimée." });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listSuggestionsHandler,
  createSuggestionHandler,
  updateSuggestionHandler,
  deleteSuggestionHandler,
};

