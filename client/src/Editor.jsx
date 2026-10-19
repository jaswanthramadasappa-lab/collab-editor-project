import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  Code,
  Quote,
  Users,
  Wifi,
  WifiOff,
  Eye,
  RefreshCw,
  ChevronDown,
  Sparkles,
} from "lucide-react";

import { getUserColor } from "./collabColors.js";

export default function Editor({
  document,
  token,
  user,
  onSave,
  onPresenceChange,
}) {
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [notification, setNotification] = useState(null);
  const [showUsersFlyout, setShowUsersFlyout] = useState(false);
  const flyoutRef = useRef(null);

  const documentId = document.id ?? document._id;
  const isViewer = document.role === "viewer";

  // Deterministic user identity for cursor and presence awareness
  const cursorUser = useMemo(
    () => ({
      id: user?.id || user?._id || user?.email,
      name: user?.name || user?.email || "Anonymous",
      email: user?.email,
      color: getUserColor(user?.id || user?._id || user?.email || user?.name || "User"),
      role: document.role || (document.owner?.id === user?.id ? "owner" : "editor"),
    }),
    [user, document.role, document.owner]
  );

  // Yjs document instance
  const ydoc = useMemo(() => new Y.Doc(), []);

  // WebSocket Collaboration Provider
  const collabUrl =
    import.meta.env.VITE_COLLAB_URL || "ws://localhost:1234";

  const provider = useMemo(
    () =>
      new HocuspocusProvider({
        url: collabUrl,
        name: String(documentId),
        document: ydoc,
        token,
      }),
    [collabUrl, documentId, token, ydoc]
  );

  // Debounced save timer ref
  const saveTimerRef = useRef(null);

  // TipTap editor configuration with Yjs collaboration extensions
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false, // History is managed collaboratively by Yjs
        }),
        Collaboration.configure({
          document: ydoc,
          field: "default",
        }),
        CollaborationCursor.configure({
          provider,
          user: cursorUser,
        }),
      ],
      editable: !isViewer,
      editorProps: {
        attributes: {
          class: "collab-editor-content",
          spellcheck: "true",
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (isViewer || !onSave) return;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
          const text = ed.getText();
          onSave(documentId, text).catch(() => {});
        }, 1500);
      },
    },
    [ydoc, provider, cursorUser, isViewer, onSave, documentId]
  );

  // Close flyout on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (flyoutRef.current && !flyoutRef.current.contains(event.target)) {
        setShowUsersFlyout(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Presence and Awareness tracking
  useEffect(() => {
    let initialSyncDone = false;
    let previousMap = new Map();

    const triggerToast = (text, color, type = "join") => {
      const id = Date.now();
      setNotification({ text, color, type, id });
      setTimeout(() => {
        setNotification((current) => (current?.id === id ? null : current));
      }, 3500);
    };

    const updateConnection = ({ status } = {}) => {
      const currentStatus = status || provider.status || "connecting";
      setConnectionStatus(currentStatus);
    };

    const updateUsers = () => {
      const states = provider.awareness?.getStates();

      if (!states) {
        setOnlineUsers([]);
        onPresenceChange?.([]);
        return;
      }

      const usersMap = new Map();

      states.forEach((state, clientId) => {
        const current = state.user;
        if (current?.name) {
          const uid = String(current.id || current.email || current.name);
          const isCurrent =
            uid === String(user?.id || user?._id || user?.email);

          if (!usersMap.has(uid)) {
            usersMap.set(uid, {
              clientId,
              id: uid,
              name: current.name,
              email: current.email,
              color:
                current.color ||
                getUserColor(current.id || current.email || current.name),
              role: current.role || "collaborator",
              isSelf: isCurrent,
            });
          }
        }
      });

      // Sort users with "You" first, then alphabetically
      const usersList = [...usersMap.values()].sort((a, b) => {
        if (a.isSelf) return -1;
        if (b.isSelf) return 1;
        return a.name.localeCompare(b.name);
      });

      setOnlineUsers(usersList);
      onPresenceChange?.(usersList);

      // Join / leave activity announcements
      if (initialSyncDone) {
        // Detect new arrivals
        usersList.forEach((u) => {
          if (!u.isSelf && !previousMap.has(u.id)) {
            triggerToast(`${u.name} joined the document`, u.color, "join");
          }
        });

        // Detect departures
        previousMap.forEach((prevUser, prevId) => {
          if (!usersMap.has(prevId) && !prevUser.isSelf) {
            triggerToast(`${prevUser.name} left the document`, prevUser.color, "leave");
          }
        });
      } else if (usersList.length > 0) {
        initialSyncDone = true;
      }

      previousMap = usersMap;
    };

    const handleConnect = () => setConnectionStatus("connected");
    const handleAuthenticated = () => setConnectionStatus("connected");
    const handleSynced = () => {
      setConnectionStatus("connected");
      updateUsers();
    };
    const handleDisconnect = () => setConnectionStatus("disconnected");
    const handleAuthFailed = (err) => {
      console.warn("Collab authentication rejected:", err);
      setConnectionStatus("disconnected");
    };

    provider.on("status", updateConnection);
    provider.on("connect", handleConnect);
    provider.on("authenticated", handleAuthenticated);
    provider.on("synced", handleSynced);
    provider.on("disconnect", handleDisconnect);
    provider.on("close", handleDisconnect);
    provider.on("authenticationFailed", handleAuthFailed);
    provider.awareness?.on("change", updateUsers);

    // Initial check if already connected
    if (provider.status === "connected" || provider.isSynced) {
      setConnectionStatus("connected");
    } else {
      updateConnection();
    }
    updateUsers();

    return () => {
      provider.off("status", updateConnection);
      provider.off("connect", handleConnect);
      provider.off("authenticated", handleAuthenticated);
      provider.off("synced", handleSynced);
      provider.off("disconnect", handleDisconnect);
      provider.off("close", handleDisconnect);
      provider.off("authenticationFailed", handleAuthFailed);
      provider.awareness?.off("change", updateUsers);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc, user, onPresenceChange]);

  if (!editor) {
    return (
      <div className="editor-loading">
        <RefreshCw size={24} className="spin-icon" />
        <p>Connecting to real-time collaboration server...</p>
      </div>
    );
  }

  const toggle = (command) => {
    if (isViewer) return;
    command(editor.chain().focus()).run();
  };

  const connected = connectionStatus === "connected";
  const reconnect = () => {
    if (provider) {
      provider.connect();
    }
  };

  return (
    <div className="editor-card">
      {/* Real-Time Live Presence Bar */}
      <div className="collab-presence">
        {/* Left: Connection Status Indicator */}
        <div className="presence-left">
          <span
            className={`presence-status-pill ${
              connected
                ? "online"
                : connectionStatus === "connecting"
                  ? "connecting"
                  : "offline"
            }`}
            title={`WebSocket status: ${connectionStatus}`}
          >
            <span className="live-indicator-dot" />
            {connected ? (
              <>
                <Wifi size={14} />
                <span>Live sync</span>
              </>
            ) : connectionStatus === "connecting" ? (
              <>
                <RefreshCw size={13} className="spin-icon" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <WifiOff size={13} />
                <span>Disconnected</span>
                <button
                  type="button"
                  className="retry-pill-btn"
                  onClick={reconnect}
                  title="Reconnect to server"
                >
                  Retry
                </button>
              </>
            )}
          </span>

          {/* Current user cursor color preview */}
          <div
            className="my-cursor-tag"
            title="Your cursor color visible to other collaborators"
          >
            <span
              className="cursor-color-preview-box"
              style={{ backgroundColor: cursorUser.color }}
            />
            <span className="my-cursor-label">Your cursor</span>
          </div>
        </div>

        {/* Right: Active Collaborator Avatars & Presence Count */}
        <div className="presence-right" ref={flyoutRef}>
          <div className="presence-avatar-stack">
            {onlineUsers.slice(0, 5).map((person) => (
              <div
                key={person.id}
                className={`presence-avatar-wrapper ${
                  person.isSelf ? "is-self" : ""
                }`}
                title={`${person.name} (${person.email || "User"})${
                  person.isSelf ? " — You" : ""
                } · ${person.role}`}
              >
                <span
                  className="presence-avatar"
                  style={{
                    backgroundColor: person.color,
                    borderColor: person.color,
                  }}
                >
                  {person.name.slice(0, 1).toUpperCase()}
                </span>
                <span
                  className="presence-online-badge"
                  style={{ backgroundColor: person.color }}
                />
              </div>
            ))}

            {onlineUsers.length > 5 && (
              <span className="presence-overflow-avatar">
                +{onlineUsers.length - 5}
              </span>
            )}
          </div>

          <button
            type="button"
            className="presence-count-btn"
            onClick={() => setShowUsersFlyout((prev) => !prev)}
            aria-expanded={showUsersFlyout}
            aria-label="Toggle active collaborators list"
          >
            <Users size={14} />
            <span>
              {onlineUsers.length}{" "}
              {onlineUsers.length === 1 ? "collaborator" : "collaborators"}
            </span>
            <ChevronDown
              size={13}
              className={`flyout-chevron ${showUsersFlyout ? "open" : ""}`}
            />
          </button>

          {/* Active Collaborators Dropdown Popover */}
          {showUsersFlyout && (
            <div className="collaborators-popover">
              <div className="popover-header">
                <strong>Active Collaborators</strong>
                <span className="popover-count-pill">
                  {onlineUsers.length} in document
                </span>
              </div>

              <div className="popover-user-list">
                {onlineUsers.map((person) => (
                  <div key={person.id} className="popover-user-row">
                    <span
                      className="popover-avatar"
                      style={{ backgroundColor: person.color }}
                    >
                      {person.name.slice(0, 1).toUpperCase()}
                    </span>

                    <div className="popover-user-info">
                      <div className="popover-user-name">
                        <strong>{person.name}</strong>
                        {person.isSelf && (
                          <span className="self-badge">You</span>
                        )}
                      </div>
                      <small className="popover-user-email">
                        {person.email || "User"}
                      </small>
                    </div>

                    <div className="popover-user-meta">
                      <span
                        className="cursor-swatch-dot"
                        style={{ backgroundColor: person.color }}
                        title={`Cursor color: ${person.color}`}
                      />
                      <span className="role-tag">{person.role}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="popover-footer">
                <Sparkles size={13} />
                <span>Real-time live collaboration enabled</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Activity Notification Toast */}
      {notification && (
        <div
          className={`collab-activity-toast ${notification.type}`}
          role="status"
          aria-live="polite"
        >
          <span
            className="toast-color-dot"
            style={{ backgroundColor: notification.color }}
          />
          <span>{notification.text}</span>
        </div>
      )}

      {/* Viewer Mode Banner */}
      {isViewer && (
        <div className="viewer-mode-banner">
          <Eye size={16} />
          <span>
            <strong>View-only mode:</strong> You can view edits and live cursors
            in real time, but document changes are disabled.
          </span>
        </div>
      )}

      {/* Formatting Toolbar */}
      <div className="toolbar">
        <button
          type="button"
          aria-label="Bold"
          title="Bold (Ctrl+B)"
          className={editor.isActive("bold") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleBold())}
          disabled={isViewer}
        >
          <Bold size={16} />
        </button>

        <button
          type="button"
          aria-label="Italic"
          title="Italic (Ctrl+I)"
          className={editor.isActive("italic") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleItalic())}
          disabled={isViewer}
        >
          <Italic size={16} />
        </button>

        <button
          type="button"
          aria-label="Strikethrough"
          title="Strikethrough"
          className={editor.isActive("strike") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleStrike())}
          disabled={isViewer}
        >
          <Strikethrough size={16} />
        </button>

        <span className="tool-divider" />

        <button
          type="button"
          aria-label="Heading 2"
          title="Heading 2"
          className={
            editor.isActive("heading", { level: 2 }) ? "tool active" : "tool"
          }
          onClick={() =>
            toggle((chain) => chain.toggleHeading({ level: 2 }))
          }
          disabled={isViewer}
        >
          <Heading2 size={16} />
        </button>

        <button
          type="button"
          aria-label="Bullet list"
          title="Bullet list"
          className={editor.isActive("bulletList") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleBulletList())}
          disabled={isViewer}
        >
          <List size={16} />
        </button>

        <button
          type="button"
          aria-label="Numbered list"
          title="Numbered list"
          className={editor.isActive("orderedList") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleOrderedList())}
          disabled={isViewer}
        >
          <ListOrdered size={16} />
        </button>

        <span className="tool-divider" />

        <button
          type="button"
          aria-label="Blockquote"
          title="Blockquote"
          className={editor.isActive("blockquote") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleBlockquote())}
          disabled={isViewer}
        >
          <Quote size={16} />
        </button>

        <button
          type="button"
          aria-label="Code block"
          title="Code block"
          className={editor.isActive("codeBlock") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleCodeBlock())}
          disabled={isViewer}
        >
          <Code size={16} />
        </button>
      </div>

      {/* Editor ProseMirror Content */}
      <EditorContent editor={editor} className="tiptap-content" />

      {/* Footer hint */}
      <p className="editor-hint">
        {isViewer
          ? "Read-only access — edits cannot be made by viewers."
          : connected
            ? "Real-time collaborative editing active · All changes sync instantly via Yjs CRDTs."
            : "Connecting to collaboration server..."}
      </p>
    </div>
  );
}
