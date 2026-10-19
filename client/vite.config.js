import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@tiptap") || id.includes("prosemirror")) {
              return "tiptap";
            }
            if (id.includes("yjs") || id.includes("@hocuspocus") || id.includes("y-")) {
              return "collab";
            }
            return "vendor";
          }
        },
      },
    },
  },
});
