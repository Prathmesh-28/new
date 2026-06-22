import { usePlatformSettings } from "@/lib/usePlatformSettings";

// Site-wide announcement strip the super-admin controls (/admin → Platform).
// Off by default → renders nothing, so it never changes the design until enabled.
export default function AnnouncementBanner() {
  const { banner } = usePlatformSettings();
  if (!banner?.enabled || !banner?.text) return null;
  return (
    <div style={{ background: "#1a6b55", color: "#fff", textAlign: "center", padding: "9px 16px", fontSize: 13, lineHeight: 1.4 }}>
      <span>{banner.text}</span>
      {banner.linkUrl && (
        <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 10, color: "#fff", textDecoration: "underline", fontWeight: 600 }}>
          {banner.linkLabel || "Learn more"} →
        </a>
      )}
    </div>
  );
}
