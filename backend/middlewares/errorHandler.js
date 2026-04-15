function notFound(_req, res) {
  return res.status(404).json({ error: "Route introuvable." });
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const payload = {
    error: err.publicMessage || err.message || "Erreur serveur.",
  };
  if (err.details) payload.details = err.details;
  if (status >= 500) {
    console.error("[api-error]", err);
  }
  return res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };

