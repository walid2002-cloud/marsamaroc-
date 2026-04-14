const { createHash, randomInt } = require("crypto");
const { resolveSmsWebOtpHost } = require("../config/publicUrl");

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS =
  process.env.NODE_ENV === "production"
    ? 60 * 1000
    : 15 * 1000;
const MAX_VERIFY_ATTEMPTS = 6;

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function toE164Morocco(phoneDigits) {
  const d = normalizePhoneDigits(phoneDigits);
  if (!d) return null;
  if (d.startsWith("212")) return `+${d}`;
  if (d.startsWith("0") && d.length >= 9) return `+212${d.slice(1)}`;
  if (d.length === 9) return `+212${d}`;
  return `+${d}`;
}

function hashOtp(qrSessionId, code, pepper) {
  return createHash("sha256")
    .update(`${pepper}|${qrSessionId}|${code}`)
    .digest("hex");
}

function generateSixDigitOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function phoneLast4(digits) {
  const d = normalizePhoneDigits(digits);
  if (d.length < 4) return "****";
  return d.slice(-4);
}

function smsDomainForWebOtp() {
  return resolveSmsWebOtpHost();
}

function buildSmsBody(code) {
  const host = smsDomainForWebOtp();
  return `Marsa Maroc : ${code} est votre code de connexion. @${host} #${code}`;
}

function twilioEnv() {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();
  const messagingSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  const configured = !!(sid && token && (from || messagingSid));
  return { sid, token, from, messagingSid, configured };
}

function isSmsVerboseLog() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.SMS_VERBOSE_LOG === "1"
  );
}

async function sendSmsTwilio(e164To, body) {
  const { sid, token, from, messagingSid, configured } = twilioEnv();
  if (!configured) {
    return { sent: false, reason: "twilio_not_configured" };
  }

  if (isSmsVerboseLog()) {
    console.log(
      `[twilio] tentative envoi To=${e164To} ${
        messagingSid ? `MessagingServiceSid=${messagingSid}` : `From=${from}`
      } sid=${sid.slice(0, 6)}…`
    );
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: e164To, Body: body });
  if (messagingSid) {
    params.set("MessagingServiceSid", messagingSid);
  } else {
    params.set("From", from);
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.message || data.more_info || res.statusText;
    console.error(
      "[twilio] SMS échoué HTTP",
      res.status,
      "|",
      detail,
      "| code Twilio:",
      data.code || "-",
      "| more_info:",
      data.more_info || "-"
    );
    if (isSmsVerboseLog()) {
      console.error("[twilio] corps réponse:", JSON.stringify(data));
    }
    return { sent: false, reason: "twilio_error", detail };
  }
  if (isSmsVerboseLog()) {
    console.log("[twilio] SMS accepté par l’API sid_message=", data.sid || data.uri || "ok");
  }
  return { sent: true };
}

async function getChallenge(q, qrSessionId) {
  const rows = await q(
    `SELECT id, qr_session_id, otp_hash, expires_at, last_sent_at, verify_attempts
     FROM qr_phone_otp_challenges WHERE qr_session_id = ? LIMIT 1`,
    [qrSessionId]
  );
  return rows[0] || null;
}

async function upsertChallenge(q, qrSessionId, otpHash, expiresAt, lastSentAt) {
  await q(
    `INSERT INTO qr_phone_otp_challenges
      (qr_session_id, otp_hash, expires_at, last_sent_at, verify_attempts)
     VALUES (?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
       otp_hash = VALUES(otp_hash),
       expires_at = VALUES(expires_at),
       last_sent_at = VALUES(last_sent_at),
       verify_attempts = 0`,
    [qrSessionId, otpHash, expiresAt, lastSentAt]
  );
}

async function incrementVerifyAttempts(q, challengeId) {
  await q(
    `UPDATE qr_phone_otp_challenges SET verify_attempts = verify_attempts + 1 WHERE id = ?`,
    [challengeId]
  );
}

async function deleteChallenge(q, qrSessionId) {
  await q(`DELETE FROM qr_phone_otp_challenges WHERE qr_session_id = ?`, [qrSessionId]);
}

/**
 * Demande un OTP sur le numéro attendu pour la session QR (preuve de possession du téléphone).
 */
