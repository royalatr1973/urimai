import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The web app calls ONLY its own backend (/api/*). In dev, Vite proxies /api to the
// Fastify server; the browser never talks to api.anthropic.com directly.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Urimai — உரிமை",
        short_name: "உரிமை",
        description: "உங்களுக்கு உரிய அரசு திட்டங்களை அறியுங்கள்.",
        lang: "ta",
        theme_color: "#2F7D4F",
        background_color: "#F4F1EA",
        display: "standalone",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
