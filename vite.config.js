import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("/firebase/") || id.includes("@firebase/")) {
            if (id.includes("/firestore/")) return "vendor-firebase-firestore";
            if (id.includes("/auth/")) return "vendor-firebase-auth";
            if (id.includes("/app/")) return "vendor-firebase-app";
            return "vendor-firebase";
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }

          if (id.includes("/lucide-react/")) return "vendor-lucide";
          if (id.includes("/gifenc/")) return "vendor-gifenc";
          return "vendor";
        },
      },
    },
  },
});
