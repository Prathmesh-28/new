import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the Headroom native iOS + Android apps.
 *
 * The native shell loads the production web bundle from `dist/` (built with
 * `npm run build`). To develop against a live dev server instead, set
 * CAP_SERVER_URL to your machine's LAN address (e.g. http://192.168.1.5:5173)
 * and run `npm run dev` — the apps will hot-reload from your laptop.
 */
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "in.headroom.app",
  appName: "Headroom",
  webDir: "dist",
  // Allow http/local during dev live-reload; harmless for the bundled build.
  server: devServerUrl
    ? { url: devServerUrl, cleartext: true }
    : { androidScheme: "https" },
  backgroundColor: "#101830",
  ios: {
    contentInset: "always",
    backgroundColor: "#101830",
    // Force the phone (device-width) layout — otherwise WKWebView can lay the
    // page out at a desktop width, breaking responsive breakpoints / overflowing.
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#101830",
  },
  plugins: {
    // Route fetch/XHR through native networking on device so requests to the
    // backend aren't blocked by WebView CORS (auth is bearer-token based).
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#101830",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      // Dark UI background → light (white) status-bar text/icons.
      style: "DARK",
      backgroundColor: "#101830",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
