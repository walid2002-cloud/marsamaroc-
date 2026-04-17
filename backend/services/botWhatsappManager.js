const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
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
const {
  shouldSendSuggestionsMessage,
  generateSuggestionsReply,
} = require("./botSuggestionService");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[whatsapp]";
function log(botId, ...args) {
  console.log(`${LOG_PREFIX} [bot=${botId}]`, ...args);
}
function logWarn(botId, ...args) {
  console.warn(`${LOG_PREFIX} [bot=${botId}]`, ...args);
}
function logError(botId, ...args) {
  console.error(`${LOG_PREFIX} [bot=${botId}]`, ...args);
}
function logGlobal(...args) {
  console.log(`${LOG_PREFIX}`, ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label = "operation") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

const CHROMIUM_LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

const SINGLETON_ERROR_RE =
  /profile appears to be in use|ProcessSingleton|SingletonLock|Failed to launch the browser/i;

const RECOVERABLE_RESTORE_RE =
  /restore failed|profile appears to be in use|ProcessSingleton|Failed to launch the browser|SingletonLock/i;

function removeLockFile(filePath) {
  try { fs.chmodSync(filePath, 0o666); } catch (_) { /* ignore */ }
  try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  try { fs.rmSync(filePath, { force: true }); } catch (_) { /* ignore */ }
}

function cleanSessionLocks(sessionDir) {
  if (!sessionDir || !fs.existsSync(sessionDir)) return;
  let cleaned = 0;
  for (const name of CHROMIUM_LOCK_FILES) {
    const fp = path.join(sessionDir, name);
    if (fs.existsSync(fp)) {
      removeLockFile(fp);
      cleaned++;
    }
    const defaultSubDir = path.join(sessionDir, "Default");
    const fpSub = path.join(defaultSubDir, name);
    if (fs.existsSync(fpSub)) {
      removeLockFile(fpSub);
      cleaned++;
    }
  }
  return cleaned;
}

function cleanAllSessionLocks(authPath) {
  if (!fs.existsSync(authPath)) return;
  let entries;
  try {
    entries = fs.readdirSync(authPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.isDirectory() && ent.name.startsWith("session-")) {
      cleanSessionLocks(path.join(authPath, ent.name));
    }
  }
}

function killOrphanChromiumProcesses() {
  if (process.env.SKIP_CHROMIUM_PKILL === "1") return;
  try {
    execSync("pkill -9 -f chromium 2>/dev/null || true", { stdio: "ignore" });
  } catch (_) { /* ignore */ }
}

function resolveChromiumPath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const fallbacks = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
  for (const p of fallbacks) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function shouldRestoreRow(row) {
  if (row.session_status === "connected" || row.session_status === "initializing") {
    return true;
  }
  if (row.session_status === "error" && RECOVERABLE_RESTORE_RE.test(row.error_message || "")) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// BotWhatsappManager
// ---------------------------------------------------------------------------

class BotWhatsappManager {
  constructor() {
    this.clients = new Map();
    this._initLocks = new Map();
    this.authPath =
      process.env.WWEBJS_AUTH_PATH || path.resolve(__dirname, "..", "..", ".wwebjs_auth");
    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
    this._chromiumPath = resolveChromiumPath();
    logGlobal("auth path:", this.authPath);
    if (this._chromiumPath) {
      logGlobal("chromium executable:", this._chromiumPath);
    } else {
      logGlobal("chromium executable: using bundled Puppeteer chromium");
    }
  }

  // ---- path helpers -------------------------------------------------------

  _sessionName(bot) {
    return `bot-${bot.id}-${bot.slug}`;
  }

  _sessionDir(bot) {
    return path.join(this.authPath, `session-${this._sessionName(bot)}`);
  }

  // ---- low-level cleanup --------------------------------------------------

  cleanBotSessionLocks(bot) {
    const dir = this._sessionDir(bot);
    const n = cleanSessionLocks(dir);
    if (n) log(bot.id, `cleaned ${n} Chromium lock file(s) in ${dir}`);
  }

  async removeBotSessionFolder(botId) {
    const bot = await getBotById(botId);
    if (!bot) throw new Error("Bot introuvable.");
    const dir = this._sessionDir(bot);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      log(botId, "removed session folder:", dir);
    }
  }

  // ---- destroy client safely ----------------------------------------------

  async destroyBotClient(botId) {
    const client = this.clients.get(botId);
    if (!client) return;
    log(botId, "destroying client...");
    try {
      await withTimeout(client.destroy(), 15_000, "client.destroy");
    } catch (err) {
      logWarn(botId, "destroy failed (force-killing):", err.message);
      try {
        if (client.pupBrowser) {
          const proc = client.pupBrowser.process();
          if (proc) proc.kill("SIGKILL");
        }
      } catch (_) { /* ignore */ }
    }
    this.clients.delete(botId);
    const bot = await getBotById(botId).catch(() => null);
    if (bot) {
      await sleep(200);
      this.cleanBotSessionLocks(bot);
    }
    log(botId, "client destroyed");
  }

  // ---- init guard ---------------------------------------------------------

  _acquireInitLock(botId) {
    if (this._initLocks.get(botId)) {
      throw new Error("Une initialisation est déjà en cours pour ce bot.");
    }
    this._initLocks.set(botId, true);
  }

  _releaseInitLock(botId) {
    this._initLocks.delete(botId);
  }

  // ---- core init ----------------------------------------------------------

  async initBot(botId, opts = {}) {
    const bot = await getBotById(botId);
    if (!bot) throw new Error("Bot introuvable.");

    this._acquireInitLock(bot.id);
    try {
      return await this._doInitBot(bot, opts);
    } finally {
      this._releaseInitLock(bot.id);
    }
  }

  async _doInitBot(bot, opts) {
    const sessionName = this._sessionName(bot);
    log(bot.id, `init session="${sessionName}"`);

    await upsertSession(bot.id, sessionName);
    await updateSession(bot.id, {
      sessionStatus: "initializing",
      errorMessage: null,
      phoneNumber: null,
      qrCodeData: null,
    });

    await this.destroyBotClient(bot.id);

    const sessionDir = this._sessionDir(bot);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
      log(bot.id, "created session dir:", sessionDir);
    }
    this.cleanBotSessionLocks(bot);
    await sleep(200);

    const puppeteerOpts = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--single-process",
      ],
    };
    if (this._chromiumPath) {
      puppeteerOpts.executablePath = this._chromiumPath;
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionName,
        dataPath: this.authPath,
      }),
      puppeteer: puppeteerOpts,
    });

    // --- events ---

    client.on("qr", async (qr) => {
      log(bot.id, "QR generated");
      const qrDataUrl = await QRCode.toDataURL(qr);
      await updateSession(bot.id, {
        sessionStatus: "qr_ready",
        qrCodeData: qrDataUrl,
        errorMessage: null,
      });
    });

    client.on("ready", async () => {
      const phone = client?.info?.wid?.user ? `+${client.info.wid.user}` : null;
      log(bot.id, "client ready, phone:", phone || "(unknown)");
      await updateSession(bot.id, {
        sessionStatus: "connected",
        qrCodeData: null,
        phoneNumber: phone,
        lastConnectedAt: new Date(),
        errorMessage: null,
      });
    });

    client.on("authenticated", async () => {
      log(bot.id, "authenticated");
      await updateSession(bot.id, { sessionStatus: "initializing", errorMessage: null });
    });

    client.on("auth_failure", async (msg) => {
      logError(bot.id, "auth_failure:", msg);
      await this.destroyBotClient(bot.id);
      await updateSession(bot.id, {
        sessionStatus: "error",
        errorMessage: String(msg || "auth_failure"),
      });
    });

    client.on("disconnected", async (reason) => {
      logWarn(bot.id, "disconnected:", reason);
      this.clients.delete(bot.id);
      this.cleanBotSessionLocks(bot);
      await updateSession(bot.id, {
        sessionStatus: "disconnected",
        qrCodeData: null,
        phoneNumber: null,
        lastConnectedAt: null,
        errorMessage: String(reason || "disconnected"),
      });
    });

    client.on("message", async (message) => {
      try {
        await this.handleIncomingMessage(bot.id, message);
      } catch (err) {
        logError(bot.id, "message handler error:", err.message);
      }
    });

    // --- initialize ---

    this.clients.set(bot.id, client);

    try {
      log(bot.id, "launching Chromium + WhatsApp Web...");
      await client.initialize();
      log(bot.id, "initialize() done");
    } catch (err) {
      const errMsg = String(err?.message || err || "");
      logError(bot.id, "initialize() failed:", errMsg);

      try { await this.destroyBotClient(bot.id); } catch (_) { /* ignore */ }
      this.clients.delete(bot.id);

      if (SINGLETON_ERROR_RE.test(errMsg) && !opts._retriedSingleton) {
        logWarn(bot.id, "singleton lock detected, cleaning & retrying once...");
        this.cleanBotSessionLocks(bot);
        await sleep(600);
        this._releaseInitLock(bot.id);
        return this.initBot(bot.id, { _retriedSingleton: true });
      }

      await updateSession(bot.id, {
        sessionStatus: "error",
        errorMessage: errMsg,
      });
      throw err;
    }

    return this.getStatus(bot.id);
  }

  // ---- incoming messages --------------------------------------------------

  async handleIncomingMessage(botId, message) {
    if (!message || message.fromMe) return;

    const bot = await getBotById(botId);
    if (!bot) return;

    const contactPhone = String(message.from || "").replace(/@.*/, "");
    const contactName = message._data?.notifyName || null;
    const text = String(message.body || "").trim();
    const userTextToStore = text || "(message vide)";

    const { conversationId, isNewConversation } = await findOrCreateConversation(
      botId,
      contactPhone,
      contactName
    );
    await addMessage({
      botId,
      conversationId,
      senderType: "user",
      messageText: userTextToStore,
      waMessageId: message.id?._serialized || null,
    });

    let replyText = "";
    const shouldSuggest = shouldSendSuggestionsMessage({
      rawText: text,
      isFirstInteraction: isNewConversation,
    });

    if (shouldSuggest) {
      const suggested = await generateSuggestionsReply(botId, bot.name);
      replyText = suggested.text;
    } else {
      const reply = await generateReplyForBot(botId, text);
      replyText = reply.text || "Je ne dispose pas de cette information dans mes sources.";
    }

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

  // ---- disconnect ---------------------------------------------------------

  async disconnectBot(botId) {
    log(botId, "disconnect requested");
    await this.destroyBotClient(botId);
    await updateSession(botId, {
      sessionStatus: "disconnected",
      qrCodeData: null,
      phoneNumber: null,
      lastConnectedAt: null,
      errorMessage: null,
    });
    log(botId, "disconnect complete");
    return this.getStatus(botId);
  }

  // ---- reset (full wipe of local session) ---------------------------------

  async resetWhatsappSession(botId) {
    log(botId, "full session reset requested");
    await this.disconnectBot(botId);
    await this.removeBotSessionFolder(botId);
    log(botId, "session reset complete");
    return this.getStatus(botId);
  }

  // ---- restart (disconnect + re-init) -------------------------------------

  async restartBot(botId) {
    log(botId, "restart requested");
    const row = await getSessionByBotId(botId);
    const wasConnected = row?.session_status === "connected";
    await this.disconnectBot(botId);
    if (!wasConnected) {
      await this.removeBotSessionFolder(botId);
    }
    return this.initBot(botId);
  }

  // ---- status -------------------------------------------------------------

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

  // ---- restore at startup -------------------------------------------------

  async restoreTrackedSessions() {
    logGlobal("=== restoring tracked sessions ===");

    killOrphanChromiumProcesses();
    await sleep(500);
    cleanAllSessionLocks(this.authPath);
    logGlobal("orphan chromium killed, all locks cleaned");

    const sessions = await listSessions();
    const toRestore = sessions.filter(shouldRestoreRow);
    logGlobal(`${toRestore.length}/${sessions.length} session(s) to restore`);

    for (const row of toRestore) {
      try {
        log(row.bot_id, `restoring (was ${row.session_status})...`);
        await this.initBot(row.bot_id);
      } catch (err) {
        logError(row.bot_id, "restore failed:", err.message);
        await updateSession(row.bot_id, {
          sessionStatus: "error",
          errorMessage: `restore failed: ${err.message}`,
        });
      }
    }

    logGlobal("=== session restore complete ===");
  }
}

module.exports = new BotWhatsappManager();
