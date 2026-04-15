const { listBotDomains, getBotById } = require("../models/botModel");
const { searchBotKnowledge } = require("./botSourceService");

const LLAMA_CPP_URL = process.env.LLAMA_CPP_URL || "";

function normalize(value) {
  return String(value || "").toLowerCase();
}

function scoreDomainMatch(question, domain) {
  const q = normalize(question);
  const tokens = normalize(domain).split(/\s+/).filter((t) => t.length > 2);
  let score = 0;
  for (const token of tokens) {
    if (q.includes(token)) score += 1;
  }
  return score;
}

async function checkDomainGuard(bot, question) {
  const currentScore = scoreDomainMatch(question, bot.domain);
  const domains = await listBotDomains();
  let best = { id: bot.id, score: currentScore, domain: bot.domain };

  for (const d of domains) {
    const score = scoreDomainMatch(question, d.domain);
    if (score > best.score) {
      best = { id: d.id, score, domain: d.domain };
    }
  }

  if (best.id !== bot.id && best.score >= Math.max(1, currentScore + 1)) {
    return {
      allowed: false,
      reason: `Je suis le bot ${bot.name} (${bot.domain}). Votre question semble relever du domaine ${best.domain}.`,
    };
  }
  return { allowed: true };
}

function buildGuardrailPrompt(bot, context, question) {
  return `
Tu es ${bot.name}, bot métier dédié au domaine "${bot.domain}".
Règles strictes:
1) Tu réponds uniquement au domaine "${bot.domain}".
2) Tu n'utilises que le CONTEXTE fourni ci-dessous.
3) Si l'information n'est pas dans le contexte, réponds: "Je ne dispose pas de cette information dans mes sources."
4) N'hallucine jamais.
5) Sois professionnel, clair et concis.
${bot.promptGuardrails ? `6) Guardrails métier admin:\n${bot.promptGuardrails}` : ""}

CONTEXTE:
${context || "(aucun)"}

QUESTION:
${question}
`;
}

async function askLlama(prompt) {
  if (!LLAMA_CPP_URL) return null;
  try {
    const response = await fetch(`${LLAMA_CPP_URL}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        n_predict: 350,
        temperature: 0.2,
        stop: ["</s>"],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return String(data.content || data.response || "").trim() || null;
  } catch {
    return null;
  }
}

async function generateReplyForBot(botId, question) {
  const bot = await getBotById(botId);
  if (!bot) {
    return { text: "Bot introuvable.", status: "error" };
  }
  if (bot.status !== "active") {
    return { text: "Ce bot est actuellement désactivé.", status: "inactive" };
  }

  const guard = await checkDomainGuard(bot, question);
  if (!guard.allowed) {
    return { text: guard.reason, status: "out_of_domain" };
  }

  const chunks = await searchBotKnowledge(bot.id, question, 6);
  if (!chunks.length) {
    return {
      text: "Je ne dispose pas de cette information dans mes sources.",
      status: "no_data",
    };
  }

  const context = chunks.map((c, idx) => `[${idx + 1}] ${c.chunk_text}`).join("\n\n");
  const prompt = buildGuardrailPrompt(bot, context, question);
  const modelText = await askLlama(prompt);
  return {
    text: modelText || "Je ne dispose pas de cette information dans mes sources.",
    status: modelText ? "answered" : "fallback_no_model",
  };
}

module.exports = { generateReplyForBot };

