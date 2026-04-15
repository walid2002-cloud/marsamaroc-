const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { getBotById } = require("../models/botModel");
const {
  upsertSession,
  updateSession,
  getSessionByBotId,
  listSessions,
} = require("../models/whatsappSessionModel");
const {
  findOrCreateConversation,
  addMessage,
} = require("../models/conversationModel");
const { generateReplyForBot } = require("./aiOrchestratorService");

class BotWhatsappManager {
  constructor() {
    this.clients = new Map();
    this.authPath =
      process.env.WWEBJS_AUTH_PATH || path.join(__dirname, "..", "..", ".wwebjs_auth");
    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
  }

  _sessionName(bot) {
    return `bot-${bot.id}-${bot.slug}`;
  }

  async initBot(botId) {
    const bot = await getBotById(botId);
    if (!bot) throw new Error("Bot introuvable.");

    const sessionName = this._sessionName(bot);
    await upsertSession(bot.id, sessionName);
    await updateSession(bot.id, {
      sessionStatus: "initializing",
      errorMessage: null,
    });

    if (this.clients.has(bot.id)) {
      return this.getStatus(bot.id);
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionName,
        dataPath: this.authPath,
      }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    client.on("qr", async (qr) => {
      const qrDataUrl = await QRCode.toDataURL(qr);
      await updateSession(bot.id, {
        sessionStatus: "qr_ready",
        qrCodeData: qrDataUrl,
        errorMessage: null,
      });
    });

    client.on("ready", async () => {
      const phone = client?.info?.wid?.user ? `+${client.info.wid.user}` : null;
      await updateSession(bot.id, {
        sessionStatus: "connected",
        qrCodeData: null,
        phoneNumber: phone,
        lastConnectedAt: new Date(),
        errorMessage: null,
      });
    });

    client.on("authenticated", async () => {
      await updateSession(bot.id, { sessionStatus: "initializing", errorMessage: null });
    });

    client.on("auth_failure", async (msg) => {
      await updateSession(bot.id, {
        sessionStatus: "error",
        errorMessage: String(msg || "auth_failure"),
      });
    });

    client.on("disconnected", async (reason) => {
      await updateSession(bot.id, {
        sessionStatus: "disconnected",
        qrCodeData: null,
        errorMessage: String(reason || "disconnected"),
      });
      this.clients.delete(bot.id);
    });

    client.on("message", async (message) => {
      try {
        await this.handleIncomingMessage(bot.id, message);
      } catch (err) {
        await updateSession(bot.id, {
          sessionStatus: "error",
          errorMessage: `message handler: ${err.message}`,
        });
      }
    });

    this.clients.set(bot.id, client);
    await client.initialize();
    return this.getStatus(bot.id);
  }

  async handleIncomingMessage(botId, message) {
    if (!message || message.fromMe) return;

    const bot = await getBotById(botId);
    if (!bot) return;

    const contactPhone = String(message.from || "").replace(/@.*/, "");
    const contactName = message._data?.notifyName || null;
    const text = String(message.body || "").trim();
    if (!text) return;

    const conversationId = await findOrCreateConversation(botId, contactPhone, contactName);
    await addMessage({
      botId,
      conversationId,
      senderType: "user",
      messageText: text,
      waMessageId: message.id?._serialized || null,
    });

    const reply = await generateReplyForBot(botId, text);
    const replyText =
      reply.text || "Je ne dispose pas de cette information dans mes sources.";

    const client = this.clients.get(botId);
    if (client) {
      await client.sendMessage(message.from, replyText);
    }

    await addMessage({
      botId,
      conversationId,
      senderType: "bot",
      messageText: replyText,
      waMessageId: null,
    });
  }

  async disconnectBot(botId) {
    const client = this.clients.get(botId);
    if (client) {
      await client.destroy();
      this.clients.delete(botId);
    }
    await updateSession(botId, {
      sessionStatus: "disconnected",
      qrCodeData: null,
      errorMessage: null,
    });
    return this.getStatus(botId);
  }

  async restartBot(botId) {
    await this.disconnectBot(botId);
    return this.initBot(botId);
  }

  async getStatus(botId) {
    const row = await getSessionByBotId(botId);
    if (!row) {
      return {
        sessionStatus: "disconnected",
        qrCodeData: null,
        phoneNumber: null,
        errorMessage: null,
      };
    }
    return {
      id: row.id,
      botId: row.bot_id,
      sessionName: row.session_name,
      sessionStatus: row.session_status,
      qrCodeData: row.qr_code_data,
      phoneNumber: row.phone_number,
      lastConnectedAt: row.last_connected_at,
      errorMessage: row.error_message,
      updatedAt: row.updated_at,
    };
  }

  async restoreTrackedSessions() {
    const sessions = await listSessions();
    for (const row of sessions) {
      if (row.session_status === "connected" || row.session_status === "initializing") {
        try {
          await this.initBot(row.bot_id);
        } catch (err) {
          await updateSession(row.bot_id, {
            sessionStatus: "error",
            errorMessage: `restore failed: ${err.message}`,
          });
        }
      }
    }
  }
}

module.exports = new BotWhatsappManager();

