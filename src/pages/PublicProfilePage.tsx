import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Building2, MapPin, Globe, Briefcase, BadgeCheck } from "lucide-react";

// Public company profile / digital business card (roadmap #166). No auth — fetches only the
// fields the owner chose to expose via /api/profile/p/:slug.
interface Profile { company_name: string; legal_name: string | null; city: string | null; state: string | null; industry: string | null; website: string | null; logo_url: string | null; about: string | null; gstin: string | null; slug: string }

export default function PublicProfilePage() {
  const { slug } = useParams();
  const [p, setP] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/profile/p/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { setP(d); setState("ok"); })
      .catch(() => setState("missing"));
  }, [slug]);

  if (state === "loading") return <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center text-sm text-[var(--color-muted)]">Loading…</div>;
  if (state === "missing" || !p) return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center text-center px-6">
      <Building2 size={32} className="text-[var(--color-muted)] opacity-40 mb-3" />
      <p className="text-sm text-[var(--color-muted)]">This company profile isn't available.</p>
    </div>
  );

  const loc = [p.city, p.state].filter(Boolean).join(", ");
  const site = p.website && !/^https?:\/\//.test(p.website) ? `https://${p.website}` : p.website;
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex items-start sm:items-center justify-center px-5 py-12">
      <div className="w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl overflow-hidden">
        <div className="h-20 bg-[var(--color-primary)]/10" />
        <div className="px-6 pb-6 -mt-10">
          <div className="w-20 h-20 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden">
            {p.logo_url ? <img src={p.logo_url} alt="" className="w-full h-full object-cover" /> : <Building2 size={30} className="text-[var(--color-primary)]" />}
          </div>
          <h1 className="text-xl font-bold mt-4">{p.company_name}</h1>
          {p.legal_name && p.legal_name !== p.company_name && <p className="text-sm text-[var(--color-muted)]">{p.legal_name}</p>}
          {p.about && <p className="text-sm text-[var(--color-muted)] mt-3 leading-relaxed">{p.about}</p>}
          <div className="mt-5 space-y-2.5 text-sm">
            {p.industry && <p className="flex items-center gap-2.5"><Briefcase size={15} className="text-[var(--color-muted)] shrink-0" /> {p.industry}</p>}
            {loc && <p className="flex items-center gap-2.5"><MapPin size={15} className="text-[var(--color-muted)] shrink-0" /> {loc}</p>}
            {site && <p className="flex items-center gap-2.5"><Globe size={15} className="text-[var(--color-muted)] shrink-0" /> <a href={site} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline break-all">{p.website}</a></p>}
            {p.gstin && <p className="flex items-center gap-2.5"><BadgeCheck size={15} className="text-green-400 shrink-0" /> <span className="font-mono text-xs">GSTIN {p.gstin}</span></p>}
          </div>
        </div>
        <div className="px-6 py-3 border-t border-[var(--color-border)] text-center">
          <p className="text-[11px] text-[var(--color-muted)]">Verified business on Headroom</p>
        </div>
      </div>
    </div>
  );
}
