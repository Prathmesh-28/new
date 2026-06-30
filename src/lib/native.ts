import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App as CapApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";

/**
 * One-time native initialisation for the iOS / Android shells.
 *
 * Safe to call on the web - it no-ops off-device, so the same bundle runs in
 * the browser, on Vercel, and inside the Capacitor WebView.
 */
export function initNative(): void {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform();

  // Tag <html> so safe-area CSS only applies inside the native shell.
  document.documentElement.classList.add("capacitor-native", `platform-${platform}`);

  // Dark app background → light (white) status-bar text/icons.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (platform === "android") {
    StatusBar.setBackgroundColor({ color: "#0D1117" }).catch(() => {});
  }

  // Drop the native splash once the web app has painted.
  SplashScreen.hide().catch(() => {});

  // Android hardware back button → router history, exit at the root.
  CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) {
      window.history.back();
    } else {
      CapApp.exitApp();
    }
  });

  // Hide the iOS keyboard accessory bar (no usable native form controls here).
  if (platform === "ios") {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  }
}

/**
 * Listen for deep links (headroom://… custom scheme + https app links) and hand
 * the in-app path to `navigate`. e.g. headroom://app/forecast → "/forecast".
 * No-ops on web. Returns an unsubscribe function.
 */
export function onDeepLink(navigate: (path: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handle = CapApp.addListener("appUrlOpen", ({ url }) => {
    const path = parseDeepLinkPath(url);
    if (path) navigate(path);
  });
  return () => { handle.then((h) => h.remove()).catch(() => {}); };
}

/** Extract an in-app route from a deep link URL, or null if it isn't one. */
export function parseDeepLinkPath(url: string): string | null {
  if (!url) return null;
  try {
    // Custom scheme: headroom://app/forecast  or  headroom://forecast
    if (url.startsWith("headroom://")) {
      const rest = url.slice("headroom://".length).replace(/^app\//, "");
      return "/" + rest.replace(/^\/+/, "");
    }
    // Universal/App link: https://headroom.app/forecast → /forecast
    const u = new URL(url);
    if (/(^|\.)headroom\.app$/.test(u.hostname) || u.hostname.endsWith("vercel.app")) {
      return u.pathname + u.search;
    }
  } catch { /* not a parseable URL */ }
  return null;
}
