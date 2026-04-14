require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const { randomBytes, randomUUID } = require("crypto");
const QRCode = require("qrcode");
const db = require("./db");
const knowledgeRoutes = require("./routes/knowledgeRoutes");
const { searchRelevantChunks } = require("./services/knowledgeService");
const qrSessionService = require("./services/qrSessionService");
const qrPhoneOtpService = require("./services/qrPhoneOtpService");
const { ensureSessionSchema } = require("./services/ensureSessionSchema");
const {
  resolvePublicBaseUrl,
  resolveSmsWebOtpHost,
  pickFrontendBaseForQr,
  isLoopbackFrontendBase,
} = require("./config/publicUrl");

const app = express();
const PORT = 3000;
const LLAMA_CPP_URL = process.env.LLAMA_CPP_URL || "http://127.0.0.1:8080";
const FRONTEND_BASE_URL = resolvePublicBaseUrl();

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

app.use("/knowledge", knowledgeRoutes);

const dbQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });

const getActiveUserByQrToken = async (token) => {
  const sql = `
    SELECT id, full_name AS name, phone_number AS phone, qr_token, qr_expires_at
    FROM authorized_users
    WHERE qr_token = ?
      AND is_active = 1
      AND (qr_expires_at IS NULL OR qr_expires_at > NOW())
    LIMIT 1
  `;
  const rows = await dbQuery(sql, [token]);
  return rows[0] || null;
};

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const getIdentityFromBearer = (req) =>
  qrSessionService.getIdentityFromBearer(dbQuery, req.headers.authorization);

const loadQrSession = (token) => qrSessionService.getQrSessionByToken(dbQuery, token);

app.get("/", (req, res) => {
  res.send("Marsa Maroc Backend 🚀");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "marsa-backend" });
});

app.get("/test-db", async (req, res) => {
  try {
    const rows = await dbQuery("SELECT * FROM admins");
    return res.status(200).json(rows);
  } catch (err) {
    console.error("Database query error:", err.message);
    console.error("Database query error details:", err);
    return res.status(500).json({
      error: "Database query failed",
      details: err.message,
    });
  }
});

app.post("/admins", async (req, res) => {
  const { full_name, email, password } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({
      error: "full_name, email and password are required",
    });
  }

  try {
    const result = await dbQuery(
      "INSERT INTO admins (full_name, email, password_hash) VALUES (?, ?, ?)",
      [full_name, email, password]
    );
    return res.status(201).json({
      message: "Admin created successfully",
      id: result.insertId,
    });
  } catch (err) {
    console.error("Create admin error:", err.message);
    console.error("Create admin error details:", err);
    return res.status(500).json({
      error: "Failed to create admin",
      details: err.message,
    });
  }
});

app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  try {
    const rows = await dbQuery(
      `SELECT id, full_name, email
       FROM admins
       WHERE email = ? AND password_hash = ?
       LIMIT 1`,
      [email, password]
    );
    const admin = rows[0];

    if (!admin) {
      return res.status(401).json({ error: "Identifiants admin invalides." });
    }

    return res.status(200).json({
      message: "Connexion admin réussie",
      admin: {
        id: admin.id,
        name: admin.full_name,
        email: admin.email,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err.message);
    console.error("Admin login error details:", err);
    return res.status(500).json({
      error: "Échec de connexion admin",
      details: err.message,
    });
  }
});

