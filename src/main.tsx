import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "./index.css";
import App from "./App";
import { initNative } from "@/lib/native";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Initialise native shell behaviour (status bar, splash, back button).
// No-ops in the browser, so web/Vercel builds are unaffected.
initNative();

// Register the PWA service worker so the web app is installable ("Add to Home
// Screen") + works offline. Only in the browser (not the native shell), prod only.
if ("serviceWorker" in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
