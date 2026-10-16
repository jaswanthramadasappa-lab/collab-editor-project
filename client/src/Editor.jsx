import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2, Code, Save, Eye } from "lucide-react";

export default function Editor({ document, onSave }) {
  const isViewer = document.role === "viewer";
  const [saveState, setSaveState] = useState(isViewer ? "Read-only" : "Saved");
  const saveTimerRef = useRef(null);
  const initial = useRef(document.content || "");

  const editor = useEditor({
    extensions: [StarterKit],
    content: initial.current,
    editable: !isViewer,
    onUpdate: ({ editor: currentEditor }) => {
      if (isViewer) return;
      setSaveState("Unsaved changes");
      const html = currentEditor.isEmpty ? "" : currentEditor.getHTML();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveState("Saving...");
        try {
          if (onSave) {
            await onSave(document.id, html);
          }
          setSaveState("Saved");
        } catch {
          setSaveState("Error saving");
        }
      }, 700);
    }
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) return <p>Loading editor...</p>;

  const toggle = (command) => {
    if (isViewer) return;
    command(editor.chain().focus()).run();
  };

  return (
    <div className="editor-card">
      <div className="toolbar">
        <button
          type="button"
          aria-label="Bold"
          disabled={isViewer}
          className={editor.isActive("bold") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleBold())}
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          aria-label="Italic"
          disabled={isViewer}
          className={editor.isActive("italic") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleItalic())}
        >
          <Italic size={17} />
        </button>
        <span className="tool-divider" />
        <button
          type="button"
          aria-label="Heading"
          disabled={isViewer}
          className={editor.isActive("heading") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleHeading({ level: 2 }))}
        >
          <Heading2 size={17} />
        </button>
        <button
          type="button"
          aria-label="Bullet list"
          disabled={isViewer}
          className={editor.isActive("bulletList") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleBulletList())}
        >
          <List size={17} />
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          disabled={isViewer}
          className={editor.isActive("orderedList") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleOrderedList())}
        >
          <ListOrdered size={17} />
        </button>
        <button
          type="button"
          aria-label="Code block"
          disabled={isViewer}
          className={editor.isActive("codeBlock") ? "tool active" : "tool"}
          onClick={() => toggle((chain) => chain.toggleCodeBlock())}
        >
          <Code size={17} />
        </button>
        <span className="toolbar-spacer" />
        <span className="save-state">
          {isViewer ? <Eye size={14} /> : <Save size={14} />} {saveState}
        </span>
      </div>
      <EditorContent editor={editor} className="tiptap-content" />
      <p className="editor-hint">
        {isViewer ? "View-only mode · Changes cannot be made" : "Rich text editing · Autosaves after you pause typing"}
      </p>
    </div>
  );
}
