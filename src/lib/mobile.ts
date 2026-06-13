import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
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

// ── External links / payment pages ──────────────────────────────────────────
// On native, open inside an in-app browser (the user stays in the app and
// returns on close); on web, a new tab. onClose fires when the in-app browser
// is dismissed — used to refresh state after a Stripe Checkout.
export async function openUrl(url: string, onClose?: () => void): Promise<void> {
  if (!isNative()) { window.open(url, "_blank", "noopener"); return; }
  try {
    if (onClose) {
      const handle = await Browser.addListener("browserFinished", () => {
        handle.remove();
        onClose();
      });
    }
    await Browser.open({ url, presentationStyle: "popover" });
  } catch {
    window.location.href = url;
  }
}

// Full-page redirect on web (Stripe Checkout); in-app browser on native.
export async function openCheckout(url: string, onClose?: () => void): Promise<void> {
  if (!isNative()) { window.location.href = url; return; }
  await openUrl(url, onClose);
}

// ── Native share sheet ──────────────────────────────────────────────────────
export async function shareContent(opts: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<"shared" | "copied" | "unsupported"> {
  if (isNative()) {
    try { await Share.share(opts); return "shared"; } catch { return "unsupported"; }
  }
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try { await nav.share({ title: opts.title, text: opts.text, url: opts.url }); return "shared"; }
    catch { /* user cancelled or unsupported — fall through to clipboard */ }
  }
  const text = [opts.text, opts.url].filter(Boolean).join(" ");
  try { await navigator.clipboard.writeText(text); return "copied"; } catch { return "unsupported"; }
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
