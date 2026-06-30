import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { onNetworkChange } from "@/lib/mobile";

/* Real-time connectivity indicator - uses native Network events on device and
   the browser online/offline events on web. Hidden while connected. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => onNetworkChange(setOnline), []);
  if (online) return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-900/40 border-b border-amber-700/50 backdrop-blur px-4 py-1.5">
      <WifiOff size={13} className="text-amber-300" />
      <p className="text-xs text-amber-200">You're offline - showing the last synced data. Changes save when you reconnect.</p>
    </div>
  );
}
