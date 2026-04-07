import React, { useEffect, useState } from "react";

const API_BASE_URL = "http://localhost:3000";

/** Normalise les anciennes erreurs API (anglais / cache) vers un message clair en français */
function normalizeApiError(text) {
  if (!text) return text;
  const lower = text.toLowerCase();
  if (
    lower.includes("email") ||
    lower.includes("name and email") ||
    lower.includes("adresse électronique")
  ) {
    return "Le nom et le numéro de téléphone sont requis.";
  }
  return text;
}

function App() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
  });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /** Charge la liste des utilisateurs autorisés depuis l’API */
  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/authorized-users`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Impossible de charger les utilisateurs autorisés"
        );
      }

      setUsers(data);
    } catch (err) {
      setError(normalizeApiError(err.message));
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const payload = { name: formData.name, phone: formData.phone };

      const response = await fetch(`${API_BASE_URL}/authorized-users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = [data.error, data.details].filter(Boolean).join(" — ");
        throw new Error(
          normalizeApiError(msg) ||
            "Impossible d'ajouter l'utilisateur autorisé"
        );
      }

      setMessage(
        data.message || "Utilisateur autorisé ajouté avec succès"
      );
      setFormData({ name: "", phone: "" });
      await fetchUsers();
    } catch (err) {
      setError(normalizeApiError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Administration</h1>
        <p>Ajouter et consulter les utilisateurs autorisés.</p>

        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom complet
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Numéro de téléphone
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Ajout en cours…" : "Ajouter un utilisateur autorisé"}
          </button>
        </form>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>Utilisateurs autorisés</h2>
        {users.length === 0 ? (
          <p>Aucun utilisateur autorisé pour le moment.</p>
        ) : (
          <ul className="list">
            {users.map((user) => (
              <li key={user.id}>
                <strong>{user.name}</strong> — {user.phone}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
