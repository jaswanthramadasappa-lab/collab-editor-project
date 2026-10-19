import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Plus,
  LogOut,
  Trash2,
  Share2,
  ArrowLeft,
  Users,
  Wifi,
} from "lucide-react";

import { api } from "./api.js";
import Editor from "./Editor.jsx";
import { getUserColor } from "./collabColors.js";

const TOKEN_KEY = "collab_editor_token";
const USER_KEY = "collab_editor_user";

export default function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_KEY) || ""
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  });

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [documents, setDocuments] = useState([]);
  const [active, setActive] = useState(null);
  const [health, setHealth] = useState("Checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("editor");
  const [onlineUsers, setOnlineUsers] = useState([]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    setToken("");
    setUser(null);
    setActive(null);
    setOnlineUsers([]);
    setDocuments([]);
    setMessage("");
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!token) return;

    try {
      const result = await api("/api/documents", { token });
      setDocuments(result.documents || []);
    } catch (error) {
      setMessage(error.message);

      if (/token|auth/i.test(error.message)) {
        logout();
      }
    }
  }, [token, logout]);

  useEffect(() => {
    api("/api/health")
      .then((data) =>
        setHealth(data.status === "ok" ? "Connected" : "Unavailable")
      )
      .catch(() => setHealth("Unavailable"));
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const path =
        mode === "register"
          ? "/api/auth/register"
          : "/api/auth/login";

      const data = await api(path, {
        method: "POST",
        body: JSON.stringify(form),
      });

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
      setForm({ name: "", email: "", password: "" });
      setMessage("Welcome to CollabSpace.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createDocument() {
    try {
      const data = await api("/api/documents", {
        token,
        method: "POST",
        body: JSON.stringify({ title: "Untitled document" }),
      });

      setDocuments((previous) => [
        data.document,
        ...previous,
      ]);

      setActive(data.document);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function openDocument(doc) {
    try {
      const data = await api(`/api/documents/${doc.id}`, { token });

      setActive(data.document);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteDocument(doc) {
    if (
      !window.confirm(
        `Delete "${doc.title}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await api(`/api/documents/${doc.id}`, {
        token,
        method: "DELETE",
      });

      setDocuments((previous) =>
        previous.filter((item) => item.id !== doc.id)
      );

      if (active?.id === doc.id) {
        setActive(null);
      }

      setMessage("Document deleted.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function renameDocument(id, title) {
    const trimmedTitle = (title || "").trim() || "Untitled document";
    try {
      const data = await api(`/api/documents/${id}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ title: trimmedTitle }),
      });

      setActive(data.document);

      setDocuments((previous) =>
        previous.map((doc) =>
          doc.id === id ? data.document : doc
        )
      );
    } catch (error) {
      setMessage(error.message);
    }
  }

  const saveContent = useCallback(
    async (id, content) => {
      try {
        const data = await api(`/api/documents/${id}`, {
          token,
          method: "PATCH",
          body: JSON.stringify({ content }),
        });

        setActive((current) =>
          current && current.id === id
            ? { ...current, content: data.document.content, updatedAt: data.document.updatedAt }
            : current
        );

        setDocuments((previous) =>
          previous.map((doc) =>
            doc.id === id
              ? { ...doc, content: data.document.content, updatedAt: data.document.updatedAt }
              : doc
          )
        );
      } catch (error) {
        setMessage(error.message);
        throw error;
      }
    },
    [token]
  );

  async function shareDocument(event) {
    event.preventDefault();

    if (!active) return;

    try {
      const data = await api(`/api/documents/${active.id}/share`, {
        token,
        method: "POST",
        body: JSON.stringify({
          email: shareEmail,
          role: shareRole,
        }),
      });

      if (data.document) {
        setActive(data.document);
        setDocuments((previous) =>
          previous.map((doc) =>
            doc.id === active.id ? data.document : doc
          )
        );
      }
      setMessage("Sharing permissions updated.");
      setShareEmail("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function goToDashboard() {
    setActive(null);
    setOnlineUsers([]);
    setMessage("");
    loadDocuments();
  }

  if (!token || !user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand" role="banner">
            <span className="brand-icon">C</span>
            CollabSpace
          </div>

          <p className="eyebrow">WORK BETTER TOGETHER</p>

          <h1>
            {mode === "register"
              ? "Create your account"
              : "Welcome back"}
          </h1>

          <p className="muted">
            Your team's ideas, together in one workspace.
          </p>

          <form onSubmit={submitAuth} className="auth-form">
            {mode === "register" && (
              <label>
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                  placeholder="Your name"
                />
              </label>
            )}

            <label>
              Email address
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                required
                minLength={8}
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({
                    ...form,
                    password: event.target.value,
                  })
                }
                placeholder="At least 8 characters"
              />
            </label>

            <button className="primary full" disabled={busy}>
              {busy
                ? "Please wait..."
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}

          <p className="switch-auth">
            {mode === "register"
              ? "Already have an account?"
              : "New to CollabSpace?"}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode(
                  mode === "register" ? "login" : "register"
                );
                setMessage("");
              }}
            >
              {mode === "register" ? "Sign in" : "Create account"}
            </button>
          </p>

          <p className="api-status">
            <span
              className={
                health === "Connected" ? "dot online" : "dot"
              }
            />
            API: {health}
          </p>
        </section>
      </main>
    );
  }

  if (active) {
    const isViewer = active.role === "viewer";

    return (
      <main className="editor-page">
        <header className="editor-topbar">
          <button
            type="button"
            className="icon-button"
            aria-label="Back to documents"
            onClick={goToDashboard}
          >
            <ArrowLeft size={18} />
          </button>

          <FileText size={20} className="purple" />

          <input
            className="title-input"
            aria-label="Document title"
            value={active.title}
            maxLength={160}
            readOnly={isViewer}
            disabled={isViewer}
            onChange={(event) =>
              setActive({
                ...active,
                title: event.target.value,
              })
            }
            onBlur={() => {
              if (!isViewer) {
                renameDocument(active.id, active.title);
              }
            }}
          />

          <span className="connection-pill">
            <span className={`live-pulse-dot ${onlineUsers.length > 0 ? "active" : ""}`} />
            <Wifi size={14} />
            <span>{onlineUsers.length > 0 ? `${onlineUsers.length} active` : "Live Sync"}</span>
          </span>

          {active.role === "owner" && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                document.getElementById("share-email")?.focus()
              }
            >
              <Share2 size={16} />
              Share
            </button>
          )}

          <button
            type="button"
            className="icon-button"
            aria-label="Sign out"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </header>

        <div className="editor-layout">
          <section className="document-area">
            <Editor
              key={active.id}
              document={active}
              token={token}
              user={user}
              onSave={saveContent}
              onPresenceChange={setOnlineUsers}
            />
          </section>

          <aside className="share-panel">
            <div className="panel-heading">
              <Users size={18} />
              <h3>Collaborators</h3>
              <span className={`panel-presence-pill ${onlineUsers.length > 0 ? "active" : ""}`}>
                <span className="live-dot" />
                {onlineUsers.length} online
              </span>
            </div>

            <p className="muted small">
              Owner and invited users can access this document.
              Sharing requires the recipient to have an account.
            </p>

            {active.role === "owner" ? (
              <form
                onSubmit={shareDocument}
                className="share-form"
              >
                <label>
                  Email address
                  <input
                    id="share-email"
                    type="email"
                    required
                    value={shareEmail}
                    onChange={(event) =>
                      setShareEmail(event.target.value)
                    }
                    placeholder="teammate@example.com"
                  />
                </label>

                <label>
                  Permission
                  <select
                    value={shareRole}
                    onChange={(event) =>
                      setShareRole(event.target.value)
                    }
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                </label>

                <button className="primary full">
                  <Share2 size={15} />
                  Invite collaborator
                </button>
              </form>
            ) : (
              <p className="small">
                Your role: <strong>{active.role}</strong>
              </p>
            )}

            <div className="collaborator-section">
              <div className="section-subheading">
                <span>In this document</span>
              </div>

              {/* Current user */}
              {(() => {
                const isOnline = onlineUsers.some((u) => u.isSelf);
                const myColor =
                  onlineUsers.find((u) => u.isSelf)?.color ||
                  getUserColor(user.id || user._id || user.email);

                return (
                  <div className="owner-chip is-current-user">
                    <span
                      className="avatar"
                      style={{
                        backgroundColor: myColor,
                        color: "#fff",
                        boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${myColor}40`,
                      }}
                    >
                      {user.name?.slice(0, 1).toUpperCase() || "U"}
                    </span>

                    <span className="owner-chip-details">
                      <div className="owner-chip-name-row">
                        <strong>{user.name}</strong>
                        <span className="self-tag">You</span>
                      </div>
                      <small>
                        {user.email} · {active.role}
                      </small>
                    </span>

                    <div className="chip-presence-tag">
                      <span
                        className="cursor-color-indicator"
                        style={{ backgroundColor: myColor }}
                        title="Your live cursor color"
                      />
                      <span className="status-label active">
                        <span className="status-dot green" />
                        Active
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Owner (if not current user) */}
              {active.owner && active.owner.id !== user.id && (() => {
                const isOnline = onlineUsers.some(
                  (u) =>
                    u.id === String(active.owner.id) ||
                    (u.email && u.email.toLowerCase() === active.owner.email?.toLowerCase())
                );
                const ownerColor =
                  onlineUsers.find(
                    (u) =>
                      u.id === String(active.owner.id) ||
                      (u.email && u.email.toLowerCase() === active.owner.email?.toLowerCase())
                  )?.color || getUserColor(active.owner.id || active.owner.email);

                return (
                  <div className="owner-chip">
                    <span
                      className="avatar"
                      style={{
                        backgroundColor: isOnline ? ownerColor : "#ececff",
                        color: isOnline ? "#fff" : "#5555c8",
                        boxShadow: isOnline
                          ? `0 0 0 2px #fff, 0 0 0 4px ${ownerColor}40`
                          : "none",
                      }}
                    >
                      {active.owner.name?.slice(0, 1).toUpperCase() || "O"}
                    </span>
                    <span className="owner-chip-details">
                      <strong>{active.owner.name}</strong>
                      <small>
                        {active.owner.email} · Owner
                      </small>
                    </span>
                    <div className="chip-presence-tag">
                      {isOnline ? (
                        <>
                          <span
                            className="cursor-color-indicator"
                            style={{ backgroundColor: ownerColor }}
                            title="Cursor color"
                          />
                          <span className="status-label active">
                            <span className="status-dot green" />
                            Online
                          </span>
                        </>
                      ) : (
                        <span className="status-label offline">
                          <span className="status-dot gray" />
                          Offline
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Collaborators list */}
              {Array.isArray(active.collaborators) &&
                active.collaborators
                  .filter(
                    (c) =>
                      c.userId !== user.id &&
                      (!active.owner || c.userId !== active.owner.id)
                  )
                  .map((c) => {
                    const isOnline = onlineUsers.some(
                      (u) =>
                        u.id === String(c.userId) ||
                        (c.email && u.email && u.email.toLowerCase() === c.email.toLowerCase())
                    );
                    const collabColor =
                      onlineUsers.find(
                        (u) =>
                          u.id === String(c.userId) ||
                          (c.email && u.email && u.email.toLowerCase() === c.email.toLowerCase())
                      )?.color || getUserColor(c.userId || c.email || c.name);

                    return (
                      <div className="owner-chip" key={c.userId}>
                        <span
                          className="avatar"
                          style={{
                            backgroundColor: isOnline ? collabColor : "#ececff",
                            color: isOnline ? "#fff" : "#5555c8",
                            boxShadow: isOnline
                              ? `0 0 0 2px #fff, 0 0 0 4px ${collabColor}40`
                              : "none",
                          }}
                        >
                          {(c.name || c.email || "C")
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>
                        <span className="owner-chip-details">
                          <strong>{c.name || c.email}</strong>
                          <small>
                            {c.email ? `${c.email} · ` : ""}
                            {c.role}
                          </small>
                        </span>
                        <div className="chip-presence-tag">
                          {isOnline ? (
                            <>
                              <span
                                className="cursor-color-indicator"
                                style={{ backgroundColor: collabColor }}
                                title="Collaborator cursor color"
                              />
                              <span className="status-label active">
                                <span className="status-dot green" />
                                Online
                              </span>
                            </>
                          ) : (
                            <span className="status-label offline">
                              <span className="status-dot gray" />
                              Offline
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
            </div>

            <div className="sync-note">
              <Wifi size={15} />
              Real-time collaboration active · CRDT synchronization enabled.
            </div>
          </aside>
        </div>

        {message && (
          <div className="toast" role="status">
            {message}
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand" role="banner">
          <span className="brand-icon">C</span>
          CollabSpace
        </div>

        <div className="user-menu">
          <span className="avatar">
            {user.name?.slice(0, 1).toUpperCase() || "U"}
          </span>

          <span>{user.name}</span>

          <button
            type="button"
            className="icon-button"
            aria-label="Sign out"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Good ideas start here.</h1>
            <p className="muted">
              Create a document and bring your thoughts together.
            </p>
          </div>

          <button
            type="button"
            className="primary"
            onClick={createDocument}
          >
            <Plus size={18} />
            New document
          </button>
        </div>

        <div className="section-heading">
          <h2>Your documents</h2>
          <span>
            {documents.length} document
            {documents.length === 1 ? "" : "s"}
          </span>
        </div>

        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}

        {documents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <FileText size={28} />
            </div>

            <h3>Your workspace is ready</h3>
            <p>Create your first document to get started.</p>

            <button
              type="button"
              className="primary"
              onClick={createDocument}
            >
              <Plus size={17} />
              Create document
            </button>
          </div>
        ) : (
          <div className="document-grid">
            {documents.map((doc) => (
              <article className="document-card" key={doc.id}>
                <button
                  type="button"
                  className="document-open"
                  onClick={() => openDocument(doc)}
                >
                  <span className="doc-icon">
                    <FileText size={22} />
                  </span>

                  <strong>{doc.title}</strong>

                  <small>
                    Updated{" "}
                    {doc.updatedAt
                      ? new Date(doc.updatedAt).toLocaleString()
                      : "Recently"}
                  </small>
                </button>

                <div className="document-card-footer">
                  <span>
                    {doc.role === "owner" ? "Owner" : doc.role}
                  </span>

                  {doc.role === "owner" && (
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`Delete ${doc.title}`}
                      onClick={() => deleteDocument(doc)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="dashboard-footer">
          <span>
            <span
              className={
                health === "Connected" ? "dot online" : "dot"
              }
            />
            API {health}
          </span>

          <span>CollabSpace · Collaborative editor</span>
        </footer>
      </section>
    </main>
  );
}