async function requestPhoneOtp(q, { qrSessionRow, rawPhone }) {
  const pepper = process.env.QR_OTP_PEPPER || "dev-pepper-change-in-production";
  const qrSessionId = qrSessionRow.id;
  const digits = normalizePhoneDigits(rawPhone || qrSessionRow.expected_phone);
  if (!digits) {
    const err = new Error("Numéro attendu manquant pour cette session.");
    err.status = 400;
    throw err;
  }

  const existing = await getChallenge(q, qrSessionId);
  if (existing && existing.last_sent_at) {
    const last = new Date(existing.last_sent_at).getTime();
    if (Date.now() - last < RESEND_COOLDOWN_MS) {
      const err = new Error("Attendez avant de redemander un code.");
      err.status = 429;
      err.codeRecentlySent = true;
      err.retryAfterSec = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - last)) / 1000
      );
      throw err;
    }
  }

  const code = generateSixDigitOtp();
  const e164 = toE164Morocco(digits);
  const smsBody = buildSmsBody(code);
  let smsResult = { sent: false, reason: "page_only" };

  const smsEnabled = process.env.QR_OTP_ENABLE_SMS === "1";

  if (smsEnabled) {
    if (!e164) {
      const err = new Error("Numéro invalide pour l’envoi SMS (format).");
      err.status = 400;
      throw err;
    }
    smsResult = await sendSmsTwilio(e164, smsBody);
    if (!smsResult.sent) {
      console.warn(
        `[qr-phone-otp] SMS non délivré raison=${smsResult.reason} detail=${smsResult.detail || "-"} | session ${qrSessionRow.token?.slice(0, 8)}… | cible=${e164}`
      );
    }
  } else {
    console.log(
      `[qr-phone-otp] mode page uniquement (aucun SMS). Session ${qrSessionRow.token?.slice(0, 8)}… réf. tel ···${phoneLast4(digits)}`
    );
  }

  if (isSmsVerboseLog()) {
    console.log(
      `[qr-phone-otp] destinataire=${e164} code=${code} smsEnvoyé=${!!smsResult.sent} (log verbeux: NODE_ENV≠production ou SMS_VERBOSE_LOG=1)`
    );
  }

  const otpHash = hashOtp(qrSessionId, code, pepper);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const nowSql = new Date();
  await upsertChallenge(q, qrSessionId, otpHash, expiresAt, nowSql);

  const out = {
    phoneLast4: phoneLast4(digits),
    expiresInSec: Math.floor(OTP_TTL_MS / 1000),
    smsSent: !!smsResult.sent,
  };

  if (!smsResult.sent) {
    out.devCode = code;
    if (smsResult.detail) {
      out.smsErrorDetail = smsResult.detail;
    }
  }

  return out;
}

/**
 * Vérifie le OTP ; en cas de succès laisse l’appelant approuver la session (transaction logique côté route).
 */
async function verifyPhoneOtp(q, { qrSessionRow, code }) {
  const pepper = process.env.QR_OTP_PEPPER || "dev-pepper-change-in-production";
  const qrSessionId = qrSessionRow.id;
  const challenge = await getChallenge(q, qrSessionId);
  if (!challenge) {
    const err = new Error("Aucun code en cours. Demandez un nouveau code.");
    err.status = 400;
    throw err;
  }
  if (new Date(challenge.expires_at) < new Date()) {
    await deleteChallenge(q, qrSessionId);
    const err = new Error("Code expiré. Demandez un nouveau code.");
    err.status = 410;
    throw err;
  }
  if (challenge.verify_attempts >= MAX_VERIFY_ATTEMPTS) {
    await deleteChallenge(q, qrSessionId);
    await q(`UPDATE qr_sessions SET status = 'rejected' WHERE id = ? AND status = 'pending'`, [
      qrSessionId,
    ]);
    const err = new Error("Trop de tentatives. Session refusée.");
    err.status = 403;
    err.statusCode = "rejected";
    throw err;
  }

  const expectedHash = hashOtp(qrSessionId, String(code || "").trim(), pepper);
  if (expectedHash !== challenge.otp_hash) {
    await incrementVerifyAttempts(q, challenge.id);
    const err = new Error("Code incorrect.");
    err.status = 401;
    throw err;
  }

  return { ok: true };
}

module.exports = {
  requestPhoneOtp,
  verifyPhoneOtp,
  deleteChallenge,
  normalizePhoneDigits,
  phoneLast4,
};
