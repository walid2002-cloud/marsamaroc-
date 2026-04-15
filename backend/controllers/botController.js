const {
  createBot,
  listBots,
  getBotById,
  updateBot,
  patchBotStatus,
  deleteBot,
} = require("../models/botModel");
const { slugify } = require("../utils/slugify");

async function createBotHandler(req, res, next) {
  try {
    const { name, slug, domain, description, status, whatsappEnabled, promptGuardrails } =
      req.body;
    if (!name || !domain) {
      return res.status(400).json({ error: "name et domain sont requis." });
    }
    const payload = {
      name: String(name).trim(),
      slug: slugify(slug || name),
      domain: String(domain).trim(),
      description: description || null,
      status: status === "inactive" ? "inactive" : "active",
      whatsappEnabled: whatsappEnabled == null ? true : !!whatsappEnabled,
      promptGuardrails: promptGuardrails || null,
      createdByAdminId: req.body.createdByAdminId || null,
    };
    const bot = await createBot(payload);
    return res.status(201).json(bot);
  } catch (err) {
    if (String(err.message || "").includes("Duplicate entry")) {
      return res.status(409).json({ error: "Slug déjà utilisé." });
    }
    return next(err);
  }
}

async function listBotsHandler(_req, res, next) {
  try {
    const bots = await listBots();
    return res.status(200).json(bots);
  } catch (err) {
    return next(err);
  }
}

async function getBotHandler(req, res, next) {
  try {
    const bot = await getBotById(Number(req.params.id));
    if (!bot) return res.status(404).json({ error: "Bot introuvable." });
    return res.status(200).json(bot);
  } catch (err) {
    return next(err);
  }
}

async function updateBotHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const current = await getBotById(id);
    if (!current) return res.status(404).json({ error: "Bot introuvable." });
    const payload = {
      name: String(req.body.name || current.name).trim(),
      slug: slugify(req.body.slug || current.slug),
      domain: String(req.body.domain || current.domain).trim(),
      description: req.body.description ?? current.description,
      status: req.body.status || current.status,
      whatsappEnabled:
        req.body.whatsappEnabled == null ? current.whatsappEnabled : !!req.body.whatsappEnabled,
      whatsappPhone: req.body.whatsappPhone ?? current.whatsappPhone,
      promptGuardrails: req.body.promptGuardrails ?? current.promptGuardrails,
    };
    const updated = await updateBot(id, payload);
    return res.status(200).json(updated);
  } catch (err) {
    if (String(err.message || "").includes("Duplicate entry")) {
      return res.status(409).json({ error: "Slug déjà utilisé." });
    }
    return next(err);
  }
}

async function patchBotStatusHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const status = req.body.status === "inactive" ? "inactive" : "active";
    const updated = await patchBotStatus(id, status);
    if (!updated) return res.status(404).json({ error: "Bot introuvable." });
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

async function deleteBotHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const current = await getBotById(id);
    if (!current) return res.status(404).json({ error: "Bot introuvable." });
    await deleteBot(id);
    return res.status(200).json({ message: "Bot supprimé." });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createBotHandler,
  listBotsHandler,
  getBotHandler,
  updateBotHandler,
  patchBotStatusHandler,
  deleteBotHandler,
};

