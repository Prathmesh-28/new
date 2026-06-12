import { Capacitor } from "@capacitor/core";

/**
 * Production backend origin. On the web this is reached through the Vercel
 * rewrites (`/api/*` and `/auth/*` → this host), so the browser uses
 * same-origin requests. Inside the native shell there is no proxy, so we hit
 * the backend directly.
 */
const NATIVE_API_BASE = "https://headroom-backend.onrender.com";

/**
 * The origin prepended to every API path.
 *
 * - Web/Vercel: `VITE_API_URL` if set, otherwise "" (same-origin + rewrites).
 *   Behaviour is unchanged from before this file existed.
 * - Native (iOS/Android): `VITE_API_URL` if provided at build time, otherwise
 *   the production backend — the Capacitor WebView loads from
 *   capacitor://localhost, so relative paths have no backend to resolve to.
 *
 * CORS is sidestepped on native by `CapacitorHttp` (enabled in
 * capacitor.config.ts), which routes fetch/XHR through native networking.
 *
 * A `localhost` URL is ignored on native: it points at the device itself, not
 * the dev machine, so it can never resolve. Point `VITE_API_URL` at your LAN IP
 * (e.g. http://192.168.1.5:4000) for on-device development against a laptop.
 */
const envApiUrl = import.meta.env.VITE_API_URL;
const isLocalUrl = (url: string | undefined): boolean =>
  !!url && /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/.test(url);

export const API_BASE: string = Capacitor.isNativePlatform()
  ? isLocalUrl(envApiUrl)
    ? NATIVE_API_BASE
    : envApiUrl || NATIVE_API_BASE
  : envApiUrl ?? "";
