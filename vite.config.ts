import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Backend uses Node's built-in test runner (node --test), not vitest.
    exclude: ["node_modules", "dist", "backend/**", "ios/**", "android/**"],
  },
});
