import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("/react/") || id.includes("/react-dom/")) {
            return "react-vendor";
          }

          if (id.includes("@xyflow")) {
            return "flow-vendor";
          }

          if (id.includes("@tiptap/pm") || id.includes("prosemirror")) {
            return "prosemirror-vendor";
          }

          if (id.includes("@tiptap/core") || id.includes("@tiptap/react")) {
            return "tiptap-core-vendor";
          }

          if (id.includes("@tiptap")) {
            return "tiptap-extension-vendor";
          }

          if (id.includes("katex")) {
            return "math-vendor";
          }

          return "vendor";
        },
      },
    },
  },
});
