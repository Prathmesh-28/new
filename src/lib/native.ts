import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App as CapApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";

/**
 * One-time native initialisation for the iOS / Android shells.
 *
 * Safe to call on the web — it no-ops off-device, so the same bundle runs in
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
