import React, { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "./api";
import {
  BookOpen,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Phone,
  PlugZap,
  PlusCircle,
  RefreshCw,
  Unplug,
} from "lucide-react";
import AppShell from "./components/layout/AppShell";
import { Button, Card, EmptyState, StatusBadge } from "./components/ui";

const API_BASE_URL = getApiBaseUrl();

async function getErrorMessage(response) {
  try {
    const data = await response.json();
    return [data.error, data.details].filter(Boolean).join(" — ");
  } catch {
    return "Une erreur inattendue est survenue.";
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
  return response.json();
}

function BotCard({
  bot,
  whatsappStatus,
  onInit,
  onRestart,
  onDisconnect,
  onSelect,
  selected,
}) {
  return (
    <article className={`user-item ${selected ? "selected" : ""}`}>
      <p>
        <strong>{bot.name}</strong> — {bot.domain}
      </p>
      <p className="muted">{bot.description || "Sans description."}</p>
      <p className="muted">
        Statut bot : <StatusBadge value={bot.status} /> | WhatsApp :{" "}
        <StatusBadge value={whatsappStatus?.sessionStatus || "disconnected"} />
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button type="button" variant="secondary" onClick={() => onSelect(bot.id)}>
          Détails
        </Button>
        <Button type="button" icon={<PlugZap size={15} />} onClick={() => onInit(bot.id)}>
          Connecter WhatsApp
        </Button>
        <Button type="button" variant="secondary" icon={<RefreshCw size={15} />} onClick={() => onRestart(bot.id)}>
          Rafraîchir QR
        </Button>
        <Button type="button" variant="danger" icon={<Unplug size={15} />} onClick={() => onDisconnect(bot.id)}>
          Déconnecter
        </Button>
      </div>

      {whatsappStatus?.phoneNumber ? (
        <p className="muted">Numéro connecté : {whatsappStatus.phoneNumber}</p>
      ) : null}

      {whatsappStatus?.sessionStatus === "qr_ready" && whatsappStatus?.qrCodeData ? (
        <div className="qr-block">
          <p className="muted">Scanne ce QR avec l’application WhatsApp pour connecter le bot.</p>
          <img src={whatsappStatus.qrCodeData} alt={`QR WhatsApp ${bot.name}`} />
        </div>
      ) : null}

      {whatsappStatus?.errorMessage ? (
        <p className="toast toast-error">{whatsappStatus.errorMessage}</p>
      ) : null}
    </article>
  );
}

function App() {
  const [adminAuth, setAdminAuth] = useState(() => {
    const raw = localStorage.getItem("adminAuth");
    return raw ? JSON.parse(raw) : null;
  });
  const [adminLoginForm, setAdminLoginForm] = useState({ email: "", password: "" });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [bots, setBots] = useState([]);
  const [selectedBotId, setSelectedBotId] = useState(null);
  const [whatsappByBotId, setWhatsappByBotId] = useState({});
  const [sources, setSources] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [apiLogs, setApiLogs] = useState([]);
  const [botForm, setBotForm] = useState({
    name: "",
    slug: "",
    domain: "",
    description: "",
    promptGuardrails: "",
  });
  const [textSourceForm, setTextSourceForm] = useState({
    title: "",
    contentText: "",
  });
  const [apiSourceForm, setApiSourceForm] = useState({
    title: "",
    apiUrl: "",
    apiMethod: "GET",
    apiHeadersJson: "{}",
    apiMappingJson: "{}",
  });
  const [pdfForm, setPdfForm] = useState({
    title: "",
    file: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedBot = useMemo(
    () => bots.find((b) => Number(b.id) === Number(selectedBotId)) || null,
    [bots, selectedBotId]
  );

  const loadBots = async () => {
    const rows = await requestJson(`${API_BASE_URL}/api/bots`);
    setBots(rows);
    if (!selectedBotId && rows.length) {
      setSelectedBotId(rows[0].id);
    }
    return rows;
  };

  const loadWhatsappStatusForBot = async (botId) => {
    const status = await requestJson(`${API_BASE_URL}/api/bots/${botId}/whatsapp/status`);
    setWhatsappByBotId((prev) => ({ ...prev, [botId]: status }));
  };

  const loadAllWhatsappStatuses = async (rows) => {
    await Promise.all(rows.map((b) => loadWhatsappStatusForBot(b.id)));
  };

  const loadSources = async (botId) => {
    if (!botId) return;
    const rows = await requestJson(`${API_BASE_URL}/api/bots/${botId}/sources`);
    setSources(rows);
  };

  const loadConversations = async (botId) => {
    if (!botId) return;
    const rows = await requestJson(`${API_BASE_URL}/api/bots/${botId}/conversations`);
    setConversations(rows);
  };

  const loadMessages = async (botId, conversationId) => {
    if (!botId || !conversationId) return;
    const rows = await requestJson(
      `${API_BASE_URL}/api/bots/${botId}/conversations/${conversationId}/messages`
    );
    setMessages(rows);
  };

  const loadApiLogs = async (botId) => {
    if (!botId) return;
    const rows = await requestJson(`${API_BASE_URL}/api/bots/${botId}/sources/logs/api`);
    setApiLogs(rows);
  };

  useEffect(() => {
    if (!adminAuth) return;
    (async () => {
      try {
        const rows = await loadBots();
        await loadAllWhatsappStatuses(rows);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [adminAuth]);

  useEffect(() => {
    if (!selectedBotId || !adminAuth) return;
    loadSources(selectedBotId).catch((err) => setError(err.message));
    loadConversations(selectedBotId).catch((err) => setError(err.message));
    loadApiLogs(selectedBotId).catch((err) => setError(err.message));
  }, [selectedBotId, adminAuth]);

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const data = await requestJson(`${API_BASE_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminLoginForm),
      });
      localStorage.setItem("adminAuth", JSON.stringify(data.admin));
      setAdminAuth(data.admin);
      setMessage("Connexion admin réussie.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBot = async (event) => {
    event.preventDefault();
    if (!botForm.name || !botForm.domain) return;
    setError("");
    setMessage("");
    try {
      await requestJson(`${API_BASE_URL}/api/bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...botForm,
          createdByAdminId: adminAuth?.id || null,
        }),
      });
      setBotForm({ name: "", slug: "", domain: "", description: "", promptGuardrails: "" });
      const rows = await loadBots();
      await loadAllWhatsappStatuses(rows);
      setMessage("Bot créé.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleBotStatus = async (bot) => {
    setError("");
    setMessage("");
    try {
      const target = bot.status === "active" ? "inactive" : "active";
      await requestJson(`${API_BASE_URL}/api/bots/${bot.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      const rows = await loadBots();
      await loadAllWhatsappStatuses(rows);
      setMessage(`Bot ${target === "active" ? "activé" : "désactivé"}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWhatsappInit = async (botId) => {
    setError("");
    setMessage("");
    try {
      await requestJson(`${API_BASE_URL}/api/bots/${botId}/whatsapp/init`, { method: "POST" });
      await loadWhatsappStatusForBot(botId);
      setMessage("Session WhatsApp initialisée.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWhatsappRestart = async (botId) => {
    setError("");
    setMessage("");
    try {
      await requestJson(`${API_BASE_URL}/api/bots/${botId}/whatsapp/restart`, { method: "POST" });
      await loadWhatsappStatusForBot(botId);
      setMessage("Session WhatsApp redémarrée.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWhatsappDisconnect = async (botId) => {
    setError("");
    setMessage("");
    try {
      await requestJson(`${API_BASE_URL}/api/bots/${botId}/whatsapp/disconnect`, {
        method: "POST",
      });
      await loadWhatsappStatusForBot(botId);
      setMessage("Session WhatsApp déconnectée.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddTextSource = async (event) => {
    event.preventDefault();
    if (!selectedBotId) return;
    setError("");
    setMessage("");
    try {
      await requestJson(`${API_BASE_URL}/api/bots/${selectedBotId}/sources/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(textSourceForm),
      });
      setTextSourceForm({ title: "", contentText: "" });
      await loadSources(selectedBotId);
      setMessage("Source texte ajoutée.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddPdfSource = async (event) => {
    event.preventDefault();
    if (!selectedBotId || !pdfForm.file || !pdfForm.title) return;
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("title", pdfForm.title);
      body.append("file", pdfForm.file);
      const response = await fetch(`${API_BASE_URL}/api/bots/${selectedBotId}/sources/pdf`, {
        method: "POST",
        body,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setPdfForm({ title: "", file: null });
      await loadSources(selectedBotId);
      setMessage("Source PDF ajoutée.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddApiSource = async (event) => {
    event.preventDefault();
    if (!selectedBotId) return;
    setError("");
    setMessage("");
    try {
      await requestJson(`${API_BASE_URL}/api/bots/${selectedBotId}/sources/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiSourceForm),
      });
      setApiSourceForm({
        title: "",
        apiUrl: "",
        apiMethod: "GET",
        apiHeadersJson: "{}",
        apiMappingJson: "{}",
      });
      await loadSources(selectedBotId);
      await loadApiLogs(selectedBotId);
      setMessage("Source API ajoutée.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProcessSource = async (sourceId) => {
    if (!selectedBotId) return;
    setError("");
    setMessage("");
    try {
      await requestJson(`${API_BASE_URL}/api/bots/${selectedBotId}/sources/${sourceId}/process`, {
        method: "POST",
      });
      await loadSources(selectedBotId);
      setMessage("Source retraitée.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSelectConversation = async (conversationId) => {
    setSelectedConversationId(conversationId);
    await loadMessages(selectedBotId, conversationId);
  };

  const sidebar = (
    <>
      <div className="sidebar-brand">Marsa Maroc AI</div>
      <nav className="sidebar-nav">
        <a href="#dashboard" onClick={() => setActiveTab("dashboard")}>
          <LayoutDashboard size={16} /> Dashboard
        </a>
        <a href="#bots" onClick={() => setActiveTab("bots")}>
          <PlugZap size={16} /> Bots
        </a>
        <a href="#knowledge" onClick={() => setActiveTab("knowledge")}>
          <BookOpen size={16} /> Knowledge Base
        </a>
        <a href="#conversations" onClick={() => setActiveTab("conversations")}>
          <MessageSquare size={16} /> Conversations
        </a>
        <a href="#history" onClick={() => setActiveTab("history")}>
          <History size={16} /> Historique
        </a>
      </nav>
      <Button
        type="button"
        variant="secondary"
        className="sidebar-logout"
        icon={<LogOut size={15} />}
        onClick={() => {
          localStorage.removeItem("adminAuth");
          setAdminAuth(null);
          window.location.reload();
        }}
      >
        Déconnexion
      </Button>
    </>
  );

  if (!adminAuth) {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Connexion Admin" subtitle="Plateforme bots IA + WhatsApp">
          <form onSubmit={handleAdminLogin} className="form">
            <label>
              Email admin
              <input
                type="email"
                value={adminLoginForm.email}
                onChange={(e) => setAdminLoginForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                value={adminLoginForm.password}
                onChange={(e) => setAdminLoginForm((p) => ({ ...p, password: e.target.value }))}
                required
              />
            </label>
            <Button type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
          {error && <p className="toast toast-error">{error}</p>}
        </Card>
      </main>
    );
  }

  return (
    <AppShell
      sidebar={sidebar}
      header={
        <div className="topbar">
          <h1>Administration Bots IA WhatsApp</h1>
          <p className="muted">Un bot = un domaine métier + une session WhatsApp dédiée.</p>
        </div>
      }
    >
      {message && <p className="toast toast-success">{message}</p>}
      {error && <p className="toast toast-error">{error}</p>}

      {activeTab === "dashboard" && (
        <Card title="Vue globale">
          <p>Bots créés : <strong>{bots.length}</strong></p>
          <p>
            Connectés WhatsApp :{" "}
            <strong>
              {Object.values(whatsappByBotId).filter((s) => s.sessionStatus === "connected").length}
            </strong>
          </p>
        </Card>
      )}

      {activeTab === "bots" && (
        <>
          <Card title="Créer un bot" actions={<PlusCircle size={18} />}>
            <form className="form" onSubmit={handleCreateBot}>
              <label>Nom<input value={botForm.name} onChange={(e) => setBotForm((p) => ({ ...p, name: e.target.value }))} required /></label>
              <label>Slug<input value={botForm.slug} onChange={(e) => setBotForm((p) => ({ ...p, slug: e.target.value }))} placeholder="auto si vide" /></label>
              <label>Domaine<input value={botForm.domain} onChange={(e) => setBotForm((p) => ({ ...p, domain: e.target.value }))} required /></label>
              <label>Description<textarea value={botForm.description} onChange={(e) => setBotForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <label>Guardrails<textarea value={botForm.promptGuardrails} onChange={(e) => setBotForm((p) => ({ ...p, promptGuardrails: e.target.value }))} /></label>
              <Button type="submit">Créer bot</Button>
            </form>
          </Card>

          <Card title="Bots métier">
            {bots.length === 0 ? (
              <EmptyState title="Aucun bot pour le moment." />
            ) : (
              <div className="users-grid">
                {bots.map((bot) => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    whatsappStatus={whatsappByBotId[bot.id]}
                    selected={Number(selectedBotId) === Number(bot.id)}
                    onSelect={(id) => setSelectedBotId(id)}
                    onInit={handleWhatsappInit}
                    onRestart={handleWhatsappRestart}
                    onDisconnect={handleWhatsappDisconnect}
                  />
                ))}
                {selectedBot && (
                  <div className="user-item">
                    <p><strong>{selectedBot.name}</strong> — Actions métier</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleToggleBotStatus(selectedBot)}
                      >
                        {selectedBot.status === "active" ? "Désactiver bot" : "Activer bot"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {activeTab === "knowledge" && (
        <Card title="Knowledge Base par bot" subtitle="Chaque source appartient strictement à un bot.">
          <label>
            Bot ciblé
            <select
              value={selectedBotId || ""}
              onChange={(e) => setSelectedBotId(Number(e.target.value) || null)}
            >
              <option value="">-- Sélectionner --</option>
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name} ({bot.domain})
                </option>
              ))}
            </select>
          </label>

          {selectedBotId ? (
            <div className="kb-grid">
              <form className="form kb-form" onSubmit={handleAddTextSource}>
                <h3>Source texte</h3>
                <label>Titre<input value={textSourceForm.title} onChange={(e) => setTextSourceForm((p) => ({ ...p, title: e.target.value }))} required /></label>
                <label>Contenu<textarea value={textSourceForm.contentText} onChange={(e) => setTextSourceForm((p) => ({ ...p, contentText: e.target.value }))} required /></label>
                <Button type="submit">Ajouter texte</Button>
              </form>

              <form className="form kb-form" onSubmit={handleAddPdfSource}>
                <h3>Source PDF</h3>
                <label>Titre<input value={pdfForm.title} onChange={(e) => setPdfForm((p) => ({ ...p, title: e.target.value }))} required /></label>
                <label>Fichier PDF<input type="file" accept=".pdf" onChange={(e) => setPdfForm((p) => ({ ...p, file: e.target.files?.[0] || null }))} required /></label>
                <Button type="submit">Uploader PDF</Button>
              </form>

              <form className="form kb-form" onSubmit={handleAddApiSource}>
                <h3>Source API</h3>
                <label>Titre<input value={apiSourceForm.title} onChange={(e) => setApiSourceForm((p) => ({ ...p, title: e.target.value }))} required /></label>
                <label>API URL<input value={apiSourceForm.apiUrl} onChange={(e) => setApiSourceForm((p) => ({ ...p, apiUrl: e.target.value }))} required /></label>
                <label>Méthode
                  <select value={apiSourceForm.apiMethod} onChange={(e) => setApiSourceForm((p) => ({ ...p, apiMethod: e.target.value }))}>
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                  </select>
                </label>
                <label>Headers JSON<textarea value={apiSourceForm.apiHeadersJson} onChange={(e) => setApiSourceForm((p) => ({ ...p, apiHeadersJson: e.target.value }))} /></label>
                <Button type="submit">Ajouter API</Button>
              </form>
            </div>
          ) : (
            <EmptyState title="Choisissez un bot pour gérer ses sources." />
          )}

          <div className="users-grid" style={{ marginTop: 14 }}>
            {sources.map((s) => (
              <article key={s.id} className="user-item">
                <p><strong>{s.title}</strong> — {s.sourceType}</p>
                <p className="muted">Statut: <StatusBadge value={s.status} /></p>
                {s.lastError ? <p className="toast toast-error">{s.lastError}</p> : null}
                <Button type="button" variant="secondary" onClick={() => handleProcessSource(s.id)}>
                  Re-traiter
                </Button>
              </article>
            ))}
          </div>
        </Card>
      )}

      {activeTab === "conversations" && (
        <Card title="Conversations WhatsApp par bot">
          <label>
            Bot
            <select
              value={selectedBotId || ""}
              onChange={(e) => setSelectedBotId(Number(e.target.value) || null)}
            >
              <option value="">-- Sélectionner --</option>
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>
          </label>

          <div className="users-grid" style={{ marginTop: 10 }}>
            {conversations.map((c) => (
              <article key={c.id} className="user-item">
                <p><Phone size={14} /> <strong>{c.contact_phone}</strong> {c.contact_name ? `— ${c.contact_name}` : ""}</p>
                <p className="muted">Dernier message: {new Date(c.last_message_at).toLocaleString()}</p>
                <Button type="button" variant="secondary" onClick={() => handleSelectConversation(c.id)}>
                  Ouvrir messages
                </Button>
              </article>
            ))}
          </div>

          {selectedConversationId ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Sender</th>
                    <th>Message</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => (
                    <tr key={m.id}>
                      <td><StatusBadge value={m.sender_type} /></td>
                      <td>{m.message_text}</td>
                      <td>{new Date(m.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      )}

      {activeTab === "history" && (
        <Card title="Historique API par bot">
          <label>
            Bot
            <select
              value={selectedBotId || ""}
              onChange={(e) => setSelectedBotId(Number(e.target.value) || null)}
            >
              <option value="">-- Sélectionner --</option>
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>
          </label>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Response</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {apiLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.request_summary}</td>
                    <td>{log.response_summary}</td>
                    <td>{log.status_code || "-"}</td>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}

export default App;

