import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getApiBaseUrl, humanizeFetchError } from "./api";
import { guessLocalFrontendBaseUrl } from "./lanDiscovery";
import {
  BookOpen,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PlugZap,
  QrCode,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import AppShell from "./components/layout/AppShell";
import { Button, Card, EmptyState, StatusBadge } from "./components/ui";

const API_BASE_URL = getApiBaseUrl();
const MOBILE_SESSION_KEY = "marsaMobileSession";
const DEVICE_BINDING_KEY = "marsaDeviceBinding";
const CHAT_SESSION_KEY = "marsaUserChat";

function getUserAuthToken() {
  return (
    localStorage.getItem(DEVICE_BINDING_KEY) ||
    localStorage.getItem(MOBILE_SESSION_KEY) ||
    ""
  );
}

const getErrorMessage = async (response) => {
  try {
    const data = await response.json();
    return [data.error, data.details].filter(Boolean).join(" — ");
  } catch {
    return "Une erreur inattendue est survenue.";
  }
};

const formatTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
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
  const [qrPublicBaseUrl, setQrPublicBaseUrl] = useState(() => {
    const stored = (localStorage.getItem("marsaQrPublicBaseUrl") || "").trim();
    if (stored) return stored;
    const env = import.meta.env.VITE_PUBLIC_FRONTEND_URL;
    if (env && String(env).trim()) return String(env).trim().replace(/\/+$/, "");
    return "";
  });
  const [knowledgeSources, setKnowledgeSources] = useState([]);
  const [textSourceForm, setTextSourceForm] = useState({
    title: "",
    description: "",
    content: "",
  });
  const [apiSourceForm, setApiSourceForm] = useState({
    title: "",
    description: "",
    apiUrl: "",
    apiMethod: "GET",
    apiHeaders: "{}",
    apiBody: "",
  });
  const [documentForm, setDocumentForm] = useState({
    title: "",
    description: "",
    file: null,
  });

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

  const fetchKnowledgeSources = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge/sources`);
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      const data = await response.json();
      setKnowledgeSources(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (adminAuth) {
      fetchUsers();
      fetchPendingUsers();
      fetchHistory();
      fetchKnowledgeSources();
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
      await fetchKnowledgeSources();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddTextSource = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge/sources/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(textSourceForm),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setTextSourceForm({ title: "", description: "", content: "" });
      setMessage("Source texte ajoutée.");
      await fetchKnowledgeSources();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddApiSource = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(apiSourceForm.apiHeaders || "{}");
      } catch {
        throw new Error("Headers API doivent être un JSON valide.");
      }
      const response = await fetch(`${API_BASE_URL}/knowledge/sources/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...apiSourceForm,
          apiHeaders: parsedHeaders,
        }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setApiSourceForm({
        title: "",
        description: "",
        apiUrl: "",
        apiMethod: "GET",
        apiHeaders: "{}",
        apiBody: "",
      });
      setMessage("Source API ajoutée.");
      await fetchKnowledgeSources();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddDocumentSource = async (event) => {
    event.preventDefault();
    if (!documentForm.file) {
      setError("Choisissez un document.");
      return;
    }
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("title", documentForm.title);
      body.append("description", documentForm.description);
      body.append("file", documentForm.file);
      const response = await fetch(`${API_BASE_URL}/knowledge/sources/document`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setDocumentForm({ title: "", description: "", file: null });
      setMessage("Document ajouté.");
      await fetchKnowledgeSources();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProcessSource = async (sourceId) => {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge/sources/${sourceId}/process`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setMessage("Source retraitée.");
      await fetchKnowledgeSources();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleSource = async (source) => {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge/sources/${source.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !source.isActive,
        }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setMessage(`Source ${!source.isActive ? "activée" : "désactivée"}.`);
      await fetchKnowledgeSources();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteSource = async (source) => {
    if (!window.confirm(`Supprimer la source "${source.title}" ?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge/sources/${source.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      setMessage("Source supprimée.");
      await fetchKnowledgeSources();
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

  const persistQrPublicBaseUrl = useCallback((value) => {
    setQrPublicBaseUrl(value);
    const t = value.trim();
    if (t) localStorage.setItem("marsaQrPublicBaseUrl", t);
    else localStorage.removeItem("marsaQrPublicBaseUrl");
  }, []);

  useEffect(() => {
    if (!adminAuth) return undefined;
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") return undefined;
    if ((localStorage.getItem("marsaQrPublicBaseUrl") || "").trim()) return undefined;
    if (import.meta.env.VITE_PUBLIC_FRONTEND_URL) return undefined;
    let cancelled = false;
    const port = window.location.port || "5173";
    guessLocalFrontendBaseUrl(port).then((url) => {
      if (!cancelled && url) persistQrPublicBaseUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [adminAuth, persistQrPublicBaseUrl]);

  const handleGenerateQr = async (userId) => {
    setError("");
    setMessage("");
    try {
      const body =
        qrPublicBaseUrl.trim().length > 0
          ? { publicFrontendUrl: qrPublicBaseUrl.trim() }
          : {};
      const response = await fetch(
        `${API_BASE_URL}/authorized-users/${userId}/generate-qr`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
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
      <main className="auth-page">
        <Card
          className="auth-card"
          title="Connexion Admin"
          subtitle="Espace sécurisé de gestion Marsa Maroc IA"
        >
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
            <Button type="submit" icon={<ShieldCheck size={16} />}>
              Se connecter
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onUserFallback}
            >
              Je suis utilisateur (Login / S'inscrire)
            </Button>
          </form>
          {error && <p className="toast toast-error">{error}</p>}
        </Card>
      </main>
    );
  }

  return (
    <AppShell
      sidebar={
        <div className="sidebar-nav">
          <p className="sidebar-brand">Marsa Maroc AI</p>
          <a href="#admin-dashboard"><LayoutDashboard size={16} /> Dashboard</a>
          <a href="#admin-pending"><UserCheck size={16} /> Inscriptions</a>
          <a href="#admin-users"><Users size={16} /> Utilisateurs</a>
          <a href="#admin-kb"><BookOpen size={16} /> Knowledge Base</a>
          <a href="#admin-history"><History size={16} /> Historique</a>
          <Button
            variant="ghost"
            className="sidebar-logout"
            onClick={onAdminLogout}
            icon={<LogOut size={16} />}
          >
            Déconnexion
          </Button>
        </div>
      }
      header={
        <div className="topbar">
          <div>
            <h1>Administration</h1>
            <p className="muted">Gestion des utilisateurs, conversations et base de connaissances</p>
          </div>
        </div>
      }
    >
      {(message || error) && (
        <div className="toast-stack">
          {message ? <p className="toast toast-success">{message}</p> : null}
          {error ? <p className="toast toast-error">{error}</p> : null}
        </div>
      )}

      <Card
        id="admin-dashboard"
        className="fade-in"
        title="Ajouter un utilisateur autorisé"
        subtitle="Créez un accès utilisateur qui pourra démarrer une session par QR"
      >

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

          <Button type="submit" disabled={loading} icon={<Users size={16} />}>
            {loading ? "Ajout en cours…" : "Ajouter un utilisateur autorisé"}
          </Button>
        </form>
      </Card>

      <Card id="admin-pending" className="fade-in" title="Demandes d'inscription en attente">
        {pendingUsers.length === 0 ? (
          <EmptyState title="Aucune demande en attente." subtitle="Les nouvelles inscriptions apparaîtront ici." />
        ) : (
          <div className="users-grid">
            {pendingUsers.map((u) => (
              <article className="user-item" key={`pending-${u.id}`}>
                <p>
                  <strong>{u.name}</strong> — {u.phone}
                </p>
                <p className="muted">Email : {u.email || "-"}</p>
                <Button type="button" variant="secondary" onClick={() => handleApproveUser(u.id)}>
                  Accepter cet utilisateur
                </Button>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card id="admin-users" className="fade-in" title="Utilisateurs autorisés">
        <label className="form" style={{ marginBottom: 14, display: "grid", gap: 6 }}>
          <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
            URL du front pour les QR (téléphone / scan)
          </span>
          <span className="muted small-hint" style={{ fontSize: 12, marginTop: -2 }}>
            Tu peux garder <code>http://localhost:5173/#admin-dashboard</code> dans la barre d’adresse du Mac :
            ce champ est <strong>seulement</strong> l’URL encodée dans le QR pour le téléphone (ex.{" "}
            <code>http://172.20.10.3:5173</code>), pas celle du navigateur admin.
          </span>
          <input
            type="url"
            inputMode="url"
            placeholder="ex. http://172.20.10.2:5173 ou https://xxx.ngrok-free.app"
            value={qrPublicBaseUrl}
            onChange={(e) => persistQrPublicBaseUrl(e.target.value)}
            autoComplete="off"
          />
          <span className="muted small-hint" style={{ fontSize: 12 }}>
            <strong>Partage de connexion (iPhone → Mac)</strong> : sur le <strong>Mac</strong> connecté au
            hotspot, va dans <strong>Réglages système → Réseau → Wi‑Fi</strong> (le réseau du téléphone) →{" "}
            <strong>Détails</strong> et note l’<strong>adresse IP</strong> (souvent <code>172.20.10.2</code>).
            Colle ici exactement <code>http://CETTE_IP:5173</code>, puis « Générer QR ». Sur le téléphone,{" "}
            <code>localhost</code> ne peut jamais désigner ton Mac. Détection auto ou{" "}
            <code>VITE_PUBLIC_FRONTEND_URL</code> dans <code>frontend/.env</code> si tu préfères.
          </span>
        </label>
        {users.length === 0 ? (
          <EmptyState title="Aucun utilisateur autorisé." />
        ) : (
          <div className="users-grid">
            {users.map((user) => (
              <article className="user-item" key={user.id}>
                <p>
                  <strong>{user.name}</strong> — {user.phone}
                </p>
                <p className="muted">Statut : <StatusBadge value={user.is_active ? "Actif" : "Inactif"} /></p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleGenerateQr(user.id)}
                  icon={<QrCode size={16} />}
                >
                  Générer QR
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => handleDeleteUser(user.id, user.name)}
                  icon={<Trash2 size={16} />}
                >
                  Supprimer le compte
                </Button>

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
      </Card>

      <Card
        id="admin-kb"
        className="fade-in"
        title="Knowledge Base (Sources IA)"
        subtitle="Ajoutez vos sources texte, documents ou API et gérez leur traitement."
      >
        <div className="kb-intro">
          <p className="muted">
            Le chatbot privilégie ces sources lors des réponses utilisateur.
          </p>
          <span className="kb-chip">RAG activé</span>
        </div>

        <div className="kb-grid">
          <form onSubmit={handleAddTextSource} className="form kb-form kb-form-balanced">
            <div className="kb-form-head">
              <span className="kb-form-icon"><FileText size={16} /></span>
              <div>
                <h3>Ajouter un texte</h3>
                <p className="muted">Procédures, règles métier, consignes internes.</p>
              </div>
            </div>
            <label className="kb-field">
              <span>Titre</span>
              <input
                type="text"
                placeholder="Ex: Politique transport"
                value={textSourceForm.title}
                onChange={(e) =>
                  setTextSourceForm((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
            </label>
            <label className="kb-field">
              <span>Description</span>
              <input
                type="text"
                placeholder="Description optionnelle"
                value={textSourceForm.description}
                onChange={(e) =>
                  setTextSourceForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </label>
            <label className="kb-field">
              <span>Contenu</span>
              <textarea
                className="kb-textarea"
                placeholder="Écrivez le contenu de référence utilisé par l'IA..."
                value={textSourceForm.content}
                onChange={(e) =>
                  setTextSourceForm((prev) => ({ ...prev, content: e.target.value }))
                }
                rows={7}
                required
              />
            </label>
            <Button type="submit" className="kb-submit">Ajouter source texte</Button>
          </form>

          <form onSubmit={handleAddDocumentSource} className="form kb-form kb-form-balanced">
            <div className="kb-form-head">
              <span className="kb-form-icon"><Upload size={16} /></span>
              <div>
                <h3>Uploader un document</h3>
                <p className="muted">Formats acceptés: PDF, DOCX, TXT.</p>
              </div>
            </div>
            <label className="kb-field">
              <span>Titre</span>
              <input
                type="text"
                placeholder="Ex: Rapport logistique Q2"
                value={documentForm.title}
                onChange={(e) =>
                  setDocumentForm((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
            </label>
            <label className="kb-field">
              <span>Description</span>
              <input
                type="text"
                placeholder="Description optionnelle"
                value={documentForm.description}
                onChange={(e) =>
                  setDocumentForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </label>
            <label className="kb-upload-box">
              <span>Fichier source</span>
              <input
                className="kb-file-input"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) =>
                  setDocumentForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))
                }
                required
              />
              <small className="muted">
                {documentForm.file ? documentForm.file.name : "Cliquez pour choisir un fichier"}
              </small>
            </label>
            <Button type="submit" className="kb-submit">Ajouter document</Button>
          </form>

          <form onSubmit={handleAddApiSource} className="form kb-form kb-form-balanced">
            <div className="kb-form-head">
              <span className="kb-form-icon"><PlugZap size={16} /></span>
              <div>
                <h3>Ajouter une source API</h3>
                <p className="muted">Synchronisez des données dynamiques.</p>
              </div>
            </div>
            <label className="kb-field">
              <span>Titre</span>
              <input
                type="text"
                placeholder="Ex: API flotte véhicules"
                value={apiSourceForm.title}
                onChange={(e) =>
                  setApiSourceForm((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
            </label>
            <label className="kb-field">
              <span>URL API</span>
              <input
                type="text"
                placeholder="https://..."
                value={apiSourceForm.apiUrl}
                onChange={(e) =>
                  setApiSourceForm((prev) => ({ ...prev, apiUrl: e.target.value }))
                }
                required
              />
            </label>
            <label className="kb-field">
              <span>Méthode</span>
              <select
                value={apiSourceForm.apiMethod}
                onChange={(e) =>
                  setApiSourceForm((prev) => ({ ...prev, apiMethod: e.target.value }))
                }
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </label>
            <label className="kb-field">
              <span>Headers (JSON)</span>
              <textarea
                className="kb-textarea kb-textarea-sm"
                placeholder='{"Authorization":"Bearer ..."}'
                value={apiSourceForm.apiHeaders}
                onChange={(e) =>
                  setApiSourceForm((prev) => ({ ...prev, apiHeaders: e.target.value }))
                }
                rows={3}
              />
            </label>
            <label className="kb-field">
              <span>Body (si POST)</span>
              <textarea
                className="kb-textarea kb-textarea-sm"
                placeholder="Corps de requête optionnel"
                value={apiSourceForm.apiBody}
                onChange={(e) =>
                  setApiSourceForm((prev) => ({ ...prev, apiBody: e.target.value }))
                }
                rows={3}
              />
            </label>
            <Button type="submit" className="kb-submit">Ajouter source API</Button>
          </form>
        </div>

        <h3>Sources existantes</h3>
        {knowledgeSources.length === 0 ? (
          <EmptyState title="Aucune source pour le moment." />
        ) : (
          <div className="users-grid">
            {knowledgeSources.map((source) => (
              <article className="user-item" key={`source-${source.id}`}>
                <p>
                  <strong>{source.title}</strong> — {source.typeSource}
                </p>
                <p className="muted">Statut: <StatusBadge value={source.status} /> | <StatusBadge value={source.isActive ? "Actif" : "Inactif"} /></p>
                {source.description && <p className="muted">{source.description}</p>}
                {source.lastError && <p className="error">Erreur: {source.lastError}</p>}
                <div className="mode-switch">
                  <Button type="button" onClick={() => handleProcessSource(source.id)}>
                    Traiter
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleToggleSource(source)}
                  >
                    {source.isActive ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => handleDeleteSource(source)}
                  >
                    Supprimer
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card id="admin-history" className="fade-in" title="Historique des conversations">
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
          <Button type="submit" icon={<MessageSquare size={16} />}>Filtrer</Button>
        </form>

        {historyRows.length === 0 ? (
          <EmptyState title="Aucun historique pour les filtres actuels." />
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
      </Card>
    </AppShell>
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
  const messagesEndRef = useRef(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chatBusy]);

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
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, createdAt: new Date().toISOString() },
    ]);

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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          knowledge: data.knowledge,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Erreur: ${err.message}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Connexion en cours">
          <p>Vérification du lien d'accès utilisateur…</p>
        </Card>
      </main>
    );
  }

  if (error && !pendingUser && !session) {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Accès refusé">
          <p className="toast toast-error">{error}</p>
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Vérification du numéro">
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
            <Button type="submit" disabled={loading}>
              {loading ? "Vérification..." : "Entrer dans la session"}
            </Button>
          </form>
          {error && <p className="toast toast-error">{error}</p>}
        </Card>
      </main>
    );
  }

  return (
    <main className="chat-page">
      <Card className="chat-header" title={`Bienvenue ${user?.name || ""}`}>
        <p>Session: {session?.sessionId}</p>
      </Card>

      <section className="chat-surface">
        <div className="chat-surface-head">
          <h2>Chat utilisateur</h2>
          <StatusBadge value={chatBusy ? "IA en cours..." : "Session active"} />
        </div>
        <div className="messages modern-scroll">
          {messages.length === 0 ? (
            <EmptyState title="Posez votre première question." subtitle="La base de connaissances admin est priorisée." />
          ) : (
            messages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`msg ${msg.role}`}>
                <div className="msg-head">
                  <strong>{msg.role === "user" ? "Vous" : "Bot"}</strong>
                  <span className="msg-time">{formatTime(msg.createdAt)}</span>
                </div>
                <p>{msg.content}</p>
                {msg.role === "assistant" && msg.knowledge && (
                  <div className="knowledge-indicator">
                    {msg.knowledge.used ? (
                      <span>
                        Source admin utilisée:{" "}
                        {(msg.knowledge.sources || []).map((s) => s.title).join(", ") || "-"}
                      </span>
                    ) : (
                      <span>Aucune donnée pertinente trouvée dans la base admin.</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} className="chat-form">
          <input
            type="text"
            placeholder="Écrivez votre message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <Button type="submit" disabled={chatBusy}>
            {chatBusy ? "Envoi..." : "Envoyer"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function UserChatPage() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_SESSION_KEY);
      if (!raw) {
        setError("Aucune session active. Scannez à nouveau le QR depuis l’appareil connecté.");
        return;
      }
      const data = JSON.parse(raw);
      if (!data.session?.sessionToken) {
        setError("Session invalide.");
        return;
      }
      setSession(data.session);
      setUser(data.user || null);
    } catch {
      setError("Session invalide.");
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chatBusy]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!chatInput.trim() || !session?.sessionToken) return;

    const question = chatInput.trim();
    setChatBusy(true);
    setChatInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, createdAt: new Date().toISOString() },
    ]);

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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          knowledge: data.knowledge,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Erreur: ${err.message}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  if (error) {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Session chat">
          <p className="toast toast-error">{error}</p>
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Chargement…">
          <p>Préparation du chat…</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="chat-page">
      <Card className="chat-header" title={`Bienvenue ${user?.name || ""}`}>
        <p>Session: {session?.sessionId}</p>
      </Card>

      <section className="chat-surface">
        <div className="chat-surface-head">
          <h2>Chat utilisateur</h2>
          <StatusBadge value={chatBusy ? "IA en cours..." : "Session active"} />
        </div>
        <div className="messages modern-scroll">
          {messages.length === 0 ? (
            <EmptyState
              title="Posez votre première question."
              subtitle="La base de connaissances admin est priorisée."
            />
          ) : (
            messages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`msg ${msg.role}`}>
                <div className="msg-head">
                  <strong>{msg.role === "user" ? "Vous" : "Bot"}</strong>
                  <span className="msg-time">{formatTime(msg.createdAt)}</span>
                </div>
                <p>{msg.content}</p>
                {msg.role === "assistant" && msg.knowledge && (
                  <div className="knowledge-indicator">
                    {msg.knowledge.used ? (
                      <span>
                        Source admin utilisée:{" "}
                        {(msg.knowledge.sources || []).map((s) => s.title).join(", ") || "-"}
                      </span>
                    ) : (
                      <span>Aucune donnée pertinente trouvée dans la base admin.</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} className="chat-form">
          <input
            type="text"
            placeholder="Écrivez votre message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <Button type="submit" disabled={chatBusy}>
            {chatBusy ? "Envoi..." : "Envoyer"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function QrConnectSpace() {
  const qrToken = useMemo(
    () => new URLSearchParams(window.location.search).get("s") || "",
    []
  );
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [otpDigits, setOtpDigits] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [devCodeHint, setDevCodeHint] = useState("");
  const [smsErrorDetail, setSmsErrorDetail] = useState("");
  const [retryAfterSec, setRetryAfterSec] = useState(0);
  const [otpBusy, setOtpBusy] = useState(false);
  const autoOtpBootRef = useRef(false);

  const applyChatAndRedirect = useCallback((data) => {
    if (data.deviceBindingToken) {
      localStorage.setItem(DEVICE_BINDING_KEY, data.deviceBindingToken);
    }
    sessionStorage.setItem(
      CHAT_SESSION_KEY,
      JSON.stringify({
        session: data.session,
        user: data.user,
      })
    );
    setPhase("ok");
    window.location.replace(`${window.location.origin}/user-chat`);
  }, []);

  const runRequestOtp = useCallback(async () => {
    setError("");
    setDevCodeHint("");
    setSmsErrorDetail("");
    setPhase("requesting_otp");
    try {
      const res = await fetch(
        `${API_BASE_URL}/qr-session/${encodeURIComponent(qrToken)}/request-phone-otp`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setRetryAfterSec(Number(data.retryAfterSec) || 60);
        try {
          const hintRes = await fetch(
            `${API_BASE_URL}/qr-session/${encodeURIComponent(qrToken)}`
          );
          const hint = await hintRes.json().catch(() => ({}));
          if (hint.phoneHintLast4) {
            setPhoneLast4(hint.phoneHintLast4);
          }
        } catch {
          /* ignore */
        }
        setPhase("otp");
        setError(
          data.codeRecentlySent
            ? "Un code vient déjà d’être demandé il y a moins d’une minute. Vérifiez vos SMS. Sans Twilio configuré, le code est affiché dans le terminal du serveur Node (ligne « [qr-phone-otp] »)."
            : data.error || "Attendez avant de redemander un code."
        );
        return;
      }
      if (!res.ok) {
        if (res.status === 503) {
          setPhase("sms_unavailable");
          setError(
            [data.error, data.details].filter(Boolean).join(" — ") ||
              "Service SMS non configuré."
          );
          return;
        }
        if (res.status === 410) {
          setPhase("expired");
          setError(
            [data.error, data.details].filter(Boolean).join(" — ") ||
              "Ce QR n’est plus valide."
          );
          return;
        }
        setPhase("error");
        setError([data.error, data.details].filter(Boolean).join(" — ") || "Échec envoi du code.");
        return;
      }
      setPhoneLast4(data.phoneLast4 || "****");
      setSmsSent(!!data.smsSent);
      setRetryAfterSec(0);
      if (data.smsErrorDetail) {
        setSmsErrorDetail(String(data.smsErrorDetail));
      }
      if (data.devCode) {
        setDevCodeHint(`Saisissez ce code : ${data.devCode} (affiché ici uniquement, pas par SMS).`);
      }
      setOtpDigits("");
      setPhase("otp");
    } catch (err) {
      setPhase("error");
      setError(err.message || "Erreur réseau.");
    }
  }, [qrToken]);

  const runVerifyOtp = useCallback(
    async (code) => {
      const c = String(code || "").replace(/\D/g, "").slice(0, 6);
      if (c.length !== 6) return;
      setOtpBusy(true);
      setError("");
      try {
        const res = await fetch(
          `${API_BASE_URL}/qr-session/${encodeURIComponent(qrToken)}/verify-phone-otp`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: c }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403 && data.status === "rejected") {
            setPhase("rejected");
            setError(data.error || "Session refusée.");
            return;
          }
          if (res.status === 410) {
            setPhase("expired");
            setError(data.error || "Code ou QR expiré.");
            return;
          }
          setError([data.error, data.details].filter(Boolean).join(" — ") || "Code invalide.");
          return;
        }
        applyChatAndRedirect(data);
      } catch (err) {
        setError(err.message || "Erreur réseau.");
      } finally {
        setOtpBusy(false);
      }
    },
    [applyChatAndRedirect, qrToken]
  );

  const runScan = useCallback(
    async (bearerToken) => {
      setPhase("scanning");
      setError("");
      try {
        const res = await fetch(
          `${API_BASE_URL}/qr-session/${encodeURIComponent(qrToken)}/scan`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${bearerToken}` },
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) {
            localStorage.removeItem(MOBILE_SESSION_KEY);
            localStorage.removeItem(DEVICE_BINDING_KEY);
            await runRequestOtp();
            return;
          }
          if (res.status === 410 || data.status === "expired") {
            setPhase("expired");
            setError(
              [data.error, data.details].filter(Boolean).join(" — ") ||
                "Ce QR a expiré. Demandez-en un nouveau à l’administrateur."
            );
            return;
          }
          if (res.status === 403 || data.status === "rejected") {
            setPhase("rejected");
          } else {
            setPhase("error");
          }
          setError([data.error, data.details].filter(Boolean).join(" — ") || "Échec validation.");
          return;
        }
        applyChatAndRedirect(data);
      } catch (err) {
        setPhase("error");
        setError(err.message || "Erreur réseau.");
      }
    },
    [applyChatAndRedirect, qrToken, runRequestOtp]
  );

  useEffect(() => {
    if (!qrToken) {
      setError("Lien QR invalide (paramètre s manquant).");
      setPhase("error");
      return;
    }
    const auth = getUserAuthToken();
    if (auth) {
      runScan(auth);
      return;
    }
    if (autoOtpBootRef.current) {
      return;
    }
    autoOtpBootRef.current = true;
    runRequestOtp();
  }, [qrToken, runScan, runRequestOtp]);

  useEffect(() => {
    if (retryAfterSec <= 0) return undefined;
    const id = window.setTimeout(() => {
      setRetryAfterSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [retryAfterSec]);

  useEffect(() => {
    if (phase !== "otp" || typeof window === "undefined") return undefined;
    if (!("OTPCredential" in window)) return undefined;
    const ac = new AbortController();
    navigator.credentials
      .get({
        otp: { transport: ["sms"] },
        signal: ac.signal,
      })
      .then((otp) => {
        if (otp && "code" in otp && otp.code) {
          setOtpDigits(String(otp.code));
          runVerifyOtp(String(otp.code));
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, [phase, runVerifyOtp]);

  if (phase === "loading" || phase === "scanning" || phase === "requesting_otp") {
    return (
      <main className="auth-page">
        <Card
          className="auth-card"
          title={
            phase === "scanning"
              ? "Ouverture de la session…"
              : phase === "requesting_otp"
                ? "Envoi du code…"
                : "Ouverture du lien QR…"
          }
        >
          <p className="muted">
            {phase === "requesting_otp"
              ? "Préparation du code affiché sur cette page (aucun mot de passe)."
              : "Vérification en cours…"}
          </p>
        </Card>
      </main>
    );
  }

  if (phase === "sms_unavailable") {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Vérification impossible">
          <p className="toast toast-error">{error}</p>
          <p className="muted">
            Configurez Twilio (<code>TWILIO_*</code>) et <code>QR_OTP_ENABLE_SMS=1</code>, ou pour les
            SMS : <code>BASE_URL</code> (URL publique du front) pour dériver le domaine WebOTP. Secret{" "}
            <code>QR_OTP_PEPPER</code> requis côté serveur.
          </p>
        </Card>
      </main>
    );
  }

  if (phase === "otp") {
    return (
      <main className="auth-page">
        <Card
          className="auth-card"
          title="Confirmez votre numéro"
          subtitle={
            smsSent
              ? `Un SMS a aussi été envoyé au numéro enregistré pour ce QR (···${phoneLast4}). Le code figure ci-dessous.`
              : `Le code à 6 chiffres s’affiche sur cette page uniquement (aucun SMS). Référence titulaire du QR : ···${phoneLast4}.`
          }
        >
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              runVerifyOtp(otpDigits);
            }}
          >
            <label>
              Code à 6 chiffres
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                name="one-time-code"
                maxLength={6}
                value={otpDigits}
                onChange={(e) => setOtpDigits(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={otpBusy}
              />
            </label>
            <Button type="submit" disabled={otpBusy || otpDigits.length !== 6}>
              {otpBusy ? "Vérification…" : "Valider et ouvrir le chat"}
            </Button>
          </form>
          {smsErrorDetail && (
            <p className="muted small-hint" style={{ color: "#92400e" }}>
              Twilio : {smsErrorDetail}
            </p>
          )}
          {devCodeHint && (
            <div className="otp-dev-banner" role="status">
              <strong>Votre code</strong>
              <p>{devCodeHint}</p>
            </div>
          )}
          {error && <p className="toast toast-error">{error}</p>}
          <p className="muted small-hint">
            <button
              type="button"
              className="link-button"
              disabled={retryAfterSec > 0 || otpBusy}
              onClick={() => runRequestOtp()}
            >
              Renvoyer le code
            </button>
            {retryAfterSec > 0 ? ` (dans ${retryAfterSec}s)` : ""}
          </p>
        </Card>
      </main>
    );
  }

  if (phase === "expired") {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="QR expiré">
          <p className="toast toast-error">{error || "Ce lien n’est plus valide."}</p>
          <p className="muted">Demandez un nouveau code à l’administrateur, puis scannez-le à nouveau.</p>
          <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
            Réessayer (même lien)
          </Button>
        </Card>
      </main>
    );
  }

  if (phase === "rejected" || phase === "error") {
    return (
      <main className="auth-page">
        <Card className="auth-card" title="Accès refusé">
          <p className="toast toast-error">{error || "Ce QR ne correspond pas à votre compte."}</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <Card className="auth-card" title="Redirection…">
        <p>Accès autorisé, ouverture du chat…</p>
      </Card>
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
  const [loginExtras, setLoginExtras] = useState(null);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);

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
      setError(humanizeFetchError(err));
    } finally {
      setLoading(false);
    }
  };

  const onLoginSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setLoginExtras(null);

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
      if (data.deviceBindingToken) {
        localStorage.setItem(DEVICE_BINDING_KEY, data.deviceBindingToken);
      }
      if (data.mobileSessionToken) {
        localStorage.setItem(MOBILE_SESSION_KEY, data.mobileSessionToken);
      }
      const authForApi = getUserAuthToken();
      let qrPayload = null;
      if (authForApi) {
        try {
          const storedBase = (localStorage.getItem("marsaQrPublicBaseUrl") || "").trim();
          const qrBody = storedBase ? { publicFrontendUrl: storedBase } : {};
          const qrRes = await fetch(`${API_BASE_URL}/qr-session/create`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authForApi}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(qrBody),
          });
          if (qrRes.ok) {
            qrPayload = await qrRes.json();
          }
        } catch {
          /* ignore QR fetch failure */
        }
      }
      setLoginExtras({
        user: data.user,
        qr: qrPayload,
        token: authForApi,
      });
    } catch (err) {
      setError(humanizeFetchError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChatNow = async () => {
    const token = getUserAuthToken();
    if (!token) {
      setError("Appareil non enregistré. Reconnectez-vous une fois.");
      return;
    }
    setBootstrapBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE_URL}/user/chat-session/bootstrap`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error([d.error, d.details].filter(Boolean).join(" — "));
      }
      sessionStorage.setItem(
        CHAT_SESSION_KEY,
        JSON.stringify({ session: d.session, user: d.user })
      );
      window.location.href = `${window.location.origin}/user-chat`;
    } catch (err) {
      setError(humanizeFetchError(err));
    } finally {
      setBootstrapBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <Card
        className="auth-card"
        title="Espace Utilisateur"
        subtitle="Connectez-vous si votre compte est validé, sinon envoyez une demande."
      >
        <p>
          Connectez-vous si vous êtes déjà validé. Sinon inscrivez-vous et attendez
          la validation admin.
        </p>
        <div className="mode-switch">
          <Button
            type="button"
            variant={mode === "login" ? "secondary" : "ghost"}
            onClick={() => {
              setMode("login");
            }}
          >
            Login utilisateur
          </Button>
          <Button
            type="button"
            variant={mode === "register" ? "secondary" : "ghost"}
            onClick={() => {
              setLoginExtras(null);
              setMode("register");
            }}
          >
            S'inscrire
          </Button>
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
            <Button type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
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
            <Button type="submit" disabled={loading}>
              {loading ? "Envoi..." : "S'inscrire"}
            </Button>
          </form>
        )}
        {message && <p className="toast toast-success">{message}</p>}
        {error && <p className="toast toast-error">{error}</p>}

        {mode === "login" && loginExtras && (
          <div className="post-login-actions">
            <Button
              type="button"
              onClick={handleOpenChatNow}
              disabled={bootstrapBusy}
            >
              {bootstrapBusy ? "Ouverture…" : "Ouvrir le chat maintenant"}
            </Button>
            <p className="muted small-hint">
              Sans scanner : ouvre directement le chat sur cet appareil (vous êtes déjà authentifié).
            </p>
            {loginExtras.qr?.qrCodeDataUrl ? (
              <div className="qr-block">
                <p className="muted">
                  <strong>Votre QR personnel</strong> (valide ~15 min) : ouvrez le lien sur le
                  téléphone déjà enregistré (connexion unique faite avec votre compte), ou scannez ce
                  code avec ce même téléphone.
                </p>
                <img src={loginExtras.qr.qrCodeDataUrl} alt="QR accès chat" />
                <a
                  href={loginExtras.qr.accessUrl}
                  className="qr-open-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir le lien du QR (même effet que scanner ici)
                </a>
              </div>
            ) : (
              <p className="muted small-hint">
                QR personnel indisponible (vérifiez la base / backend). Utilisez « Ouvrir le chat
                maintenant » ou le QR généré par l’administrateur.
              </p>
            )}
          </div>
        )}

        <p className="muted">
          QR : au premier scan, un code SMS est envoyé au numéro enregistré (saisie minime ou
          automatique). Les scans suivants sur le même navigateur peuvent être instantanés grâce à la
          liaison d’appareil.
        </p>
        <Button type="button" variant="secondary" onClick={onBackToAdmin}>
          Retour connexion admin
        </Button>
      </Card>
    </main>
  );
}

function App() {
  const [mode, setMode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("enroll") === "1"
        ? "user"
        : "admin";
    } catch {
      return "admin";
    }
  });

  useLayoutEffect(() => {
    try {
      const p = window.location.pathname;
      const s = new URLSearchParams(window.location.search).get("s");
      if (
        s &&
        p !== "/qr-connect" &&
        p !== "/user-chat" &&
        p !== "/user-access"
      ) {
        window.location.replace(
          `${window.location.origin}/qr-connect?s=${encodeURIComponent(s)}`
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const path = window.location.pathname;

  if (path === "/user-access") {
    return <UserSpace />;
  }
  if (path === "/qr-connect") {
    return <QrConnectSpace />;
  }
  if (path === "/user-chat") {
    return <UserChatPage />;
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
