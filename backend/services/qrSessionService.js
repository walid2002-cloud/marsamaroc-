const { randomBytes, randomUUID } = require("crypto");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const dbQuery = (db) => (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });

async function expireQrSessionIfNeeded(q, row) {
  if (!row) return null;
  if (row.status === "pending" && new Date(row.expires_at) < new Date()) {
    await q(
      `UPDATE qr_sessions SET status = 'expired' WHERE id = ? AND status = 'pending'`,
      [row.id]
    );
    return { ...row, status: "expired" };
  }
  return row;
}

async function getQrSessionByToken(q, token) {
  const rows = await q(
    `SELECT id, token, status, authorized_user_id, expected_phone, user_id,
            chat_session_token, chat_session_id, chat_expires_at, credential_delivered_at,
            created_at, expires_at
     FROM qr_sessions WHERE token = ? LIMIT 1`,
    [token]
  );
  const row = rows[0] || null;
  return expireQrSessionIfNeeded(q, row);
}

async function getMobileUserFromBearer(q, authHeader) {
  if (!authHeader || !String(authHeader).startsWith("Bearer ")) return null;
  const token = String(authHeader).slice(7).trim();
  if (!token) return null;
  const rows = await q(
    `SELECT au.id,
            au.full_name AS name,
            au.email,
            au.phone_number AS phone,
            au.is_active
     FROM user_mobile_sessions ums
     JOIN authorized_users au ON au.id = ums.authorized_user_id
     WHERE ums.token = ?
       AND ums.expires_at > NOW()
       AND au.is_active = 1
     LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

/** Jeton longue durée par navigateur (après un login utilisateur sur cet appareil). */
async function getDeviceUserFromBearer(q, authHeader) {
  if (!authHeader || !String(authHeader).startsWith("Bearer ")) return null;
  const token = String(authHeader).slice(7).trim();
  if (!token) return null;
  const rows = await q(
    `SELECT au.id,
            au.full_name AS name,
            au.email,
            au.phone_number AS phone,
            au.is_active
     FROM device_bindings db
     JOIN authorized_users au ON au.id = db.authorized_user_id
     WHERE db.token = ?
       AND db.expires_at > NOW()
       AND au.is_active = 1
     LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

/**
 * Résout l’utilisateur autorisé derrière un Bearer : liaison d’appareil (prioritaire), puis session mobile courte.
 */
async function getIdentityFromBearer(q, authHeader) {
  const fromDevice = await getDeviceUserFromBearer(q, authHeader);
  if (fromDevice) return fromDevice;
  return getMobileUserFromBearer(q, authHeader);
}

async function createDeviceBinding(
  q,
  authorizedUserId,
  ttlMs = 180 * 24 * 60 * 60 * 1000
) {
  const bindingToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  await q(
    `INSERT INTO device_bindings (authorized_user_id, token, expires_at)
     VALUES (?, ?, ?)`,
    [authorizedUserId, bindingToken, expiresAt]
  );
  return { bindingToken, expiresAt };
}

async function createMobileSession(q, authorizedUserId, ttlMs = 24 * 60 * 60 * 1000) {
  const mobileToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  await q(`DELETE FROM user_mobile_sessions WHERE authorized_user_id = ?`, [
    authorizedUserId,
  ]);
  await q(
    `INSERT INTO user_mobile_sessions (authorized_user_id, token, expires_at)
     VALUES (?, ?, ?)`,
    [authorizedUserId, mobileToken, expiresAt]
  );
  return { mobileToken, expiresAt };
}

async function createQrSessionForUser(q, { authorizedUserId, ttlMs = 15 * 60 * 1000 }) {
  const users = await q(
    `SELECT id, full_name AS name, phone_number AS phone, is_active
     FROM authorized_users WHERE id = ? LIMIT 1`,
    [authorizedUserId]
  );
  const user = users[0];
  if (!user) {
    const err = new Error("Utilisateur introuvable.");
    err.status = 404;
    throw err;
  }
  if (!user.is_active) {
    const err = new Error("Utilisateur inactif.");
    err.status = 403;
    throw err;
  }
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  const expectedPhone = normalizePhone(user.phone);
  await q(
    `INSERT INTO qr_sessions
      (token, status, authorized_user_id, expected_phone, expires_at)
     VALUES (?, 'pending', ?, ?, ?)`,
    [token, authorizedUserId, expectedPhone || null, expiresAt]
  );
  return {
    token,
    expiresAt,
    authorizedUserId: user.id,
    expectedPhone: user.phone,
  };
}

async function approveQrSessionWithChat(q, row) {
  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await q(
    `INSERT INTO chat_sessions
      (authorized_user_id, session_id, session_token, created_at, expires_at, is_active)
     VALUES (?, ?, ?, NOW(), ?, 1)`,
    [row.authorized_user_id, sessionId, sessionToken, expiresAt]
  );

  const up = await q(
    `UPDATE qr_sessions
     SET status = 'approved',
         user_id = ?,
         chat_session_token = ?,
         chat_session_id = ?,
         chat_expires_at = ?,
         credential_delivered_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [row.authorized_user_id, sessionToken, sessionId, expiresAt, row.id]
  );

  if (!up.affectedRows) {
    const err = new Error("Session QR déjà utilisée ou invalide.");
    err.status = 409;
    throw err;
  }

  return {
    sessionId,
    sessionToken,
    expiresAt,
  };
}

function buildSessionPayload(row, userRow) {
  return {
    session: {
      sessionId: row.chat_session_id,
      sessionToken: row.chat_session_token,
      expiresAt: row.chat_expires_at,
    },
    user: userRow
      ? {
          id: userRow.id,
          name: userRow.name,
          phone: userRow.phone,
        }
      : null,
  };
}

module.exports = {
  normalizePhone,
  dbQuery,
  getQrSessionByToken,
  getMobileUserFromBearer,
  getDeviceUserFromBearer,
  getIdentityFromBearer,
  createDeviceBinding,
  createMobileSession,
  createQrSessionForUser,
  approveQrSessionWithChat,
  buildSessionPayload,
};
