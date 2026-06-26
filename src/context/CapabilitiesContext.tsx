import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

/** Which integrations are live (real rail wired) vs. preview (sample data). */
export interface Capabilities {
  payments: boolean;
  ai: boolean;
  aiFallback: boolean;
  whatsapp: boolean;
  push: boolean;
  email: boolean;
  bankSync: boolean;
  creditDisbursement: boolean;
  bnplPayout: boolean;
  ewaPayout: boolean;
  gstEInvoice: boolean;
  kyc: boolean;
  lenderMarketplace: boolean;
  supplierMarketplace: boolean;
  treasurySweep: boolean;
}

export type CapabilityKey = keyof Capabilities;

// All-false default: until the map loads we treat everything as "not yet
// confirmed live", and PreviewBadge only renders once `loaded` is true — so a
// live feature never flashes a Preview badge on first paint.
const DEFAULTS: Capabilities = {
  payments: false, ai: false, aiFallback: false, whatsapp: false, push: false, email: false,
  bankSync: false, creditDisbursement: false, bnplPayout: false, ewaPayout: false,
  gstEInvoice: false, kyc: false,
  lenderMarketplace: false, supplierMarketplace: false, treasurySweep: false,
};

const Ctx = createContext<{ caps: Capabilities; loaded: boolean }>({ caps: DEFAULTS, loaded: false });

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<Capabilities>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api.get<Capabilities>("/api/capabilities")
      .then((c) => setCaps({ ...DEFAULTS, ...c }))
      .catch(() => { /* offline / backend cold-start: stay on defaults */ })
      .finally(() => setLoaded(true));
  }, []);
  return <Ctx.Provider value={{ caps, loaded }}>{children}</Ctx.Provider>;
}

export function useCapabilities() {
  return useContext(Ctx);
}
