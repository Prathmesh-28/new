import { useState } from "react";
import { Globe, Check } from "lucide-react";
import { useI18n } from "@/i18n";

// Language picker for the in-house i18n (#169). Reachable pre-auth (login) and in-app
// (sidebar). `compact` shows just the language code (for tight spaces).
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, locales, t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = locales.find((l) => l.code === locale) || locales[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t("common.language")}
        aria-label={t("common.language")}
        className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 transition-colors"
      >
        <Globe size={13} className="shrink-0" />
        <span>{compact ? current.code.toUpperCase() : current.native}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden min-w-[10rem]">
            {locales.map((l) => (
              <button
                key={l.code}
                onClick={() => { setLocale(l.code); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
              >
                <span className="w-3.5 shrink-0">{l.code === locale && <Check size={12} className="text-[var(--color-primary)]" />}</span>
                <span className="flex-1">{l.native}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{l.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
