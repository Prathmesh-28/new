import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
