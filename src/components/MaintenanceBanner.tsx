import { usePlatformSettings } from "@/lib/usePlatformSettings";

// Site-wide maintenance notice the super-admin toggles (/admin → Platform →
// Maintenance mode). Off by default → renders nothing. Updates in real time when
// the super-admin saves (usePlatformSettings refetches on the broadcast).
export default function MaintenanceBanner() {
  const { maintenance } = usePlatformSettings();
  if (!maintenance?.enabled) return null;
  return (
    <div
      role="status"
      style={{ background: "#7c2d12", color: "#fff", textAlign: "center", padding: "9px 16px", fontSize: 13, lineHeight: 1.4, fontWeight: 600 }}
    >
      🛠 {maintenance.message || "Scheduled maintenance is in progress — some features may be temporarily unavailable."}
    </div>
  );
}
