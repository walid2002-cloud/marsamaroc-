/** IPv4 privée (LAN / partage de connexion iPhone : 172.20.x, Wi‑Fi maison : 192.168.x, etc.) */
function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => n > 255 || Number.isNaN(n))) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Devine http://IP:port pour le front (QR mobile) quand l’admin est en localhost.
 * Utilise une courte négociation WebRTC locale (sans STUN public).
 */
export function guessLocalFrontendBaseUrl(port = "5173") {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.RTCPeerConnection) {
      resolve(null);
      return;
    }
    let resolved = false;
    let pc;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      try {
        if (pc) {
          pc.onicecandidate = null;
          pc.close();
        }
      } catch {
        /* ignore */
      }
      window.clearTimeout(timeout);
      resolve(value);
    };

    const timeout = window.setTimeout(() => finish(null), 4500);

    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      pc.onicecandidate = (ev) => {
        const c = ev.candidate?.candidate;
        if (!c) return;
        const m = c.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
        if (!m) return;
        const ip = m[1];
        if (isPrivateIPv4(ip)) finish(`http://${ip}:${port}`);
      };
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          window.setTimeout(() => finish(null), 700);
        }
      });
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => finish(null));
    } catch {
      finish(null);
    }
  });
}
