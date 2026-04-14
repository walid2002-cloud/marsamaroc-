/**
 * URL publique du frontend (QR, liens dans les mails/SMS).
 * Priorité : BASE_URL → PUBLIC_APP_URL → FRONTEND_BASE_URL → localhost dev.
 */

function stripTrailingSlashes(s) {
  return String(s || "").replace(/\/+$/, "");
}

function ensureHttpScheme(url) {
  const u = String(url || "").trim();
  if (!u) return "http://localhost:5173";
  if (/^https?:\/\//i.test(u)) return u;
  const host = u.split("/")[0].toLowerCase();
  if (
    host.includes("ngrok") ||
    host.includes("loca.lt") ||
    host.includes("trycloudflare.com")
  ) {
    return `https://${u}`;
  }
  return `http://${u}`;
}

function isLoopbackHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/** URL absolue utilisable comme base du front (QR) : schéma http(s), hôte non loopback. */
function isUsableFrontendOrigin(urlLike) {
  try {
    const u = new URL(String(urlLike || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (!u.hostname) return false;
    if (isLoopbackHostname(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function resolvePublicBaseUrl() {
  const raw =
    process.env.BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_BASE_URL ||
    "http://localhost:5173";
  const u = stripTrailingSlashes(ensureHttpScheme(raw));
  try {
    const parsed = new URL(u);
    if (!parsed.hostname) throw new Error("hostname vide");
  } catch {
    console.warn(
      `[config] URL frontend invalide (${JSON.stringify(String(raw).slice(0, 120))}), fallback http://localhost:5173`
    );
    return "http://localhost:5173";
  }
  return u;
}

/**
 * Base d’URL pour un lien / QR :
 * 1) corps JSON `publicFrontendUrl` (ex. saisi dans l’admin quand tu restes en localhost)
 * 2) Origin / Referer si hôte non loopback
 * 3) config (BASE_URL / FRONTEND_BASE_URL…)
 */
function pickFrontendBaseForQr(req) {
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const rawBody = [b.publicFrontendUrl, b.frontendBaseUrl].find(
    (v) => v != null && String(v).trim() !== ""
  );
  if (rawBody != null && String(rawBody).trim()) {
    const candidate = stripTrailingSlashes(ensureHttpScheme(String(rawBody).trim()));
    if (isUsableFrontendOrigin(candidate)) {
      return candidate;
    }
  }

  const origin = req.get("origin");
  if (origin && isUsableFrontendOrigin(origin)) {
    return stripTrailingSlashes(origin);
  }
  const referer = req.get("referer");
  if (referer) {
    try {
      const o = new URL(referer).origin;
      if (isUsableFrontendOrigin(o)) return stripTrailingSlashes(o);
    } catch {
      /* ignore */
    }
  }
  return resolvePublicBaseUrl();
}

/** True si le téléphone ne pourra pas joindre cette base (localhost = l’appareil lui-même). */
function isLoopbackFrontendBase(url) {
  try {
    return isLoopbackHostname(new URL(stripTrailingSlashes(String(url || ""))).hostname);
  } catch {
    return true;
  }
}

/**
 * Hôte pour WebOTP dans le corps du SMS (@host #code) — sans schéma.
 * Priorité : QR_OTP_SMS_DOMAIN → FRONTEND_SMS_ORIGIN_HINT → dérivé de resolvePublicBaseUrl().
 */
function resolveSmsWebOtpHost() {
  const raw = process.env.QR_OTP_SMS_DOMAIN || process.env.FRONTEND_SMS_ORIGIN_HINT;
  if (raw && String(raw).trim()) {
    const t = String(raw).trim();
    try {
      if (/^https?:\/\//i.test(t)) {
        return new URL(t).host;
      }
      return t.replace(/^\/+/, "");
    } catch {
      return t;
    }
  }
  try {
    return new URL(resolvePublicBaseUrl()).host;
  } catch {
    return "localhost:5173";
  }
}

module.exports = {
  resolvePublicBaseUrl,
  resolveSmsWebOtpHost,
  pickFrontendBaseForQr,
  isLoopbackFrontendBase,
};
