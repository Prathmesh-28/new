import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Network } from "@capacitor/network";
import { App as CapApp } from "@capacitor/app";

// True only inside the iOS/Android Capacitor shell. Every helper below no-ops or
// falls back to a web equivalent off-device, so the same bundle runs everywhere.
export const isNative = () => Capacitor.isNativePlatform();

// ── Haptic feedback ─────────────────────────────────────────────────────────
type Haptic = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "select";
export async function haptic(kind: Haptic = "light"): Promise<void> {
  if (!isNative()) return;
  try {
    if (kind === "success") return await Haptics.notification({ type: NotificationType.Success });
    if (kind === "warning") return await Haptics.notification({ type: NotificationType.Warning });
    if (kind === "error")   return await Haptics.notification({ type: NotificationType.Error });
    if (kind === "select")  { await Haptics.selectionStart(); await Haptics.selectionEnd(); return; }
    const style = kind === "heavy" ? ImpactStyle.Heavy : kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch { /* haptics unavailable — ignore */ }
}

// ── Connectivity ────────────────────────────────────────────────────────────
// Subscribe to online/offline. Returns an unsubscribe fn. Works on web too.
export function onNetworkChange(cb: (online: boolean) => void): () => void {
  if (isNative()) {
    let remove = () => {};
    Network.addListener("networkStatusChange", s => cb(s.connected)).then(h => { remove = () => h.remove(); });
    Network.getStatus().then(s => cb(s.connected)).catch(() => {});
    return () => remove();
  }
  const on = () => cb(true), off = () => cb(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  cb(navigator.onLine);
  return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
}

// ── App lifecycle ───────────────────────────────────────────────────────────
// Fire when the app returns to the foreground (native resume; tab re-focus on
// web) so we can refresh plan/entitlements that may have changed while away.
export function onAppResume(cb: () => void): () => void {
  if (isNative()) {
    let remove = () => {};
    CapApp.addListener("resume", () => cb()).then(h => { remove = () => h.remove(); });
    return () => remove();
  }
  const h = () => { if (document.visibilityState === "visible") cb(); };
  document.addEventListener("visibilitychange", h);
  return () => document.removeEventListener("visibilitychange", h);
}