app.post("/auth/register-user", async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({
      error: "Nom, email, numéro et mot de passe sont requis.",
    });
  }

  try {
    const existing = await dbQuery(
      "SELECT id FROM authorized_users WHERE phone_number = ? OR email = ? LIMIT 1",
      [phone, email]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: "Cet email ou ce numéro est déjà enregistré.",
      });
    }

    const result = await dbQuery(
      `INSERT INTO authorized_users
       (full_name, email, phone_number, password_hash, is_active, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [name, email, phone, password]
    );

    return res.status(201).json({
      message:
        "Inscription envoyée. Votre accès sera activé après validation par un administrateur.",
      userId: result.insertId,
    });
  } catch (err) {
    console.error("Register user error:", err.message);
    console.error("Register user error details:", err);
    return res.status(500).json({
      error: "Échec de l'inscription",
      details: err.message,
    });
  }
});

app.post("/user/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  try {
    const rows = await dbQuery(
      `SELECT id, full_name AS name, email, phone_number AS phone, is_active
       FROM authorized_users
       WHERE email = ? AND password_hash = ?
       LIMIT 1`,
      [email, password]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Identifiants utilisateur invalides." });
    }

    if (!user.is_active) {
      return res
        .status(403)
        .json({ error: "Votre compte est en attente de validation admin." });
    }

    const { mobileToken, expiresAt } = await qrSessionService.createMobileSession(
      dbQuery,
      user.id
    );
    const { bindingToken, expiresAt: bindingExpiresAt } =
      await qrSessionService.createDeviceBinding(dbQuery, user.id);

    return res.status(200).json({
      message:
        "Connexion réussie. Cet appareil est enregistré : les prochains QR se valident sans nouvelle saisie.",
      user,
      mobileSessionToken: mobileToken,
      mobileSessionExpiresAt: expiresAt,
      deviceBindingToken: bindingToken,
      deviceBindingExpiresAt: bindingExpiresAt,
    });
  } catch (err) {
    console.error("User login error:", err.message);
    console.error("User login error details:", err);
    const missingQrTables =
      err.code === "ER_NO_SUCH_TABLE" ||
      String(err.message || "").includes("user_mobile_sessions") ||
      String(err.message || "").includes("qr_sessions") ||
      String(err.message || "").includes("device_bindings");
    return res.status(500).json({
      error: "Échec de connexion utilisateur",
      details: missingQrTables
        ? "Mise à jour base requise : exécutez backend/sql/qr_sessions_secure.sql (et device_bindings.sql si besoin) sur la base marsa_ai, puis redémarrez le backend."
        : "Erreur serveur. Réessayez plus tard.",
    });
  }
});

app.post("/authorized-users", async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({
      error: "Le nom et le numéro de téléphone sont requis.",
    });
  }

  try {
    const result = await dbQuery(
      "INSERT INTO authorized_users (full_name, phone_number, is_active) VALUES (?, ?, 1)",
      [name, phone]
    );
    return res.status(201).json({
      message: "Utilisateur autorisé ajouté avec succès",
      user: {
        id: result.insertId,
        name,
        phone,
      },
    });
  } catch (err) {
    console.error("Create authorized user error:", err.message);
    console.error("Create authorized user error details:", err);
    return res.status(500).json({
      error: "Échec de la création de l'utilisateur autorisé",
      details: err.message,
    });
  }
});

app.get("/authorized-users", async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT id,
              full_name AS name,
              phone_number AS phone,
              is_active,
              qr_token,
              qr_expires_at,
              created_at
       FROM authorized_users
       ORDER BY id DESC`
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("Fetch authorized users error:", err.message);
    console.error("Fetch authorized users error details:", err);
    return res.status(500).json({
      error: "Failed to fetch authorized users",
      details: err.message,
    });
  }
});

app.delete("/authorized-users/:id", async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Identifiant utilisateur invalide." });
  }

  try {
    const existing = await dbQuery(
      "SELECT id FROM authorized_users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!existing.length) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }

    await dbQuery("DELETE FROM chat_sessions WHERE authorized_user_id = ?", [
      userId,
    ]);
    await dbQuery(
      "UPDATE questions_history SET authorized_user_id = NULL WHERE authorized_user_id = ?",
      [userId]
    );
    await dbQuery("DELETE FROM authorized_users WHERE id = ?", [userId]);

    return res.status(200).json({ message: "Utilisateur supprimé." });
  } catch (err) {
    console.error("Delete authorized user error:", err.message);
    console.error("Delete authorized user error details:", err);
    return res.status(500).json({
      error: "Échec de la suppression de l'utilisateur",
      details: err.message,
    });
  }
});

