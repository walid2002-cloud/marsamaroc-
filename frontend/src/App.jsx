import React, { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "./api";

const API_BASE_URL = getApiBaseUrl();

const getErrorMessage = async (response) => {
  try {
    const data = await response.json();
    return [data.error, data.details].filter(Boolean).join(" — ");
  } catch {
    return "Une erreur inattendue est survenue.";
  }
};

function AdminSpace({ onUserFallback, onAdminLogout }) {
  const [adminAuth, setAdminAuth] = useState(() => {
    const raw = localStorage.getItem("adminAuth");
    return raw ? JSON.parse(raw) : null;
  });
  const [adminLoginForm, setAdminLoginForm] = useState({ email: "", password: "" });
  const [formData, setFormData] = useState({ name: "", phone: "" });
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({
    userId: "",
    from: "",
    to: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [qrByUserId, setQrByUserId] = useState({});

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/authorized-users`);
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchPendingUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/pending-users`);
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setPendingUsers(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams();
      if (historyFilters.userId) params.set("userId", historyFilters.userId);
      if (historyFilters.from) params.set("from", historyFilters.from);
      if (historyFilters.to) params.set("to", historyFilters.to);

      const response = await fetch(
        `${API_BASE_URL}/admin/questions-history?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setHistoryRows(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (adminAuth) {
      fetchUsers();
      fetchPendingUsers();
      fetchHistory();
    }
  }, []);

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminLoginForm),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError("");
          onUserFallback();
          return;
        }
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      localStorage.setItem("adminAuth", JSON.stringify(data.admin));
      setAdminAuth(data.admin);
      setMessage("Connexion admin réussie.");
      await fetchUsers();
      await fetchPendingUsers();
      await fetchHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddUser = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/authorized-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      setMessage("Utilisateur autorisé ajouté avec succès.");
      setFormData({ name: "", phone: "" });
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveUser = async (userId) => {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/approve-user/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: adminAuth?.id || null }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setMessage("Utilisateur validé.");
      await fetchUsers();
      await fetchPendingUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGenerateQr = async (userId) => {
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/authorized-users/${userId}/generate-qr`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setQrByUserId((prev) => ({ ...prev, [userId]: data }));
      setMessage("QR code généré.");
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId, displayName) => {
    if (
      !window.confirm(
        `Supprimer définitivement le compte « ${displayName} » ? Cette action est irréversible.`
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/authorized-users/${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setQrByUserId((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setMessage("Utilisateur supprimé.");
      await fetchUsers();
      await fetchHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  const onFilterChange = (event) => {
    const { name, value } = event.target;
    setHistoryFilters((prev) => ({ ...prev, [name]: value }));
  };

  const applyHistoryFilters = async (event) => {
    event.preventDefault();
    await fetchHistory();
  };

  if (!adminAuth) {
    return (
      <main className="page">
        <section className="card">
          <h1>Connexion Admin</h1>
          <form onSubmit={handleAdminLogin} className="form">
            <label>
              Email admin
              <input
                type="email"
                value={adminLoginForm.email}
                onChange={(e) =>
                  setAdminLoginForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                value={adminLoginForm.password}
                onChange={(e) =>
                  setAdminLoginForm((prev) => ({ ...prev, password: e.target.value }))
                }
                required
              />
            </label>
            <button type="submit">Se connecter</button>
            <button
              type="button"
              className="secondary-btn"
              onClick={onUserFallback}
            >
              Je suis utilisateur (Login / S'inscrire)
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Administration</h1>
        <p>Gestion des utilisateurs autorisés et suivi des conversations.</p>

        <form onSubmit={handleAddUser} className="form">
          <label>
            Nom complet
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleFormChange}
              required
            />
          </label>

          <label>
            Numéro de téléphone
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleFormChange}
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
        <h2>Demandes d'inscription en attente</h2>
        {pendingUsers.length === 0 ? (
          <p>Aucune demande en attente.</p>
        ) : (
          <div className="users-grid">
            {pendingUsers.map((u) => (
              <article className="user-item" key={`pending-${u.id}`}>
                <p>
                  <strong>{u.name}</strong> — {u.phone}
                </p>
                <p className="muted">Email : {u.email || "-"}</p>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleApproveUser(u.id)}
                >
                  Accepter cet utilisateur
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Utilisateurs autorisés</h2>
        {users.length === 0 ? (
          <p>Aucun utilisateur autorisé pour le moment.</p>
        ) : (
          <div className="users-grid">
            {users.map((user) => (
              <article className="user-item" key={user.id}>
                <p>
                  <strong>{user.name}</strong> — {user.phone}
                </p>
                <p className="muted">
                  Statut : {user.is_active ? "Actif" : "Inactif"}
                </p>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleGenerateQr(user.id)}
                >
                  Générer QR
                </button>
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => handleDeleteUser(user.id, user.name)}
                >
                  Supprimer le compte
                </button>

                {qrByUserId[user.id] && (
                  <div className="qr-block">
                    <img
                      src={qrByUserId[user.id].qrCodeDataUrl}
                      alt={`QR utilisateur ${user.name}`}
                    />
                    <a
                      href={qrByUserId[user.id].accessUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir le lien d'accès
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Historique des conversations</h2>
        <form onSubmit={applyHistoryFilters} className="filters">
          <label>
            Utilisateur
            <select
              name="userId"
              value={historyFilters.userId}
              onChange={onFilterChange}
            >
              <option value="">Tous</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.phone})
                </option>
              ))}
            </select>
          </label>
          <label>
            Du
            <input
              type="date"
              name="from"
              value={historyFilters.from}
              onChange={onFilterChange}
            />
          </label>
          <label>
            Au
            <input
              type="date"
              name="to"
              value={historyFilters.to}
              onChange={onFilterChange}
            />
          </label>
          <button type="submit">Filtrer</button>
        </form>

        {historyRows.length === 0 ? (
          <p>Aucun historique pour les filtres actuels.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Téléphone</th>
                  <th>Session</th>
                  <th>Question</th>
                  <th>Réponse</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user_name || "-"}</td>
                    <td>{row.user_phone || "-"}</td>
                    <td>{row.session_id || "-"}</td>
                    <td>{row.question}</td>
                    <td>{row.answer}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="mode-switch">
          <button type="button" className="secondary-btn" onClick={onAdminLogout}>
            Déconnexion
          </button>
        </div>
      </section>
    </main>
  );
}

function UserSpace() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") || "",
    []
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingUser, setPendingUser] = useState(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState([]);

  const setupAccess = async () => {
    try {
      if (!token) {
        throw new Error("Lien invalide : token manquant.");
      }

      const checkResponse = await fetch(
        `${API_BASE_URL}/user-access?token=${encodeURIComponent(token)}`
      );
      if (!checkResponse.ok) {
        throw new Error(await getErrorMessage(checkResponse));
      }
      const accessData = await checkResponse.json();
      setPendingUser(accessData.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setupAccess();
  }, []);

  const verifyPhoneAndStart = async (event) => {
    event.preventDefault();
    if (!phoneInput.trim()) {
      setError("Veuillez saisir votre numéro de téléphone.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const startResponse = await fetch(`${API_BASE_URL}/user-session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone: phoneInput }),
      });
      if (!startResponse.ok) {
        throw new Error(await getErrorMessage(startResponse));
      }
      const sessionData = await startResponse.json();
      setUser(sessionData.user);
      setSession(sessionData.session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!chatInput.trim() || !session?.sessionToken) return;

    const question = chatInput.trim();
    setChatBusy(true);
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          sessionToken: session.sessionToken,
        }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Erreur: ${err.message}` },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="page">
        <section className="card">
          <p>Vérification du lien d'accès utilisateur…</p>
        </section>
      </main>
    );
  }

  if (error && !pendingUser && !session) {
    return (
      <main className="page">
        <section className="card">
          <h1>Accès refusé</h1>
          <p className="error">{error}</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page">
        <section className="card">
          <h1>Vérification du numéro</h1>
          <p>
            QR valide pour <strong>{pendingUser?.name || "utilisateur"}</strong>.
            Entrez votre numéro pour ouvrir la session.
          </p>
          <form onSubmit={verifyPhoneAndStart}>
            <label htmlFor="user-phone-check">Numéro de téléphone</label>
            <input
              id="user-phone-check"
              type="text"
              placeholder="Ex: 0612345678"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Vérification..." : "Entrer dans la session"}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Bienvenue {user?.name}</h1>
        <p>Session: {session?.sessionId}</p>
      </section>

      <section className="card chat-box">
        <h2>Chat utilisateur</h2>
        <div className="messages">
          {messages.length === 0 ? (
            <p className="muted">Posez votre première question.</p>
          ) : (
            messages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`msg ${msg.role}`}>
                <strong>{msg.role === "user" ? "Vous" : "Bot"}:</strong>{" "}
                {msg.content}
              </div>
            ))
          )}
        </div>
        <form onSubmit={sendMessage} className="chat-form">
          <input
            type="text"
            placeholder="Écrivez votre message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit" disabled={chatBusy}>
            {chatBusy ? "Envoi..." : "Envoyer"}
          </button>
        </form>
      </section>
    </main>
  );
}

function UserPortal({ onBackToAdmin }) {
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [qrData, setQrData] = useState(null);

  const onRegisterChange = (event) => {
    const { name, value } = event.target;
    setRegisterForm((prev) => ({ ...prev, [name]: value }));
  };

  const onRegisterSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setMessage(data.message);
      setRegisterForm({ name: "", email: "", phone: "", password: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onLoginSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setMessage(data.message);
      setQrData(data.qr || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Espace Utilisateur</h1>
        <p>
          Connectez-vous si vous êtes déjà validé. Sinon inscrivez-vous et attendez
          la validation admin.
        </p>
        <div className="mode-switch">
          <button
            type="button"
            className={mode === "login" ? "secondary-btn" : ""}
            onClick={() => setMode("login")}
          >
            Login utilisateur
          </button>
          <button
            type="button"
            className={mode === "register" ? "secondary-btn" : ""}
            onClick={() => setMode("register")}
          >
            S'inscrire
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={onLoginSubmit} className="form">
            <label>
              Email
              <input
                type="email"
                name="email"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                name="password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm((prev) => ({ ...prev, password: e.target.value }))
                }
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        ) : (
          <form onSubmit={onRegisterSubmit} className="form">
            <label>
              Nom complet
              <input
                type="text"
                name="name"
                value={registerForm.name}
                onChange={onRegisterChange}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                name="email"
                value={registerForm.email}
                onChange={onRegisterChange}
                required
              />
            </label>
            <label>
              Numéro de téléphone
              <input
                type="tel"
                name="phone"
                value={registerForm.phone}
                onChange={onRegisterChange}
                required
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                name="password"
                value={registerForm.password}
                onChange={onRegisterChange}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Envoi..." : "S'inscrire"}
            </button>
          </form>
        )}
        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
        {qrData && (
          <div className="qr-block">
            <p className="muted">
              Scannez ce QR code ou cliquez sur le lien pour entrer dans votre session.
            </p>
            <img src={qrData.qrCodeDataUrl} alt="QR accès utilisateur" />
            <a href={qrData.accessUrl} target="_blank" rel="noreferrer">
              Entrer dans ma session
            </a>
          </div>
        )}
        <button type="button" className="secondary-btn" onClick={onBackToAdmin}>
          Retour connexion admin
        </button>
      </section>
    </main>
  );
}

function App() {
  const [mode, setMode] = useState("admin");

  if (window.location.pathname === "/user-access") {
    return <UserSpace />;
  }

  return mode === "admin" ? (
    <AdminSpace
      onUserFallback={() => setMode("user")}
      onAdminLogout={() => {
        localStorage.removeItem("adminAuth");
        setMode("admin");
        window.location.reload();
      }}
    />
  ) : (
    <UserPortal onBackToAdmin={() => setMode("admin")} />
  );
}

export default App;
