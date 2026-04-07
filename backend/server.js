const express = require("express");
const db = require("./db");
const app = express();

const PORT = 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

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

app.get("/", (req, res) => {
  res.send("Marsa Maroc Backend 🚀");
});

app.get("/test-db", (req, res) => {
  const query = "SELECT * FROM admins";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Database query error:", err.message);
      console.error("Database query error details:", err);
      return res.status(500).json({
        error: "Database query failed",
        details: err.message,
      });
    }

    return res.status(200).json(results);
  });
});

app.post("/admins", (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: "name and email are required",
    });
  }

  const query = "INSERT INTO admins (name, email) VALUES (?, ?)";
  db.query(query, [name, email], (err, result) => {
    if (err) {
      console.error("Create admin error:", err.message);
      console.error("Create admin error details:", err);
      return res.status(500).json({
        error: "Failed to create admin",
        details: err.message,
      });
    }

    return res.status(201).json({
      message: "Admin created successfully",
      id: result.insertId,
    });
  });
});

// Corps API : { name, phone } — colonnes MySQL : full_name, phone_number
app.post("/authorized-users", (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({
      error: "Le nom et le numéro de téléphone sont requis.",
    });
  }

  const query =
    "INSERT INTO authorized_users (full_name, phone_number) VALUES (?, ?)";
  db.query(query, [name, phone], (err, result) => {
    if (err) {
      console.error("Create authorized user error:", err.message);
      console.error("Create authorized user error details:", err);
      return res.status(500).json({
        error: "Échec de la création de l'utilisateur autorisé",
        details: err.message,
      });
    }

    return res.status(201).json({
      message: "Utilisateur autorisé ajouté avec succès",
      user: {
        id: result.insertId,
        name,
        phone,
      },
    });
  });
});

app.get("/authorized-users", (req, res) => {
  const query =
    "SELECT id, full_name AS name, phone_number AS phone FROM authorized_users ORDER BY id DESC";

  db.query(query, (err, rows) => {
    if (err) {
      console.error("Fetch authorized users error:", err.message);
      console.error("Fetch authorized users error details:", err);
      return res.status(500).json({
        error: "Failed to fetch authorized users",
        details: err.message,
      });
    }

    return res.status(200).json(rows);
  });
});

// Chat IA : envoie le message à Ollama et renvoie la réponse texte
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (message == null || String(message).trim() === "") {
    return res.status(400).json({ error: "Le champ message est requis." });
  }

  try {
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: message,
        stream: false,
      }),
    });

    if (!ollamaResponse.ok) {
      const bodyText = await ollamaResponse.text();
      throw new Error(`HTTP ${ollamaResponse.status}: ${bodyText}`);
    }

    const data = await ollamaResponse.json();

    return res.status(200).json({ reply: data.response });
  } catch (error) {
    console.error("Erreur Ollama :", error);
    return res.status(500).json({ error: "Erreur IA" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});