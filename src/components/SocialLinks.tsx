import { useState, useEffect } from "react";
import { Linkedin, Instagram, Twitter, Youtube, Facebook, type LucideIcon } from "lucide-react";
import { API_BASE } from "@/lib/apiBase";

// Social icons hyperlinked to the company's pages. URLs come from the platform
// settings the super-admin manages (/admin → Platform → Social links), fetched from
// the PUBLIC /api/platform/social endpoint so they render on the logged-out footer.
// Only links that have a URL are shown.

type Social = Partial<Record<"linkedin" | "instagram" | "twitter" | "youtube" | "facebook", string>>;

const ORDER: (keyof Social)[] = ["linkedin", "instagram", "twitter", "youtube", "facebook"];
const ICONS: Record<keyof Social, LucideIcon> = { linkedin: Linkedin, instagram: Instagram, twitter: Twitter, youtube: Youtube, facebook: Facebook };
const LABELS: Record<keyof Social, string> = { linkedin: "LinkedIn", instagram: "Instagram", twitter: "X / Twitter", youtube: "YouTube", facebook: "Facebook" };

export default function SocialLinks({ size = 18, color, hoverColor, gap = 14 }: { size?: number; color?: string; hoverColor?: string; gap?: number }) {
  const [links, setLinks] = useState<Social>({});
  useEffect(() => {
    let on = true;
    fetch(`${API_BASE}/api/platform/social`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (on && d) setLinks(d); })
      .catch(() => { /* footer just shows nothing if unreachable */ });
    return () => { on = false; };
  }, []);

  const shown = ORDER.filter(k => links[k]);
  if (shown.length === 0) return null;

  return (
    <div style={{ display: "flex", gap }}>
      {shown.map(k => {
        const Icon = ICONS[k];
        return (
          <a key={k} href={links[k]} target="_blank" rel="noopener noreferrer" aria-label={LABELS[k]} title={LABELS[k]}
            style={{ color: color || "currentColor", display: "inline-flex", transition: "color .15s, opacity .15s", opacity: 0.85 }}
            onMouseOver={e => { e.currentTarget.style.opacity = "1"; if (hoverColor) e.currentTarget.style.color = hoverColor; }}
            onMouseOut={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.color = color || "currentColor"; }}>
            <Icon size={size} />
          </a>
        );
      })}
    </div>
  );
}
