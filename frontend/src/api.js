const trimSlash = (s) => String(s || "").replace(/\/?$/, "");

const isLoopbackUrl = (url) => {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
};

/**
 * Base du backend.
 * En `vite dev`, les appels passent par le proxy `/api` (même origine → OK sur téléphone / LAN).
 * En build prod, VITE_API_BASE_URL ou même hôte :3000.
 */
export function getApiBaseUrl() {
  if (import.meta.env.DEV) {
    return "/api";
  }

  const win = typeof window !== "undefined" ? window : null;
  const hostname = win?.location?.hostname;

  if (win && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return `${win.location.protocol}//${hostname}:3000`;
  }

  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  const trimmed = fromEnv && String(fromEnv).trim() ? trimSlash(fromEnv) : "";

  const apiPort = import.meta.env.VITE_API_PORT || "3000";

  if (win && hostname && trimmed && isLoopbackUrl(trimmed)) {
    return `${win.location.protocol}//${hostname}:${apiPort}`;
  }

  if (trimmed) return trimmed;

  if (win) {
    return `${win.location.protocol}//${win.location.hostname}:${apiPort}`;
  }

  return "http://localhost:3000";
}

/** Message Safari « Load failed » / Chrome « Failed to fetch » → explication actionnable. */
export function humanizeFetchError(err) {
  const m = String(err?.message || err || "").trim();
  if (!m) {
    return "Impossible de contacter le serveur. Vérifiez le réseau et que l’API (port 3000) est joignable depuis cet appareil.";
  }
  if (/load failed|failed to fetch|networkerror|network request failed/i.test(m)) {
    const dev = import.meta.env.DEV;
    const hint = dev
      ? " Avec Vite, l’adresse doit inclure le port du front (souvent :5173) ; les appels passent par /api vers le backend."
      : " En production, le front doit pouvoir joindre le backend (souvent le même hôte sur le port 3000, ou VITE_API_BASE_URL au build).";
    const host = typeof window !== "undefined" ? window.location.hostname : "IP_DU_PC";
    return `Impossible de joindre le serveur API (réseau ou pare-feu).${hint} Test : ouvrir http://${host}:3000/health (doit afficher du JSON). Sur iPhone : Réglages > Confidentialité et sécurité > Réseau local > autoriser Safari.`;
  }
  return m;
}
