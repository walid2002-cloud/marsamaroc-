const express = require("express");
const { randomBytes, randomUUID } = require("crypto");
const QRCode = require("qrcode");
const db = require("./db");

const app = express();
const PORT = 3000;
const LLAMA_CPP_URL = process.env.LLAMA_CPP_URL || "http://127.0.0.1:8080";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://localhost:5173";

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

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

app.get("/", (req, res) => {
  res.send("Marsa Maroc Backend 🚀");
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

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await dbQuery(
      "UPDATE authorized_users SET qr_token = ?, qr_expires_at = ? WHERE id = ?",
      [token, expiresAt, user.id]
    );
    const accessUrl = `${FRONTEND_BASE_URL}/user-access?token=${token}`;
    const qrCodeDataUrl = await QRCode.toDataURL(accessUrl);

    return res.status(200).json({
      message:
        "Connexion utilisateur réussie. Scannez votre QR code pour entrer dans votre session.",
      user,
      qr: {
        token,
        expiresAt,
        accessUrl,
        qrCodeDataUrl,
      },
    });
  } catch (err) {
    console.error("User login error:", err.message);
    console.error("User login error details:", err);
    return res.status(500).json({
      error: "Échec de connexion utilisateur",
      details: err.message,
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

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await dbQuery(
      "UPDATE authorized_users SET qr_token = ?, qr_expires_at = ?, is_active = 1 WHERE id = ?",
      [token, expiresAt, userId]
    );

    const accessUrl = `${FRONTEND_BASE_URL}/user-access?token=${token}`;
    const qrCodeDataUrl = await QRCode.toDataURL(accessUrl);

    return res.status(200).json({
      message: "QR code généré avec succès",
      user: { id: user.id, name: user.name, phone: user.phone },
      token,
      accessUrl,
      qrCodeDataUrl,
      expiresAt,
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

    const llamaResponse = await fetch(`${LLAMA_CPP_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant intelligent pour Marsa Maroc. Marsa Maroc est une entreprise marocaine spécialisée dans la gestion portuaire, les opérations portuaires, la logistique et les services liés aux ports. Tu dois répondre de façon claire, professionnelle et concise. N’invente jamais de faits. Si une information est inconnue, dis simplement que tu ne sais pas.",
          },
          { role: "user", content: message },
        ],
      }),
    });

    if (!llamaResponse.ok) {
      const bodyText = await llamaResponse.text();
      throw new Error(`HTTP ${llamaResponse.status}: ${bodyText}`);
    }

    const data = await llamaResponse.json();
    const reply = data?.choices?.[0]?.message?.content || "";

    if (session) {
      await dbQuery(
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
          "ok",
        ]
      );
    }

    return res.status(200).json({ reply });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT} (LAN + localhost)`);
});