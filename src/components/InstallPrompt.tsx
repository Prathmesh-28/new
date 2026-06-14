import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, Share, X } from "lucide-react";
import { LogoMark } from "@/components/Logo";

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }>; }

const DISMISS_KEY = "hr_install_dismissed";

/* Discreet "install this app" banner. Android/desktop Chrome → real install prompt;
   iOS Safari → Add-to-Home-Screen hint. Hidden inside the native shell, when already
   installed (standalone), or after the user dismisses it. */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;                       // already the native app
    if (localStorage.getItem(DISMISS_KEY)) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;                                          // already installed

    const ua = navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua); // Safari only
    if (isIOS) { setIos(true); setShow(true); return; }

    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); setShow(true); };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setShow(false); };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null); setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9999, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{
        pointerEvents: "auto", display: "flex", alignItems: "center", gap: 12,
        maxWidth: 460, width: "100%", background: "#161B22", color: "#FDFAF0",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 14px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
      }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "#fff", display: "grid", placeItems: "center", flexShrink: 0, color: "#1E2A4E" }}>
          <LogoMark size={26} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>Install Headroom</div>
          <div style={{ fontSize: 12, color: "rgba(253,250,240,0.6)", marginTop: 2 }}>
            {ios
              ? <>Tap <Share size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> Share, then <strong>Add to Home Screen</strong>.</>
              : "Get the full-screen app on your home screen — free, no app store."}
          </div>
        </div>
        {!ios && (
          <button onClick={install} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, background: "#5FBE7C", color: "#0D1117", fontWeight: 700, fontSize: 13, border: "none", borderRadius: 9, padding: "9px 14px", cursor: "pointer" }}>
            <Download size={14} /> Install
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" style={{ flexShrink: 0, background: "none", border: "none", color: "rgba(253,250,240,0.5)", cursor: "pointer", padding: 4 }}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
