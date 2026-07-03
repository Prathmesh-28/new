import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "@/lib/apiBase";
import { formatCurrency } from "@/lib/utils";
import { Loader2, ShieldCheck, TrendingUp } from "lucide-react";

// PUBLIC, token-gated credit passport — no login, no app shell. A lender opens the link the SMB
// shared. Served by GET /api/credit/passport/public/:token. Curated, verified figures only.
interface Factor { label: string; score: number }
interface Passport {
  headline?: string | null;
  business: { name: string; city?: string | null; state?: string | null; industry?: string | null; gstin_verified: boolean };
  generated_at: string; verified_by: string;
  score?: number; grade?: string; approved_limit?: number; decision?: string; recommended_product?: string; factors?: Factor[];
  financials?: { monthly_revenue: number | null; annual_turnover: number | null; gst_filings_on_time: number | null; business_vintage_months: number | null };
}
const GRADE_COLOR: Record<string, string> = { A: "#16a34a", B: "#65a30d", C: "#ca8a04", D: "#ea580c", E: "#dc2626" };

export default function PublicCreditPassportPage() {
  const { token = "" } = useParams();
  const [p, setP] = useState<Passport | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`${API_BASE}/api/credit/passport/public/${token}`)
      .then(r => r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "This link is invalid or has expired."))))
      .then(setP).catch(e => setErr(e.message));
  }, [token]);

  if (err) return <div style={{ minHeight: "100vh" }} className="flex items-center justify-center bg-[#0d1117] text-slate-300 p-6"><div className="text-center"><ShieldCheck size={28} className="mx-auto mb-3 text-slate-500" /><p className="text-sm">{err}</p></div></div>;
  if (!p) return <div style={{ minHeight: "100vh" }} className="flex items-center justify-center bg-[#0d1117] text-slate-400"><Loader2 className="animate-spin" /></div>;
  const gradeC = p.grade ? (GRADE_COLOR[p.grade] || "#64748b") : "#64748b";

  return (
    <div style={{ minHeight: "100vh" }} className="bg-[#0d1117] text-slate-200 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><ShieldCheck size={12} /> Verified Credit Passport</p>
              <h1 className="text-2xl font-bold text-white mt-1">{p.business.name}</h1>
              <p className="text-xs text-slate-400 mt-0.5">{[p.business.industry, p.business.city, p.business.state].filter(Boolean).join(" · ")}{p.business.gstin_verified && <span className="ml-2 text-emerald-400">● GSTIN verified</span>}</p>
            </div>
            {p.grade && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: gradeC + "22", color: gradeC, border: `2px solid ${gradeC}` }}>{p.grade}</div>
                {p.score != null && <p className="text-[11px] text-slate-500 mt-1">Score {p.score}/100</p>}
              </div>
            )}
          </div>
          {p.headline && <p className="text-sm text-slate-300 mt-3 italic">"{p.headline}"</p>}
        </div>

        {/* Eligibility */}
        {(p.approved_limit != null || p.decision) && (
          <div className="grid grid-cols-2 gap-4">
            {p.approved_limit != null && <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5"><p className="text-[11px] uppercase text-slate-500">Indicative eligible limit</p><p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(p.approved_limit)}</p></div>}
            {p.decision && <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5"><p className="text-[11px] uppercase text-slate-500">Recommendation</p><p className="text-lg font-semibold text-white mt-1 capitalize">{String(p.decision).replace(/_/g, " ")}</p>{p.recommended_product && <p className="text-xs text-slate-400 capitalize">{String(p.recommended_product).replace(/_/g, " ")}</p>}</div>}
          </div>
        )}

        {/* Factors */}
        {p.factors && p.factors.length > 0 && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
            <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><TrendingUp size={14} /> Credit factors</p>
            <div className="space-y-2.5">
              {p.factors.map((f, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">{f.label}</span><span className="text-slate-300">{f.score}/100</span></div>
                  <div className="h-1.5 rounded bg-[#30363d]"><div className="h-1.5 rounded" style={{ width: `${Math.max(2, Math.min(100, f.score))}%`, background: f.score >= 60 ? "#16a34a" : f.score >= 40 ? "#ca8a04" : "#dc2626" }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financials */}
        {p.financials && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
            {p.financials.annual_turnover != null && <div><p className="text-[11px] uppercase text-slate-500">Annual turnover</p><p className="font-semibold text-white">{formatCurrency(p.financials.annual_turnover)}</p></div>}
            {p.financials.monthly_revenue != null && <div><p className="text-[11px] uppercase text-slate-500">Monthly revenue</p><p className="font-semibold text-white">{formatCurrency(p.financials.monthly_revenue)}</p></div>}
            {p.financials.business_vintage_months != null && <div><p className="text-[11px] uppercase text-slate-500">Business vintage</p><p className="font-semibold text-white">{p.financials.business_vintage_months} months</p></div>}
            {p.financials.gst_filings_on_time != null && <div><p className="text-[11px] uppercase text-slate-500">GST filings on time</p><p className="font-semibold text-white">{p.financials.gst_filings_on_time}</p></div>}
          </div>
        )}

        <p className="text-[11px] text-slate-500 text-center leading-relaxed">{p.verified_by}<br />Generated {new Date(p.generated_at).toLocaleDateString("en-IN")} · Indicative only — confirm with your own diligence.</p>
      </div>
    </div>
  );
}
