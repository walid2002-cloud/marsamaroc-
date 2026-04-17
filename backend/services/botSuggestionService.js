const {
  listSuggestionsByBot,
} = require("../models/botSuggestionModel");

const GREETING_TRIGGERS = new Set(["bonjour", "hello", "hi", "salam", "salut"]);
const HELP_TRIGGERS = new Set(["help", "aide", "?"]);

function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function shouldSendSuggestionsMessage({ rawText, isFirstInteraction }) {
  const normalized = normalizeText(rawText);
  if (!normalized) return true;
  if (isFirstInteraction) return true;
  if (GREETING_TRIGGERS.has(normalized)) return true;
  if (HELP_TRIGGERS.has(normalized)) return true;
  return false;
}

function buildSuggestionsMessage(botName, suggestions) {
  if (!suggestions.length) {
    return `Bonjour 👋\nJe suis le bot ${botName}.\n\nJe suis prêt à vous aider. Posez-moi votre question métier en détail.`;
  }

  const lines = suggestions
    .slice(0, 8)
    .map((item, idx) => `${idx + 1}. ${item.questionText}`);

  return `Bonjour 👋\nJe suis le bot ${botName}.\n\nVoici quelques questions que vous pouvez poser :\n\n${lines.join("\n")}`;
}

async function generateSuggestionsReply(botId, botName) {
  const suggestions = await listSuggestionsByBot(botId);
  const text = buildSuggestionsMessage(botName, suggestions);
  return { text, suggestions };
}

module.exports = {
  shouldSendSuggestionsMessage,
  generateSuggestionsReply,
  normalizeText,
};