app.get("/admin/pending-users", async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT id, full_name AS name, email, phone_number AS phone, created_at
       FROM authorized_users
       WHERE is_active = 0
       ORDER BY created_at DESC`
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("Fetch pending users error:", err.message);
    console.error("Fetch pending users error details:", err);
    return res.status(500).json({
      error: "Échec du chargement des demandes",
      details: err.message,
    });
  }
});

app.post("/admin/approve-user/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const { adminId } = req.body;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Identifiant utilisateur invalide." });
  }

  try {
    const result = await dbQuery(
      `UPDATE authorized_users
       SET is_active = 1, added_by_admin_id = ?
       WHERE id = ?`,
      [adminId || null, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }

    return res.status(200).json({ message: "Utilisateur validé avec succès." });
  } catch (err) {
    console.error("Approve user error:", err.message);
    console.error("Approve user error details:", err);
    return res.status(500).json({
      error: "Échec de validation utilisateur",
      details: err.message,
    });
  }
});

app.post("/authorized-users/:id/generate-qr", async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Identifiant utilisateur invalide." });
  }

  try {
    const users = await dbQuery(
      "SELECT id, full_name AS name, phone_number AS phone, is_active FROM authorized_users WHERE id = ? LIMIT 1",
      [userId]
    );
    const user = users[0];

    if (!user) {
      return res.status(404).json({ error: "Utilisateur autorisé introuvable." });
    }

    await dbQuery(
      "UPDATE authorized_users SET is_active = 1 WHERE id = ?",
      [userId]
    );

    const qrBase = pickFrontendBaseForQr(req);
    if (isLoopbackFrontendBase(qrBase)) {
      return res.status(400).json({
        error: "Impossible de générer un QR lisible depuis le téléphone",
        details:
          "Le lien serait en localhost : sur le téléphone, « localhost » c’est le téléphone lui-même, pas ton Mac. Remplis dans l’admin le champ « URL du front pour les QR » avec l’adresse du Mac (ex. http://172.20.10.2:5173 si le Mac est sur le hotspot du téléphone ; l’IP s’affiche sur le Mac dans Réseau), ou définis BASE_URL / FRONTEND_BASE_URL sur le serveur.",
      });
    }

    const created = await qrSessionService.createQrSessionForUser(dbQuery, {
      authorizedUserId: userId,
      ttlMs: 15 * 60 * 1000,
    });

    const accessUrl = `${qrBase}/qr-connect?s=${created.token}`;
    const qrCodeDataUrl = await QRCode.toDataURL(accessUrl);

    return res.status(200).json({
      message: "QR code généré avec succès (session sécurisée 15 min).",
      user: { id: user.id, name: user.name, phone: user.phone },
      token: created.token,
      accessUrl,
      qrCodeDataUrl,
      expiresAt: created.expiresAt,
    });
  } catch (err) {
    console.error("Generate QR error:", err.message);
    console.error("Generate QR error details:", err);
    return res.status(500).json({
      error: "Échec de la génération du QR code",
      details: err.message,
    });
  }
});

app.get("/user-access", async (req, res) => {
  const token = String(req.query.token || "");

  if (!token) {
    return res.status(400).json({ error: "Token manquant." });
  }

  try {
    const user = await getActiveUserByQrToken(token);
    if (!user) {
      return res
        .status(401)
        .json({ error: "Lien invalide, expiré, ou utilisateur inactif." });
    }

    return res.status(200).json({
      valid: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("User access validation error:", err.message);
    console.error("User access validation details:", err);
    return res.status(500).json({
      error: "Échec de validation du token utilisateur",
      details: err.message,
    });
  }
});

app.post("/user-session/start", async (req, res) => {
  const { token, phone } = req.body;

  if (!token || !phone) {
    return res.status(400).json({ error: "Token et numéro requis." });
  }

  try {
    const user = await getActiveUserByQrToken(token);
    if (!user) {
      return res
        .status(401)
        .json({ error: "Lien invalide, expiré, ou utilisateur inactif." });
    }

    if (normalizePhone(phone) !== normalizePhone(user.phone)) {
      return res
        .status(403)
        .json({ error: "Numéro invalide pour ce QR code." });
    }

    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h

    await dbQuery(
      `INSERT INTO chat_sessions
       (authorized_user_id, session_id, session_token, created_at, expires_at, is_active)
       VALUES (?, ?, ?, NOW(), ?, 1)`,
      [user.id, sessionId, sessionToken, expiresAt]
    );

    return res.status(201).json({
      message: "Session démarrée",
      session: {
        sessionId,
        sessionToken,
        expiresAt,
      },
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("Start session error:", err.message);
    console.error("Start session error details:", err);
    return res.status(500).json({
      error: "Échec du démarrage de session",
      details: err.message,
    });
  }
});

app.post("/qr-session/create", async (req, res) => {
  const mobileUser = await getIdentityFromBearer(req);
  if (!mobileUser) {
    return res.status(401).json({
      error:
        "Appareil non enregistré. Connectez-vous d’abord depuis l’espace utilisateur : seul votre compte peut créer votre QR.",
    });
  }
  try {
    const qrBase = pickFrontendBaseForQr(req);
    if (isLoopbackFrontendBase(qrBase)) {
      return res.status(400).json({
        error: "Impossible de créer un QR pour le téléphone",
        details:
          "L’URL du front est encore en localhost. Renseignez « URL du front pour les QR » dans l’admin (session web) ou BASE_URL côté serveur.",
      });
    }
    const created = await qrSessionService.createQrSessionForUser(dbQuery, {
      authorizedUserId: mobileUser.id,
      ttlMs: 15 * 60 * 1000,
    });
    const accessUrl = `${qrBase}/qr-connect?s=${created.token}`;
    const qrCodeDataUrl = await QRCode.toDataURL(accessUrl);
    return res.status(201).json({
      message: "Session QR créée.",
      token: created.token,
      expiresAt: created.expiresAt,
      accessUrl,
      qrCodeDataUrl,
      authorizedUserId: created.authorizedUserId,
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("qr-session create error:", err.message);
    return res.status(status).json({
      error: err.message || "Échec création session QR.",
    });
  }
});

app.post("/user/chat-session/bootstrap", async (req, res) => {
  const mobileUser = await getIdentityFromBearer(req);
  if (!mobileUser) {
    return res.status(401).json({
      error:
        "Appareil non enregistré. Connectez-vous une fois depuis l’espace utilisateur, puis réessayez.",
    });
  }
  try {
    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await dbQuery(
      `INSERT INTO chat_sessions
       (authorized_user_id, session_id, session_token, created_at, expires_at, is_active)
       VALUES (?, ?, ?, NOW(), ?, 1)`,
      [mobileUser.id, sessionId, sessionToken, expiresAt]
    );
    return res.status(201).json({
      message: "Session chat démarrée.",
      session: {
        sessionId,
        sessionToken,
        expiresAt,
      },
      user: {
        id: mobileUser.id,
        name: mobileUser.name,
        phone: mobileUser.phone,
      },
    });
  } catch (err) {
    console.error("chat-session bootstrap error:", err.message);
    return res.status(500).json({
      error: "Impossible de démarrer la session chat.",
    });
  }
});

app.get("/qr-session/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) {
    return res.status(400).json({ error: "Token manquant." });
  }
  try {
    const row = await loadQrSession(token);
    if (!row) {
      return res.status(404).json({ error: "Session QR introuvable." });
    }
    const body = { status: row.status };
    if (row.status === "approved") {
      body.delivered = !!row.credential_delivered_at;
    }
    if (row.status === "pending") {
      const users = await dbQuery(
        `SELECT phone_number FROM authorized_users WHERE id = ? LIMIT 1`,
        [row.authorized_user_id]
      );
      const phone = users[0]?.phone_number;
      body.phoneHintLast4 = qrPhoneOtpService.phoneLast4(
        phone || row.expected_phone
      );
    }
    return res.status(200).json(body);
  } catch (err) {
    console.error("qr-session get error:", err.message);
    return res.status(500).json({ error: "Échec lecture session QR." });
  }
});

app.post("/qr-session/:token/request-phone-otp", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) {
    return res.status(400).json({ error: "Token manquant." });
  }
  try {
    const row = await loadQrSession(token);
    if (!row) {
      return res.status(404).json({ error: "Session QR introuvable." });
    }
    if (row.status === "expired" || row.status === "rejected") {
      return res.status(410).json({
        error: "Ce QR n'est plus valide.",
        status: row.status,
      });
    }
    if (row.status === "approved") {
      return res.status(409).json({
        error: "Ce QR a déjà été utilisé.",
        status: "approved",
      });
    }
    if (row.status !== "pending") {
      return res.status(400).json({ error: "État de session invalide." });
    }
    const users = await dbQuery(
      `SELECT phone_number FROM authorized_users WHERE id = ? LIMIT 1`,
      [row.authorized_user_id]
    );
    const phone = users[0]?.phone_number;
    const payload = await qrPhoneOtpService.requestPhoneOtp(dbQuery, {
      qrSessionRow: row,
      rawPhone: phone,
    });
    return res.status(200).json(payload);
  } catch (err) {
    const status = err.status || 500;
    if (err.status === 429 && err.retryAfterSec != null) {
      return res.status(429).json({
        error: err.message,
        retryAfterSec: err.retryAfterSec,
        codeRecentlySent: !!err.codeRecentlySent,
      });
    }
    console.error("request-phone-otp error:", err.message);
    return res.status(status).json({
      error: err.message || "Échec envoi du code.",
    });
  }
});

app.post("/qr-session/:token/verify-phone-otp", async (req, res) => {
  const token = String(req.params.token || "");
  const code = req.body?.code;
  if (!token) {
    return res.status(400).json({ error: "Token manquant." });
  }
  if (code == null || String(code).trim() === "") {
    return res.status(400).json({ error: "Code requis." });
  }
  try {
    const row = await loadQrSession(token);
    if (!row) {
      return res.status(404).json({ error: "Session QR introuvable." });
    }
    if (row.status === "expired" || row.status === "rejected") {
      return res.status(410).json({
        error: "Ce QR n'est plus valide.",
        status: row.status,
      });
    }
    if (row.status === "approved") {
      return res.status(409).json({
        error: "Ce QR a déjà été utilisé.",
        status: "approved",
      });
    }
    if (row.status !== "pending") {
      return res.status(400).json({ error: "État de session invalide." });
    }

    await qrPhoneOtpService.verifyPhoneOtp(dbQuery, {
      qrSessionRow: row,
      code,
    });

    let chat;
    try {
      chat = await qrSessionService.approveQrSessionWithChat(dbQuery, row);
    } catch (approveErr) {
      console.error("approve after OTP:", approveErr.message);
      throw approveErr;
    }
    await qrPhoneOtpService.deleteChallenge(dbQuery, row.id);
    const { bindingToken, expiresAt: bindingExpiresAt } =
      await qrSessionService.createDeviceBinding(dbQuery, row.authorized_user_id);

    const users = await dbQuery(
      `SELECT id, full_name AS name, phone_number AS phone
       FROM authorized_users WHERE id = ? LIMIT 1`,
      [row.authorized_user_id]
    );
    const u = users[0];

    return res.status(200).json({
      message: "Accès autorisé.",
      status: "approved",
      session: {
        sessionId: chat.sessionId,
        sessionToken: chat.sessionToken,
        expiresAt: chat.expiresAt,
      },
      user: u ? { id: u.id, name: u.name, phone: u.phone } : null,
      deviceBindingToken: bindingToken,
      deviceBindingExpiresAt: bindingExpiresAt,
    });
  } catch (err) {
    const status = err.status || 500;
    if (err.statusCode === "rejected") {
      return res.status(403).json({
        error: err.message,
        status: "rejected",
      });
    }
    console.error("verify-phone-otp error:", err.message);
    return res.status(status).json({
      error: err.message || "Échec vérification du code.",
    });
  }
});

app.post("/qr-session/:token/scan", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) {
    return res.status(400).json({ error: "Token manquant." });
  }

  const mobileUser = await getIdentityFromBearer(req);
  if (!mobileUser) {
    return res.status(401).json({
      error:
        "Jeton d’appareil absent ou expiré. Un code vient d’être (ou peut être) envoyé par SMS au numéro associé au QR — utilisez la vérification par code sur cette page.",
    });
  }

  try {
    const row = await loadQrSession(token);
    if (!row) {
      return res.status(404).json({ error: "Session QR introuvable." });
    }

    if (row.status === "expired" || row.status === "rejected") {
      return res.status(410).json({
        error: "Ce QR n'est plus valide.",
        status: row.status,
      });
    }

    if (row.status === "approved") {
      return res.status(409).json({
        error: "Ce QR a déjà été utilisé.",
        status: "approved",
      });
    }

    if (row.status !== "pending") {
      return res.status(400).json({ error: "État de session invalide." });
    }

    const expected = normalizePhone(row.expected_phone);
    const actual = normalizePhone(mobileUser.phone);
    if (expected && actual !== expected) {
      await dbQuery(`UPDATE qr_sessions SET status = 'rejected' WHERE id = ?`, [row.id]);
      return res.status(403).json({
        error:
          "Accès refusé : le numéro du compte connecté ne correspond pas au titulaire de ce QR.",
        status: "rejected",
      });
    }

    if (Number(mobileUser.id) !== Number(row.authorized_user_id)) {
      await dbQuery(`UPDATE qr_sessions SET status = 'rejected' WHERE id = ?`, [row.id]);
      return res.status(403).json({
        error: "Accès refusé : compte différent du bénéficiaire autorisé.",
        status: "rejected",
      });
    }

    const chat = await qrSessionService.approveQrSessionWithChat(dbQuery, row);

    const users = await dbQuery(
      `SELECT id, full_name AS name, phone_number AS phone
       FROM authorized_users WHERE id = ? LIMIT 1`,
      [row.authorized_user_id]
    );
    const u = users[0];

    return res.status(200).json({
      message: "Accès autorisé.",
      status: "approved",
      session: {
        sessionId: chat.sessionId,
        sessionToken: chat.sessionToken,
        expiresAt: chat.expiresAt,
      },
      user: u
        ? { id: u.id, name: u.name, phone: u.phone }
        : null,
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("qr-session scan error:", err.message);
    return res.status(status).json({
      error: err.message || "Échec validation QR.",
    });
  }
});

app.post("/qr-session/:token/confirm", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) {
    return res.status(400).json({ error: "Token manquant." });
  }
  try {
    const row = await loadQrSession(token);
    if (!row) {
      return res.status(404).json({ error: "Session QR introuvable." });
    }
    if (row.status !== "approved") {
      return res.status(400).json({
        error: "La session n'est pas encore approuvée ou a été refusée.",
        status: row.status,
      });
    }
    const mobileUser = await getIdentityFromBearer(req);
    if (!mobileUser || Number(mobileUser.id) !== Number(row.authorized_user_id)) {
      return res.status(403).json({
        error:
          "Confirmation réservée au même compte / appareil enregistré ayant validé le QR.",
      });
    }
    const users = await dbQuery(
      `SELECT id, full_name AS name, phone_number AS phone
       FROM authorized_users WHERE id = ? LIMIT 1`,
      [row.authorized_user_id]
    );
    const u = users[0];
    return res.status(200).json({
      message: "Session finalisée.",
      status: "approved",
      delivered: !!row.credential_delivered_at,
      session: {
        sessionId: row.chat_session_id,
        sessionToken: row.chat_session_token,
        expiresAt: row.chat_expires_at,
      },
      user: u ? { id: u.id, name: u.name, phone: u.phone } : null,
    });
  } catch (err) {
    console.error("qr-session confirm error:", err.message);
    return res.status(500).json({ error: "Échec confirmation session QR." });
  }
});

app.post("/user/mobile/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !String(authHeader).startsWith("Bearer ")) {
    return res.status(401).json({ error: "Session introuvable." });
  }
  const token = String(authHeader).slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: "Session introuvable." });
  }
  try {
    const [dbRes, mobRes] = await Promise.all([
      dbQuery(`DELETE FROM device_bindings WHERE token = ?`, [token]),
      dbQuery(`DELETE FROM user_mobile_sessions WHERE token = ?`, [token]),
    ]);
    const n = (dbRes.affectedRows || 0) + (mobRes.affectedRows || 0);
    if (!n) {
      return res.status(401).json({ error: "Session introuvable ou déjà révoquée." });
    }
    return res.status(200).json({ message: "Session révoquée sur cet appareil." });
  } catch (err) {
    console.error("mobile logout error:", err.message);
    return res.status(500).json({ error: "Échec déconnexion." });
  }
});

app.post("/chat", async (req, res) => {
  const { message, sessionToken } = req.body;

  if (message == null || String(message).trim() === "") {
    return res.status(400).json({ error: "Le champ message est requis." });
  }

  try {
    let session = null;
    if (sessionToken) {
      const sessions = await dbQuery(
        `SELECT cs.session_id, cs.authorized_user_id, au.qr_token
         FROM chat_sessions cs
         JOIN authorized_users au ON au.id = cs.authorized_user_id
         WHERE cs.session_token = ?
           AND cs.is_active = 1
           AND cs.expires_at > NOW()
           AND au.is_active = 1
         LIMIT 1`,
        [sessionToken]
      );
      session = sessions[0] || null;

      if (!session) {
        return res.status(401).json({ error: "Session invalide ou expirée." });
      }
    }

    const hits = await searchRelevantChunks(String(message), 5);
    const hasContext = hits.length > 0;
    const contextText = hits
      .map(
        (hit, index) =>
          `[Source ${index + 1} - ${hit.source_title} / ${hit.type_source}]\n${hit.chunk_text}`
      )
      .join("\n\n");

    const systemPrompt =
      "Tu es un assistant IA pour Marsa Maroc. Tu dois repondre uniquement a partir du contexte fourni par l'administration. Si l'information n'est pas presente dans le contexte, dis clairement que l'information n'est pas disponible dans les donnees fournies. N'invente pas de reponse.";

    const userPrompt = hasContext
      ? `Contexte administration:\n${contextText}\n\nQuestion utilisateur:\n${String(message)}`
      : `Aucun contexte pertinent n'a ete trouve dans la base admin pour cette question.\nQuestion utilisateur:\n${String(
          message
        )}`;

    const llamaResponse = await fetch(`${LLAMA_CPP_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!llamaResponse.ok) {
      const bodyText = await llamaResponse.text();
      throw new Error(`HTTP ${llamaResponse.status}: ${bodyText}`);
    }

    const data = await llamaResponse.json();
    let reply = data?.choices?.[0]?.message?.content || "";
    if (!hasContext) {
      reply =
        "L'information n'est pas disponible dans les donnees fournies par l'administration.";
    }

    if (session) {
      const historyInsertResult = await dbQuery(
        `INSERT INTO questions_history
         (authorized_user_id, session_id, question, answer, qr_token, ip_address, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          session.authorized_user_id,
          session.session_id,
          String(message),
          String(reply),
          session.qr_token || null,
          req.ip || null,
          hasContext ? "ok_kb" : "no_kb_data",
        ]
      );

      if (hasContext && historyInsertResult?.insertId) {
        const values = hits.map((hit) => [
          historyInsertResult.insertId,
          hit.source_id,
          String(hit.source_title || ""),
          Number(hit.score || 0),
        ]);
        if (values.length) {
          await dbQuery(
            `INSERT INTO questions_history_sources
             (question_history_id, knowledge_source_id, source_title, relevance_score)
             VALUES ?`,
            [values]
          );
        }
      }
    }

    return res.status(200).json({
      reply,
      knowledge: {
        used: hasContext,
        sources: hits.map((hit) => ({
          sourceId: hit.source_id,
          title: hit.source_title,
          type: hit.type_source,
          score: Number(hit.score || 0),
        })),
      },
    });
  } catch (error) {
    console.error("Erreur llama.cpp :", error);
    return res.status(500).json({ error: "Erreur IA" });
  }
});

app.get("/admin/questions-history", async (req, res) => {
  const { userId, from, to } = req.query;
  const params = [];
  let where = "WHERE 1=1";

  if (userId) {
    where += " AND qh.authorized_user_id = ?";
    params.push(Number(userId));
  }
  if (from) {
    where += " AND DATE(qh.created_at) >= ?";
    params.push(from);
  }
  if (to) {
    where += " AND DATE(qh.created_at) <= ?";
    params.push(to);
  }

  try {
    const rows = await dbQuery(
      `SELECT qh.id,
              qh.authorized_user_id,
              qh.session_id,
              qh.question,
              qh.answer,
              qh.created_at,
              au.full_name AS user_name,
              au.phone_number AS user_phone
       FROM questions_history qh
       LEFT JOIN authorized_users au ON au.id = qh.authorized_user_id
       ${where}
       ORDER BY qh.created_at DESC
       LIMIT 500`,
      params
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error("Admin history error:", err.message);
    console.error("Admin history error details:", err);
    return res.status(500).json({
      error: "Échec du chargement de l'historique",
      details: err.message,
    });
  }
});

app.get("/admin/questions-history/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Identifiant utilisateur invalide." });
  }

  try {
    const rows = await dbQuery(
      `SELECT qh.id,
              qh.authorized_user_id,
              qh.session_id,
              qh.question,
              qh.answer,
              qh.created_at,
              au.full_name AS user_name,
              au.phone_number AS user_phone
       FROM questions_history qh
       LEFT JOIN authorized_users au ON au.id = qh.authorized_user_id
       WHERE qh.authorized_user_id = ?
       ORDER BY qh.created_at DESC`,
      [userId]
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error("Admin user history error:", err.message);
    console.error("Admin user history error details:", err);
    return res.status(500).json({
      error: "Échec du chargement de l'historique utilisateur",
      details: err.message,
    });
  }
});

async function startServer() {
  try {
    await ensureSessionSchema(db);
    console.log("Session / QR / device_bindings tables OK (checked at startup).");
  } catch (err) {
    console.error("ensureSessionSchema failed:", err.message);
    console.error(
      "Si authorized_users est absent ou incompatible (type id), exécutez les migrations SQL manuellement."
    );
    process.exit(1);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (LAN + localhost)`);
    console.log(`[config] URL publique frontend (QR / liens): ${FRONTEND_BASE_URL}`);
    console.log(`[config] Hôte WebOTP dans le SMS (@…): ${resolveSmsWebOtpHost()}`);
  });
}

startServer();