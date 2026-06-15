import { useState, useRef, useEffect, useCallback } from "react";
import { FolderOpen, Upload, FileText, FileImage, File, Search, Tag, Trash2, Download, Eye, Plus, Lock, CheckCircle2, AlertTriangle, X, ScanLine, PenTool, CalendarClock, FileSpreadsheet, History, Camera, Send, Clock, Receipt, ListChecks, Files, Link2, UserCheck, CalendarRange, Archive, ClipboardCheck, Copy, ShieldCheck, XCircle, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { API_BASE } from "@/lib/apiBase";

type DocCategory = "gst" | "banking" | "legal" | "tax" | "payroll" | "other";
type DocStatus = "valid" | "expiring" | "expired" | "uploaded";

type Doc = {
  id: string;
  name: string;
  category: DocCategory;
  size: string;
  uploadedAt: Date;
  expiresAt?: Date;
  status: DocStatus;
  tags: string[];
  type: "pdf" | "image" | "excel" | "other";
};

// Raw row from GET /api/files
type FileRow = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  created_at: string;
  category: string | null;
  tags: string[] | null;
  expires_at: string | null;
};

const CATEGORIES: { id: DocCategory; label: string; color: string; bg: string }[] = [
  { id: "gst",     label: "GST",        color: "text-orange-400", bg: "bg-orange-950/30 border-orange-800/30" },
  { id: "banking", label: "Banking",    color: "text-blue-400",   bg: "bg-blue-950/30 border-blue-800/30"   },
  { id: "legal",   label: "Legal",      color: "text-purple-400", bg: "bg-purple-950/30 border-purple-800/30"},
  { id: "tax",     label: "Tax / IT",   color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-800/30"},
  { id: "payroll", label: "Payroll",    color: "text-green-400",  bg: "bg-green-950/30 border-green-800/30"  },
  { id: "other",   label: "Other",      color: "text-[var(--color-muted)]", bg: "bg-[var(--color-accent)]"  },
];

const FILE_ICON = {
  pdf:   { Icon: FileText,  color: "text-red-400"  },
  image: { Icon: FileImage, color: "text-blue-400" },
  excel: { Icon: FileText,  color: "text-green-400"},
  other: { Icon: File,      color: "text-[var(--color-muted)]" },
};

const STATUS_BADGE: Record<DocStatus, { label: string; style: string }> = {
  valid:    { label: "Valid",     style: "bg-green-950/40 text-green-400 border border-green-800/30"     },
  expiring: { label: "Expiring",  style: "bg-yellow-950/40 text-yellow-400 border border-yellow-800/30"  },
  expired:  { label: "Expired",   style: "bg-red-950/40 text-red-400 border border-red-800/30"           },
  uploaded: { label: "Uploaded",  style: "bg-[var(--color-accent)] text-[var(--color-muted)] border border-[var(--color-border)]" },
};

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.xls,.xlsx,.doc,.docx,.csv,.txt";

function token() { return localStorage.getItem("hr_access"); }

function fileType(mime: string): Doc["type"] {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") return "excel";
  return "other";
}

function humanSize(bytes: number): string {
  if (!bytes) return "—";
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusFor(expires?: Date): DocStatus {
  if (!expires) return "uploaded";
  const days = (expires.getTime() - Date.now()) / 86400000;
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "valid";
}

function rowToDoc(r: FileRow): Doc {
  const expiresAt = r.expires_at ? new Date(r.expires_at) : undefined;
  return {
    id: r.id,
    name: r.name,
    category: (CATEGORIES.some(c => c.id === r.category) ? r.category : "other") as DocCategory,
    size: humanSize(r.size),
    uploadedAt: new Date(r.created_at),
    expiresAt,
    status: statusFor(expiresAt),
    tags: r.tags ?? [],
    type: fileType(r.mime_type),
  };
}

// Fetch a file's bytes with the bearer token (the download route is auth-gated,
// so a plain <a href> can't carry the token — we fetch a blob instead).
async function fetchBlob(id: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/files/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: (r: FileRow) => void }) {
  const [name, setName]         = useState("");
  const [category, setCategory] = useState<DocCategory>("other");
  const [tags, setTags]         = useState("");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiry, setExpiry]     = useState("");
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [busy, setBusy]         = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => { setFile(f); if (!name) setName(f.name); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { toast.error("Choose a file to upload"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name || file.name);
      fd.append("category", category);
      fd.append("tags", JSON.stringify(tags.split(",").map(t => t.trim()).filter(Boolean)));
      if (hasExpiry && expiry) fd.append("expires_at", expiry);
      // No Content-Type header — the browser sets the multipart boundary.
      const res = await fetch(`${API_BASE}/api/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      if (!res.ok) {
        const msg = res.status === 415 ? "Unsupported file type" : res.status === 413 ? "File too large (max 10 MB)" : "Upload failed";
        toast.error(msg);
        return;
      }
      onUploaded(await res.json());
      toast.success("Document uploaded");
      onClose();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">Upload document</h2>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center mb-4 cursor-pointer transition-colors ${
            dragging ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
          }`}
        >
          <Upload size={20} className="mx-auto mb-2 text-[var(--color-muted)]" />
          {file
            ? <p className="text-sm font-medium text-[var(--color-primary)]">{file.name}</p>
            : <>
                <p className="text-sm text-[var(--color-muted)]">Drop file here or click to browse</p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">PDF, image, Excel, Word, CSV — max 10 MB</p>
              </>
          }
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Document name"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value as DocCategory)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none"
          >
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHasExpiry(v => !v)}
              className={`w-8 h-4 rounded-full transition-colors shrink-0 relative ${hasExpiry ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${hasExpiry ? "left-4" : "left-0.5"}`} />
            </button>
            <span className="text-sm text-[var(--color-muted)]">Has expiry date</span>
            {hasExpiry && (
              <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm outline-none" />
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Upload size={13} /> {busy ? "Uploading…" : "Upload"}
          </button>
          <button onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}

type DocTab = "vault" | "ocr" | "esign" | "expiry" | "stmt-parser" | "audit-trail" | "checklist" | "templates" | "share" | "kyc" | "contract-dates" | "filing" | "approval";

export default function DocumentsPage() {
  const [docTab, setDocTab]       = useState<DocTab>("vault");
  const [docs, setDocs]           = useState<Doc[]>([]);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState("");
  const [catFilter, setCatFilter] = useState<DocCategory | "all">("all");
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/files`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error(String(res.status));
      const rows: FileRow[] = await res.json();
      setDocs(rows.map(rowToDoc));
    } catch {
      toast.error("Couldn't load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onUploaded = (r: FileRow) => setDocs(d => [rowToDoc(r), ...d]);

  const handleDownload = async (doc: Doc) => {
    try {
      const blob = await fetchBlob(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = doc.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Download failed.");
    }
  };

  const handlePreview = async (doc: Doc) => {
    try {
      const blob = await fetchBlob(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Preview failed.");
    }
  };

  const handleDelete = async (doc: Doc) => {
    try {
      const res = await fetch(`${API_BASE}/api/files/${doc.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error(String(res.status));
      setDocs(d => d.filter(x => x.id !== doc.id));
      toast.success("Document removed");
    } catch {
      toast.error("Couldn't delete the document.");
    }
  };

  const filtered = docs.filter(d => {
    const q = query.toLowerCase();
    const matchQ = !q || d.name.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
    const matchC = catFilter === "all" || d.category === catFilter;
    return matchQ && matchC;
  });

  const expiring  = docs.filter(d => d.status === "expiring").length;
  const totalDocs = docs.length;

  const catCounts = CATEGORIES.reduce<Record<string, number>>((acc, c) => {
    acc[c.id] = docs.filter(d => d.category === c.id).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderOpen size={20} className="text-[var(--color-primary)]" />
            Document Vault
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            GST certificates, bank statements, legal docs — stored securely on your account.
          </p>
        </div>
        {docTab === "vault" && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-semibold hover:opacity-90 transition-all"
          >
            <Plus size={13} /> Upload document
          </button>
        )}
      </div>

      {/* Section selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([["vault", "Vault", FolderOpen], ["ocr", "Receipt OCR Capture", ScanLine], ["esign", "e-Sign Workflow", PenTool], ["expiry", "Expiry / Renewal Vault", CalendarClock], ["stmt-parser", "Bank Statement Parser", FileSpreadsheet], ["audit-trail", "Audit Trail", History], ["checklist", "Document Checklist", ListChecks], ["templates", "Template Library", Files], ["share", "Share-Link Tracker", Link2], ["kyc", "KYC Collector", UserCheck], ["contract-dates", "Contract Key-Dates", CalendarRange], ["filing", "Bill Filing Tracker", Archive], ["approval", "Approval Flow", ClipboardCheck]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setDocTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${docTab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {docTab === "ocr"            && <ReceiptOcrCapture />}
      {docTab === "esign"          && <ESignWorkflow />}
      {docTab === "expiry"         && <ExpiryRenewalVault />}
      {docTab === "stmt-parser"    && <BankStatementParser />}
      {docTab === "audit-trail"    && <AuditTrailLog />}
      {docTab === "checklist"      && <DocumentChecklist />}
      {docTab === "templates"      && <TemplateLibrary />}
      {docTab === "share"          && <ShareLinkTracker />}
      {docTab === "kyc"            && <KycCollector />}
      {docTab === "contract-dates" && <ContractKeyDates />}
      {docTab === "filing"         && <BillFilingTracker />}
      {docTab === "approval"       && <ApprovalFlow />}

      {docTab === "vault" && <>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 size={18} className="text-green-400 shrink-0" />
          <div>
            <p className="text-lg font-bold">{totalDocs}</p>
            <p className="text-xs text-[var(--color-muted)]">documents stored</p>
          </div>
        </div>
        <div className={`bg-[var(--color-surface)] border rounded-lg p-4 flex items-center gap-3 ${expiring > 0 ? "border-yellow-800/40" : "border-[var(--color-border)]"}`}>
          <AlertTriangle size={18} className={expiring > 0 ? "text-yellow-400" : "text-[var(--color-muted)]"} />
          <div>
            <p className="text-lg font-bold">{expiring}</p>
            <p className="text-xs text-[var(--color-muted)]">expiring soon</p>
          </div>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3">
          <Lock size={18} className="text-[var(--color-primary)] shrink-0" />
          <div>
            <p className="text-xs font-semibold">Encrypted in transit</p>
            <p className="text-xs text-[var(--color-muted)]">scoped to your tenant</p>
          </div>
        </div>
      </div>

      {expiring > 0 && (
        <div className="bg-yellow-950/20 border border-yellow-800/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold text-yellow-300">{expiring} document{expiring > 1 ? "s" : ""}</span> expiring soon.
            Renew to avoid compliance gaps.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Sidebar: categories */}
        <div className="space-y-2">
          <button
            onClick={() => setCatFilter("all")}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between ${
              catFilter === "all"
                ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/4"
            }`}
          >
            <span>All documents</span>
            <span className="text-xs">{totalDocs}</span>
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between ${
                catFilter === c.id
                  ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/4"
              }`}
            >
              <span className={c.color}>{c.label}</span>
              <span className="text-xs">{catCounts[c.id] || 0}</span>
            </button>
          ))}
        </div>

        {/* Main: document list */}
        <div className="lg:col-span-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or tag…"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-[var(--color-muted)]">Loading documents…</div>
          ) : filtered.length === 0 && (
            <div className="py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              <File size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
              <p className="text-sm text-[var(--color-muted)]">
                {docs.length === 0 ? "No documents yet" : "No documents match your search"}
              </p>
              {docs.length === 0 && (
                <p className="text-xs text-[var(--color-muted)] mt-1 max-w-sm mx-auto">
                  Upload your GST certificate, bank statements, PAN, licenses and payroll registers to keep every compliance document in one searchable place.
                </p>
              )}
            </div>
          )}

          {!loading && filtered.map(doc => {
            const { Icon, color } = FILE_ICON[doc.type];
            const cat = CATEGORIES.find(c => c.id === doc.category)!;
            const statusB = STATUS_BADGE[doc.status];
            return (
              <div key={doc.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 hover:border-[var(--color-primary)]/30 transition-colors">
                <div className="flex items-center gap-3">
                  <Icon size={18} className={`${color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cat.bg} ${cat.color} shrink-0`}>{cat.label}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusB.style} shrink-0`}>{statusB.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-[var(--color-muted)]">{doc.size} · Uploaded {format(doc.uploadedAt, "d MMM yyyy")}</p>
                      {doc.expiresAt && (
                        <p className={`text-xs ${doc.status === "expiring" ? "text-yellow-400" : doc.status === "expired" ? "text-red-400" : "text-[var(--color-muted)]"}`}>
                          Expires {format(doc.expiresAt, "d MMM yyyy")}
                        </p>
                      )}
                    </div>
                    {doc.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <Tag size={9} className="text-[var(--color-muted)]" />
                        {doc.tags.map(t => (
                          <span key={t} className="text-[10px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded text-[var(--color-muted)]">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handlePreview(doc)}
                      className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors rounded"
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors rounded"
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      className="p-1.5 text-[var(--color-muted)] hover:text-red-400 transition-colors rounded"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </>}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={onUploaded} />}
    </div>
  );
}

// Shared input style for the Documents tools, mirroring the rest of the app.
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// ── #157 Receipt / Bill OCR Capture ──────────────────────────────────────────────
type OcrExpense = {
  id: string;
  vendor: string;
  amount: number;
  gst: number;
  date: string;
  category: string;
  fileName: string;
  createdAt: string;
};

// Lightweight parse-hint pass over a filename / typed text. No real OCR backend —
// we surface best-guess fields the user then confirms before the record is saved.
function parseReceiptHints(text: string): { vendor?: string; amount?: number; gst?: number; date?: string } {
  const out: { vendor?: string; amount?: number; gst?: number; date?: string } = {};
  // Largest rupee-looking number is the likely total.
  const nums = [...text.matchAll(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*\.?[0-9]{0,2})/gi)]
    .map(m => parseFloat(m[1].replace(/,/g, "")))
    .filter(n => !Number.isNaN(n) && n >= 1);
  if (nums.length) out.amount = Math.max(...nums);
  // GST line if present.
  const gstM = text.match(/(?:gst|tax|cgst|sgst|igst)\D{0,12}([0-9][0-9,]*\.?[0-9]{0,2})/i);
  if (gstM) out.gst = parseFloat(gstM[1].replace(/,/g, ""));
  // dd/mm/yyyy or dd-mm-yyyy.
  const dateM = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dateM) {
    const [, d, mo, y] = dateM;
    const yr = y.length === 2 ? `20${y}` : y;
    out.date = `${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // First wordy token as a vendor hint (strip extension).
  const cleaned = text.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").trim();
  const word = cleaned.split(/\s+/).find(w => /[a-z]{3,}/i.test(w));
  if (word) out.vendor = cleaned.split(/\s+/).slice(0, 3).join(" ");
  return out;
}

const EXPENSE_CATS = ["Office", "Travel", "Utilities", "Marketing", "Supplies", "Professional fees", "Other"] as const;

function ReceiptOcrCapture() {
  const [expenses, setExpenses] = useFeatureState<OcrExpense[]>("ocr-expenses", []);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState<string>(EXPENSE_CATS[0]);
  const [fileName, setFileName] = useState("");
  const [scanned, setScanned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fc = formatCurrency;

  const onPick = (f: File) => {
    setFileName(f.name);
    const hints = parseReceiptHints(f.name);
    if (hints.vendor && !vendor) setVendor(hints.vendor);
    if (hints.amount && !amount) setAmount(String(hints.amount));
    if (hints.gst && !gst) setGst(String(hints.gst));
    if (hints.date) setDate(hints.date);
    setScanned(true);
    toast.success("Receipt captured — confirm the fields below");
  };

  const save = () => {
    const amt = parseFloat(amount) || 0;
    if (!vendor || amt <= 0) { toast.error("Enter a vendor and amount"); return; }
    setExpenses(prev => [{
      id: crypto.randomUUID(),
      vendor,
      amount: amt,
      gst: parseFloat(gst) || 0,
      date,
      category,
      fileName: fileName || "manual entry",
      createdAt: new Date().toISOString(),
    }, ...prev]);
    setVendor(""); setAmount(""); setGst(""); setFileName(""); setScanned(false);
    toast.success("Expense record created");
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const totalGst = expenses.reduce((s, e) => s + e.gst, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ScanLine size={14} className="text-[var(--color-primary)]" /> Receipt / Bill OCR Capture</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Snap a bill or pick a photo, confirm the auto-suggested vendor / amount / GST, and book it as an expense — no typing the whole bill out. Captured records sync to your account.</p>

        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)]/40 rounded-lg p-6 text-center mb-4 cursor-pointer transition-colors"
        >
          <Camera size={20} className="mx-auto mb-2 text-[var(--color-muted)]" />
          {fileName
            ? <p className="text-sm font-medium text-[var(--color-primary)]">{fileName}</p>
            : <p className="text-sm text-[var(--color-muted)]">Take a photo or choose a receipt image / PDF</p>}
          <input ref={inputRef} type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
        </div>

        {scanned && <p className="text-[11px] text-[var(--color-muted)] mb-3 flex items-center gap-1.5"><CheckCircle2 size={11} className="text-green-400" /> Parsed a few fields from the file name — please verify the amounts before saving.</p>}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Total amount (₹) *" className={INP} />
          <input type="number" value={gst} onChange={e => setGst(e.target.value)} placeholder="GST in bill (₹)" className={INP} />
          <select value={category} onChange={e => setCategory(e.target.value)} className={INP}>
            {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          <button onClick={save} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"><Plus size={13} /> Book expense</button>
        </div>
      </div>

      {expenses.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Receipts captured", value: String(expenses.length), color: "text-[var(--color-text)]" },
            { label: "Total expense", value: fc(total), color: "text-orange-400" },
            { label: "GST in bills", value: fc(totalGst), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Vendor", "Category", "Amount", "GST", "Date", "Source", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {expenses.map(e => (
                <tr key={e.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{e.vendor}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{e.category}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-orange-400">{fc(e.amount)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{e.gst > 0 ? fc(e.gst) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs">{e.date}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[140px] truncate flex items-center gap-1"><Receipt size={11} /> {e.fileName}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setExpenses(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Field detection is a best-effort hint only — always confirm the amount and GST against the original bill before booking. Keep the source image; ITC claims require a valid tax invoice.</p>
    </div>
  );
}

// ── #158 e-Sign / Aadhaar-eSign Workflow ─────────────────────────────────────────
type SignDoc = {
  id: string;
  title: string;
  signer: string;
  email: string;
  method: "aadhaar" | "dsc" | "email";
  sentAt: string;
  status: "draft" | "sent" | "viewed" | "signed" | "declined";
};
const SIGN_STATUSES: SignDoc["status"][] = ["draft", "sent", "viewed", "signed", "declined"];
const SIGN_FLOW: Record<SignDoc["status"], SignDoc["status"]> = { draft: "sent", sent: "viewed", viewed: "signed", signed: "signed", declined: "sent" };

function ESignWorkflow() {
  const [docs, setDocs] = useFeatureState<SignDoc[]>("esign-docs", []);
  const [title, setTitle] = useState("");
  const [signer, setSigner] = useState("");
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<SignDoc["method"]>("aadhaar");

  const METHODS: Record<SignDoc["method"], string> = {
    aadhaar: "Aadhaar e-Sign (OTP)",
    dsc: "Digital Signature Certificate",
    email: "Email click-to-sign",
  };
  const STATUS_STYLE: Record<SignDoc["status"], string> = {
    draft: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
    sent: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    viewed: "bg-blue-900/30 text-blue-400 border-blue-800/40",
    signed: "bg-green-900/30 text-green-400 border-green-800/40",
    declined: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  const send = () => {
    if (!title || !signer) { toast.error("Enter a document title and signer"); return; }
    setDocs(prev => [{
      id: crypto.randomUUID(), title, signer, email, method,
      sentAt: new Date().toISOString(), status: "sent",
    }, ...prev]);
    setTitle(""); setSigner(""); setEmail("");
    toast.success("Sent for signature");
  };

  const advance = (id: string) => setDocs(prev => prev.map(d => d.id === id ? { ...d, status: SIGN_FLOW[d.status] } : d));
  const decline = (id: string) => setDocs(prev => prev.map(d => d.id === id ? { ...d, status: "declined" } : d));

  const counts = SIGN_STATUSES.reduce<Record<string, number>>((a, s) => { a[s] = docs.filter(d => d.status === s).length; return a; }, {});
  const pending = (counts.sent || 0) + (counts.viewed || 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><PenTool size={14} className="text-[var(--color-primary)]" /> e-Sign / Aadhaar-eSign Workflow</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Send agreements, NDAs and contracts for signature and track them from sent → viewed → signed. Supports Aadhaar e-Sign, DSC and email click-to-sign methods.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Document title *" className={INP} />
          <input value={signer} onChange={e => setSigner(e.target.value)} placeholder="Signer name *" className={INP} />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Signer email" className={INP} />
          <select value={method} onChange={e => setMethod(e.target.value as SignDoc["method"])} className={INP}>
            {(Object.keys(METHODS) as SignDoc["method"][]).map(m => <option key={m} value={m}>{METHODS[m]}</option>)}
          </select>
        </div>
        <button onClick={send} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5"><Send size={13} /> Send for signature</button>
      </div>

      {docs.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Awaiting signature", value: String(pending), color: pending > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Signed", value: String(counts.signed || 0), color: "text-green-400" },
            { label: "Declined", value: String(counts.declined || 0), color: (counts.declined || 0) > 0 ? "text-red-400" : "text-[var(--color-muted)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Document", "Signer", "Method", "Sent", "Status", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{d.title}</td>
                  <td className="px-3 py-2.5 text-xs">{d.signer}{d.email ? <span className="block text-[10px] text-[var(--color-muted)]">{d.email}</span> : null}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{METHODS[d.method]}</td>
                  <td className="px-3 py-2.5 text-xs">{format(new Date(d.sentAt), "d MMM")}</td>
                  <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[d.status]}`}>{d.status}</span></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {d.status !== "signed" && d.status !== "declined" && (
                        <button onClick={() => advance(d.id)} className="text-[10px] text-[var(--color-primary)] hover:underline">Mark {SIGN_FLOW[d.status]}</button>
                      )}
                      {d.status !== "signed" && d.status !== "declined" && (
                        <button onClick={() => decline(d.id)} className="text-[10px] text-red-400 hover:underline">Decline</button>
                      )}
                      <button onClick={() => setDocs(prev => prev.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Statuses are tracked manually here — wire to an ASP/eSign provider (NSDL/CDSL e-Sign, eMudhra) for legally-timestamped audit trails under the IT Act, 2000.</p>
    </div>
  );
}

// ── #159 Document Expiry / Renewal Vault ─────────────────────────────────────────
type ExpiryItem = {
  id: string;
  name: string;
  type: string;
  expiresAt: string;
  owner: string;
  noticeDays: number;
};
const EXPIRY_TYPES = ["License", "Insurance", "Contract", "Certificate", "Registration", "Other"] as const;

function ExpiryRenewalVault() {
  const [items, setItems] = useFeatureState<ExpiryItem[]>("expiry-items", []);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(EXPIRY_TYPES[0]);
  const [expiresAt, setExpiresAt] = useState("");
  const [owner, setOwner] = useState("");
  const [noticeDays, setNoticeDays] = useState("30");

  const add = () => {
    if (!name || !expiresAt) { toast.error("Enter a name and expiry date"); return; }
    setItems(prev => [...prev, {
      id: crypto.randomUUID(), name, type, expiresAt, owner,
      noticeDays: parseInt(noticeDays) || 30,
    }]);
    setName(""); setExpiresAt(""); setOwner("");
    toast.success("Added to renewal vault");
  };

  const enriched = items
    .map(i => ({ ...i, days: differenceInCalendarDays(new Date(i.expiresAt), new Date()) }))
    .sort((a, b) => a.days - b.days);
  const expired = enriched.filter(i => i.days < 0).length;
  const dueSoon = enriched.filter(i => i.days >= 0 && i.days <= i.noticeDays).length;

  const tone = (i: { days: number; noticeDays: number }) =>
    i.days < 0 ? { txt: "text-red-400", badge: "bg-red-900/30 text-red-400 border-red-800/40", label: "Expired" }
    : i.days <= i.noticeDays ? { txt: "text-yellow-400", badge: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40", label: "Due soon" }
    : { txt: "text-green-400", badge: "bg-green-900/30 text-green-400 border-green-800/40", label: "Valid" };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Document Expiry / Renewal Vault</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track licenses, insurance policies, contracts and certificates with their expiry dates and a custom alert window — so nothing lapses without warning.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Document name *" className={INP} />
          <select value={type} onChange={e => setType(e.target.value)} className={INP}>
            {EXPIRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Owner / dept" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Expiry date *</label>
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Alert (days before)</label>
            <input type="number" value={noticeDays} onChange={e => setNoticeDays(e.target.value)} placeholder="30" className={INP} />
          </div>
          <div className="flex items-end"><button onClick={add} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"><Plus size={13} /> Add</button></div>
        </div>
      </div>

      {(expired > 0 || dueSoon > 0) && (
        <div className="bg-yellow-950/20 border border-yellow-800/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <p className="text-sm">
            {expired > 0 && <span className="font-semibold text-red-400">{expired} expired</span>}
            {expired > 0 && dueSoon > 0 && <span> · </span>}
            {dueSoon > 0 && <span className="font-semibold text-yellow-300">{dueSoon} due soon</span>}
            <span className="text-[var(--color-muted)]"> — renew to avoid compliance gaps.</span>
          </p>
        </div>
      )}

      {enriched.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Document", "Type", "Owner", "Expires", "Countdown", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {enriched.map(i => {
                const t = tone(i);
                return (
                  <tr key={i.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{i.name}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{i.type}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{i.owner || "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{format(new Date(i.expiresAt), "d MMM yyyy")}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${t.txt}`}>{i.days < 0 ? `${Math.abs(i.days)}d ago` : `in ${i.days}d`}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${t.badge}`}>{t.label}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Alerts fire when the days-to-expiry falls within each item's notice window. Connect to the Alerts page to push WhatsApp/email reminders ahead of every renewal.</p>
    </div>
  );
}

// ── #160 Bank Statement Parser (text → txns) ─────────────────────────────────────
type ParsedRow = { id: string; date: string; description: string; debit: number; credit: number };

// Parse pasted statement text line-by-line. Each line is expected to carry a
// date, a narration, and one or two trailing amounts (debit/credit or amount + balance).
function parseStatement(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const dateM = line.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(\d{4}-\d{2}-\d{2})/);
    if (!dateM) continue;
    const amounts = [...line.matchAll(/(-?(?:₹|rs\.?)?\s*[0-9][0-9,]*\.[0-9]{2})(\s*(?:cr|dr))?/gi)]
      .map(m => ({ value: parseFloat(m[1].replace(/[₹,\s]|rs\.?/gi, "")), tag: (m[2] || "").trim().toLowerCase() }));
    if (!amounts.length) continue;
    const date = dateM[0];
    let description = line;
    if (dateM.index !== undefined) description = line.slice(dateM.index + dateM[0].length);
    const firstAmtM = line.match(/-?(?:₹|rs\.?)?\s*[0-9][0-9,]*\.[0-9]{2}/i);
    if (firstAmtM && firstAmtM.index !== undefined) description = description.slice(0, description.indexOf(firstAmtM[0])) || description;
    description = description.replace(/\s+/g, " ").replace(/(cr|dr)\b/gi, "").trim() || "—";

    // The first amount is the transaction; sign / Cr/Dr tag decides direction.
    const first = amounts[0];
    let debit = 0, credit = 0;
    if (first.tag === "cr") credit = Math.abs(first.value);
    else if (first.tag === "dr") debit = Math.abs(first.value);
    else if (first.value < 0) debit = Math.abs(first.value);
    else credit = first.value;
    out.push({ id: crypto.randomUUID(), date, description: description.slice(0, 80), debit, credit });
  }
  return out;
}

function BankStatementParser() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const fc = formatCurrency;

  const run = () => {
    const parsed = parseStatement(text);
    if (!parsed.length) { toast.error("No transaction rows found — paste lines with a date and an amount"); return; }
    setRows(parsed);
    toast.success(`Parsed ${parsed.length} row${parsed.length > 1 ? "s" : ""}`);
  };

  const totalDr = rows.reduce((s, r) => s + r.debit, 0);
  const totalCr = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileSpreadsheet size={14} className="text-[var(--color-primary)]" /> Bank Statement Parser</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Copy the transaction lines from any bank PDF or net-banking export and paste them below. We detect the date, narration and debit/credit on each line and give you a clean preview to review before import.</p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={6}
          placeholder={"Paste statement rows, e.g.\n05/06/2026  UPI/PAYTM/GROCERY            1,250.00 Dr\n07/06/2026  NEFT INWARD ACME LTD        85,000.00 Cr"}
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] font-mono text-xs resize-y"
        />
        <div className="flex items-center gap-2 mt-3">
          <button onClick={run} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5"><FileText size={13} /> Parse statement</button>
          {rows.length > 0 && <button onClick={() => { setRows([]); setText(""); }} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-2">Clear</button>}
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Rows parsed", value: String(rows.length), color: "text-[var(--color-text)]" },
            { label: "Total debits", value: fc(totalDr), color: "text-red-400" },
            { label: "Total credits", value: fc(totalCr), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Description", "Debit", "Credit"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[260px] truncate">{r.description}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-red-400">{r.debit > 0 ? fc(r.debit) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-green-400">{r.credit > 0 ? fc(r.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Parsing is a preview only — formats vary by bank, so verify a sample of rows before importing into your ledger. Amounts must include decimals (e.g. 1,250.00) and a Cr/Dr tag or sign for reliable direction detection.</p>
    </div>
  );
}

// ── #161 Audit-Trail / Document Versioning ───────────────────────────────────────
type AuditEntry = {
  id: string;
  document: string;
  action: "created" | "edited" | "viewed" | "shared" | "deleted" | "signed";
  actor: string;
  version: number;
  note: string;
  at: string;
};
const AUDIT_ACTIONS: AuditEntry["action"][] = ["created", "edited", "viewed", "shared", "deleted", "signed"];

function AuditTrailLog() {
  const [entries, setEntries] = useFeatureState<AuditEntry[]>("audit-trail-entries", []);
  const [document, setDocument] = useState("");
  const [action, setAction] = useState<AuditEntry["action"]>("created");
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");

  const ACTION_STYLE: Record<AuditEntry["action"], string> = {
    created: "bg-green-900/30 text-green-400 border-green-800/40",
    edited: "bg-blue-900/30 text-blue-400 border-blue-800/40",
    viewed: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
    shared: "bg-purple-900/30 text-purple-400 border-purple-800/40",
    deleted: "bg-red-900/30 text-red-400 border-red-800/40",
    signed: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
  };

  const log = () => {
    if (!document || !actor) { toast.error("Enter a document and actor"); return; }
    // Next version = highest recorded version for this document + 1.
    const prevMax = entries.filter(e => e.document.toLowerCase() === document.toLowerCase())
      .reduce((m, e) => Math.max(m, e.version), 0);
    setEntries(prev => [{
      id: crypto.randomUUID(), document, action, actor,
      version: action === "viewed" || action === "shared" ? prevMax || 1 : prevMax + 1,
      note, at: new Date().toISOString(),
    }, ...prev]);
    setNote("");
    toast.success("Logged to audit trail");
  };

  const visible = entries.filter(e => {
    const q = filter.toLowerCase();
    return !q || e.document.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><History size={14} className="text-[var(--color-primary)]" /> Audit-Trail / Document Versioning</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Keep a who-changed-what log against every document for your auditors. Each edit/sign bumps the version; views and shares are recorded without a version change.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <input value={document} onChange={e => setDocument(e.target.value)} placeholder="Document name *" className={INP} />
          <select value={action} onChange={e => setAction(e.target.value as AuditEntry["action"])} className={INP}>
            {AUDIT_ACTIONS.map(a => <option key={a} value={a} className="capitalize">{a}</option>)}
          </select>
          <input value={actor} onChange={e => setActor(e.target.value)} placeholder="Actor (who) *" className={INP} />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={INP} />
        </div>
        <button onClick={log} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5"><Plus size={13} /> Record entry</button>
      </div>

      {entries.length > 0 && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by document or actor…" className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
      )}

      {visible.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["When", "Document", "Ver", "Action", "Actor", "Note", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {visible.map(e => (
                <tr key={e.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-[var(--color-muted)] flex items-center gap-1"><Clock size={10} /> {format(new Date(e.at), "d MMM, HH:mm")}</td>
                  <td className="px-3 py-2.5 text-xs font-medium">{e.document}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">v{e.version}</td>
                  <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${ACTION_STYLE[e.action]}`}>{e.action}</span></td>
                  <td className="px-3 py-2.5 text-xs">{e.actor}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[180px] truncate">{e.note || "—"}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setEntries(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <History size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">{entries.length === 0 ? "No audit entries yet" : "No entries match your filter"}</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Entries are append-only by convention — for tamper-evident audit logs required by statutory audits, back this with a server-side immutable log and hash chaining.</p>
    </div>
  );
}

// ── Document Checklist by purpose (loan / GST-reg / tender) ───────────────────────
// Curated paperwork lists per common Indian business purpose, with per-item
// done-ticks persisted so a team can collect a complete pack without missing anything.
const CHECKLIST_PACKS: { id: string; label: string; items: string[] }[] = [
  { id: "loan", label: "Business loan / working capital", items: [
    "PAN card (business + proprietor/directors)", "GST registration certificate", "Last 6–12 months bank statements",
    "Last 2 years ITR with computation", "Audited financials / P&L + balance sheet", "Address proof (rent deed / utility bill)",
    "KYC of promoters (Aadhaar + PAN)", "Business registration / Udyam (MSME) certificate", "Existing loan sanction letters (if any)",
  ] },
  { id: "gst-reg", label: "New GST registration", items: [
    "PAN of business / proprietor", "Aadhaar of authorised signatory", "Photograph of proprietor / partners",
    "Proof of place of business (electricity bill / rent agreement + NOC)", "Bank account proof (cancelled cheque / statement)",
    "Partnership deed / Certificate of Incorporation", "Board resolution / authorisation letter", "Digital Signature (DSC) for company/LLP",
  ] },
  { id: "tender", label: "Government tender / bid", items: [
    "GST registration certificate", "PAN card", "Udyam (MSME) certificate", "Last 3 years ITR",
    "Audited balance sheet (3 years)", "EMD / bid security instrument", "Experience / work-completion certificates",
    "Solvency certificate from bank", "Affidavit / non-blacklisting declaration", "Authorised-signatory power of attorney",
  ] },
  { id: "vendor", label: "Vendor / supplier onboarding", items: [
    "GSTIN + PAN", "Cancelled cheque / bank details", "MSME / Udyam certificate", "Signed vendor agreement",
    "Address proof", "Authorised contact + email", "Product / rate card",
  ] },
];

function DocumentChecklist() {
  const [packId, setPackId] = useState(CHECKLIST_PACKS[0].id);
  const [done, setDone] = useFeatureState<Record<string, boolean>>("doc-checklist-done", {});
  const pack = CHECKLIST_PACKS.find(p => p.id === packId)!;
  const key = (item: string) => `${packId}::${item}`;
  const completed = pack.items.filter(i => done[key(i)]).length;
  const pct = Math.round((completed / pack.items.length) * 100);

  const toggle = (item: string) => setDone(prev => ({ ...prev, [key(item)]: !prev[key(item)] }));
  const reset = () => setDone(prev => { const next = { ...prev }; pack.items.forEach(i => delete next[key(i)]); return next; });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Document Checklist by purpose</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Pick what you're preparing for — a loan, GST registration, a tender or vendor onboarding — and tick off each required document as you gather it. Your progress is saved.</p>
        <div className="flex flex-wrap gap-2">
          {CHECKLIST_PACKS.map(p => (
            <button key={p.id} onClick={() => setPackId(p.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${packId === p.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--color-muted)]">{completed} of {pack.items.length} collected</p>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold tabular-nums ${pct === 100 ? "text-green-400" : "text-[var(--color-text)]"}`}>{pct}%</span>
            {completed > 0 && <button onClick={reset} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Reset</button>}
          </div>
        </div>
        <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-400" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="space-y-1.5">
          {pack.items.map(item => {
            const checked = !!done[key(item)];
            return (
              <button key={item} onClick={() => toggle(item)}
                className="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg hover:bg-white/4 transition-colors">
                {checked
                  ? <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                  : <div className="w-[15px] h-[15px] rounded-full border border-[var(--color-border)] shrink-0" />}
                <span className={`text-sm ${checked ? "line-through text-[var(--color-muted)]" : "text-[var(--color-text)]"}`}>{item}</span>
              </button>
            );
          })}
        </div>
        {pct === 100 && (
          <div className="bg-green-950/20 border border-green-800/30 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-green-300">
            <CheckCircle2 size={13} /> Pack complete — every document for {pack.label.toLowerCase()} is collected.
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Indicative lists for common cases — lenders, GST officers and tendering authorities may ask for additional documents. Confirm the exact requirements before final submission.</p>
    </div>
  );
}

// ── Template Library (letters / NOCs / declarations) ─────────────────────────────
// Fill-in-the-blank boilerplate for routine business letters. Placeholders in {{ }}
// are replaced from the field inputs; the result can be copied to the clipboard.
type LetterTemplate = { id: string; title: string; fields: { key: string; label: string }[]; body: string };
const LETTER_TEMPLATES: LetterTemplate[] = [
  { id: "noc-vendor", title: "No-Objection Certificate (vendor)", fields: [
      { key: "company", label: "Your company" }, { key: "party", label: "Vendor / party name" }, { key: "purpose", label: "Purpose" }, { key: "place", label: "Place" },
    ],
    body: "TO WHOMSOEVER IT MAY CONCERN\n\nThis is to certify that {{company}} has no objection to {{party}} for the purpose of {{purpose}}. We confirm that all dues, if any, stand settled and there is no pending claim against the said party as on date.\n\nFor {{company}}\nAuthorised Signatory\nPlace: {{place}}\nDate: {{date}}" },
  { id: "address-decl", title: "Address proof declaration", fields: [
      { key: "name", label: "Declarant name" }, { key: "address", label: "Full address" }, { key: "use", label: "Used for" },
    ],
    body: "DECLARATION\n\nI, {{name}}, do hereby solemnly declare that my registered place of business is situated at:\n{{address}}\n\nThis declaration is made for the purpose of {{use}} and the information furnished above is true and correct to the best of my knowledge.\n\nSignature: ____________\nName: {{name}}\nDate: {{date}}" },
  { id: "auth-letter", title: "Authorisation letter", fields: [
      { key: "company", label: "Company" }, { key: "person", label: "Authorised person" }, { key: "task", label: "Authorised to" }, { key: "place", label: "Place" },
    ],
    body: "AUTHORISATION LETTER\n\n{{company}} hereby authorises {{person}} to {{task}} on our behalf. All acts done by the said authorised representative within this scope shall be binding on the company.\n\nFor {{company}}\nAuthorised Signatory\nPlace: {{place}}  Date: {{date}}" },
  { id: "payment-reminder", title: "Payment reminder letter", fields: [
      { key: "party", label: "Customer name" }, { key: "amount", label: "Amount due (₹)" }, { key: "invoice", label: "Invoice no." }, { key: "company", label: "Your company" },
    ],
    body: "Dear {{party}},\n\nThis is a gentle reminder that an amount of ₹{{amount}} against invoice {{invoice}} remains outstanding. We request you to arrange the payment at the earliest to keep your account in good standing.\n\nShould the payment already be in process, kindly ignore this notice.\n\nRegards,\n{{company}}\nDate: {{date}}" },
];

function TemplateLibrary() {
  const [tplId, setTplId] = useState(LETTER_TEMPLATES[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const tpl = LETTER_TEMPLATES.find(t => t.id === tplId)!;

  const today = format(new Date(), "d MMM yyyy");
  const output = tpl.body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
    k === "date" ? today : (values[k]?.trim() || `[${k}]`));

  const pickTpl = (id: string) => { setTplId(id); setValues({}); };
  const copy = () => { navigator.clipboard?.writeText(output); toast.success("Letter copied to clipboard"); };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Files size={14} className="text-[var(--color-primary)]" /> Template Library</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Ready-made letters, NOCs, authorisations and declarations. Fill the blanks and copy a clean draft — no more hunting for last year's format.</p>
        <div className="flex flex-wrap gap-2">
          {LETTER_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => pickTpl(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${tplId === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {t.title}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
          <p className="text-xs font-semibold text-[var(--color-muted)]">Fill in</p>
          {tpl.fields.map(f => (
            <div key={f.key}>
              <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">{f.label}</label>
              <input value={values[f.key] || ""} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} placeholder={f.label} className={INP} />
            </div>
          ))}
          <p className="text-[10px] text-[var(--color-muted)]">Today's date is inserted automatically.</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--color-muted)]">Preview</p>
            <button onClick={copy} className="text-[10px] flex items-center gap-1 text-[var(--color-primary)] hover:underline"><Copy size={11} /> Copy</button>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-sans bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 leading-relaxed min-h-[200px]">{output}</pre>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Boilerplate only — these are not a substitute for legal advice. Have material documents reviewed by a professional and printed on letterhead / stamp paper where required.</p>
    </div>
  );
}

// ── Document Share-Link Tracker ──────────────────────────────────────────────────
// A register of share links handed out for documents — who got it, when it expires,
// and whether it's been revoked — so external access stays accountable.
type ShareLink = {
  id: string;
  docName: string;
  recipient: string;
  access: "view" | "download";
  createdAt: string;
  expiresAt: string;
  token: string;
  revoked: boolean;
};

function ShareLinkTracker() {
  const [links, setLinks] = useFeatureState<ShareLink[]>("doc-share-links", []);
  const [docName, setDocName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [access, setAccess] = useState<ShareLink["access"]>("view");
  const [days, setDays] = useState("7");

  const create = () => {
    if (!docName || !recipient) { toast.error("Enter a document name and recipient"); return; }
    const exp = new Date(); exp.setDate(exp.getDate() + (parseInt(days) || 7));
    setLinks(prev => [{
      id: crypto.randomUUID(), docName, recipient, access,
      createdAt: new Date().toISOString(), expiresAt: exp.toISOString(),
      token: Math.random().toString(36).slice(2, 10), revoked: false,
    }, ...prev]);
    setDocName(""); setRecipient("");
    toast.success("Share link created");
  };

  const revoke = (id: string) => { setLinks(prev => prev.map(l => l.id === id ? { ...l, revoked: true } : l)); toast.success("Link revoked"); };
  const copyLink = (l: ShareLink) => { navigator.clipboard?.writeText(`https://share.headroom.app/d/${l.token}`); toast.success("Link copied"); };

  const linkState = (l: ShareLink) => {
    if (l.revoked) return { label: "Revoked", style: "bg-red-900/30 text-red-400 border-red-800/40" };
    if (differenceInCalendarDays(new Date(l.expiresAt), new Date()) < 0) return { label: "Expired", style: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]" };
    return { label: "Active", style: "bg-green-900/30 text-green-400 border-green-800/40" };
  };
  const active = links.filter(l => !l.revoked && differenceInCalendarDays(new Date(l.expiresAt), new Date()) >= 0).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Link2 size={14} className="text-[var(--color-primary)]" /> Document Share-Link Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Generate trackable links when you share a document externally, set how long they last, and revoke access the moment it's no longer needed.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Document name *" className={INP} />
          <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Recipient / email *" className={INP} />
          <select value={access} onChange={e => setAccess(e.target.value as ShareLink["access"])} className={INP}>
            <option value="view">View only</option>
            <option value="download">Allow download</option>
          </select>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Expires in (days)</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} placeholder="7" className={INP} />
          </div>
        </div>
        <button onClick={create} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5"><Link2 size={13} /> Create link</button>
      </div>

      {links.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3">
          <ShieldCheck size={16} className={active > 0 ? "text-green-400" : "text-[var(--color-muted)]"} />
          <p className="text-sm"><span className="font-bold tabular-nums">{active}</span> <span className="text-[var(--color-muted)]">active link{active === 1 ? "" : "s"} out of {links.length} issued</span></p>
        </div>
      )}

      {links.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[660px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Document", "Recipient", "Access", "Created", "Expires", "Status", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {links.map(l => {
                const s = linkState(l);
                return (
                  <tr key={l.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{l.docName}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{l.recipient}</td>
                    <td className="px-3 py-2.5 text-xs capitalize">{l.access === "download" ? "Download" : "View"}</td>
                    <td className="px-3 py-2.5 text-xs">{format(new Date(l.createdAt), "d MMM")}</td>
                    <td className="px-3 py-2.5 text-xs">{format(new Date(l.expiresAt), "d MMM yyyy")}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${s.style}`}>{s.label}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => copyLink(l)} className="text-[10px] text-[var(--color-primary)] hover:underline flex items-center gap-0.5"><Copy size={10} /> Copy</button>
                        {!l.revoked && <button onClick={() => revoke(l.id)} className="text-[10px] text-red-400 hover:underline">Revoke</button>}
                        <button onClick={() => setLinks(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">This is a sharing register — the links shown are illustrative tokens. Wire to a server-side signed-URL service to enforce real expiry and revocation on the file itself.</p>
    </div>
  );
}

// ── KYC Document Collector ───────────────────────────────────────────────────────
// Per-counterparty KYC checklist (PAN / Aadhaar / GST / bank proof…) with a received
// tick and an optional reference, so onboarding a customer/vendor stays complete.
type KycParty = { id: string; name: string; kind: "customer" | "vendor" | "employee"; createdAt: string; received: Record<string, boolean> };
const KYC_DOCS = ["PAN card", "Aadhaar", "GST certificate", "Cancelled cheque / bank proof", "Address proof", "Photograph", "Signed agreement"] as const;

function KycCollector() {
  const [parties, setParties] = useFeatureState<KycParty[]>("doc-kyc-parties", []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<KycParty["kind"]>("customer");

  const add = () => {
    if (!name) { toast.error("Enter a name"); return; }
    setParties(prev => [{ id: crypto.randomUUID(), name, kind, createdAt: new Date().toISOString(), received: {} }, ...prev]);
    setName("");
    toast.success("Counterparty added");
  };
  const toggleDoc = (pid: string, docKey: string) =>
    setParties(prev => prev.map(p => p.id === pid ? { ...p, received: { ...p.received, [docKey]: !p.received[docKey] } } : p));
  const remove = (pid: string) => setParties(prev => prev.filter(p => p.id !== pid));

  const progress = (p: KycParty) => KYC_DOCS.filter(d => p.received[d]).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><UserCheck size={14} className="text-[var(--color-primary)]" /> KYC Document Collector</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track which KYC documents you've received from each customer, vendor or new hire. Tick each off as it arrives so onboarding never stalls on a missing paper.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Counterparty name *" className={INP} />
          <select value={kind} onChange={e => setKind(e.target.value as KycParty["kind"])} className={INP}>
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="employee">Employee</option>
          </select>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"><Plus size={13} /> Add counterparty</button>
        </div>
      </div>

      {parties.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <UserCheck size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No counterparties yet — add one to start collecting KYC.</p>
        </div>
      ) : parties.map(p => {
        const got = progress(p);
        const complete = got === KYC_DOCS.length;
        return (
          <div key={p.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{p.name}</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] capitalize">{p.kind}</span>
                {complete && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-green-800/40 bg-green-900/30 text-green-400">Complete</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-[var(--color-muted)]">{got}/{KYC_DOCS.length}</span>
                <button onClick={() => remove(p.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {KYC_DOCS.map(d => {
                const has = !!p.received[d];
                return (
                  <button key={d} onClick={() => toggleDoc(p.id, d)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-colors ${has ? "bg-green-950/30 border-green-800/40 text-green-400" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                    {has ? <CheckCircle2 size={11} /> : <Plus size={11} />} {d}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--color-muted)]">A collection tracker, not a verification service. Validate PAN/GSTIN against official registries and mask Aadhaar before storing, per DPDP data-minimisation norms.</p>
    </div>
  );
}

// ── Contract Key-Dates Extractor (manual entry → reminders) ──────────────────────
// Capture the dates that matter in a contract — renewal, notice-to-terminate,
// payment milestones — and see what's coming up, sorted by urgency.
type KeyDate = { id: string; contract: string; kind: string; date: string; counterparty: string; note: string };
const KEYDATE_KINDS = ["Renewal", "Notice deadline", "Payment milestone", "Expiry", "Review", "Other"] as const;

function ContractKeyDates() {
  const [dates, setDates] = useFeatureState<KeyDate[]>("doc-contract-keydates", []);
  const [contract, setContract] = useState("");
  const [kind, setKind] = useState<string>(KEYDATE_KINDS[0]);
  const [date, setDate] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [note, setNote] = useState("");

  const add = () => {
    if (!contract || !date) { toast.error("Enter a contract and date"); return; }
    setDates(prev => [...prev, { id: crypto.randomUUID(), contract, kind, date, counterparty, note }]);
    setContract(""); setDate(""); setCounterparty(""); setNote("");
    toast.success("Key date added");
  };

  const enriched = dates
    .map(d => ({ ...d, days: differenceInCalendarDays(new Date(d.date), new Date()) }))
    .sort((a, b) => a.days - b.days);
  const upcoming = enriched.filter(d => d.days >= 0 && d.days <= 30).length;
  const overdue = enriched.filter(d => d.days < 0).length;

  const tone = (days: number) =>
    days < 0 ? { txt: "text-red-400", badge: "bg-red-900/30 text-red-400 border-red-800/40", label: "Passed" }
    : days <= 30 ? { txt: "text-yellow-400", badge: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40", label: "Soon" }
    : { txt: "text-green-400", badge: "bg-green-900/30 text-green-400 border-green-800/40", label: "Upcoming" };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarRange size={14} className="text-[var(--color-primary)]" /> Contract Key-Dates</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Record the dates buried in your contracts — renewal, notice-to-terminate, payment milestones — so a missed deadline never costs you an auto-renewal or a penalty.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={contract} onChange={e => setContract(e.target.value)} placeholder="Contract / agreement *" className={INP} />
          <select value={kind} onChange={e => setKind(e.target.value)} className={INP}>
            {KEYDATE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="Counterparty" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={INP} />
          <div className="flex items-end"><button onClick={add} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"><Plus size={13} /> Add date</button></div>
        </div>
      </div>

      {(overdue > 0 || upcoming > 0) && (
        <div className="bg-yellow-950/20 border border-yellow-800/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <p className="text-sm">
            {overdue > 0 && <span className="font-semibold text-red-400">{overdue} passed</span>}
            {overdue > 0 && upcoming > 0 && <span> · </span>}
            {upcoming > 0 && <span className="font-semibold text-yellow-300">{upcoming} within 30 days</span>}
            <span className="text-[var(--color-muted)]"> — act before they lapse.</span>
          </p>
        </div>
      )}

      {enriched.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Contract", "Event", "Counterparty", "Date", "Countdown", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {enriched.map(d => {
                const t = tone(d.days);
                return (
                  <tr key={d.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{d.contract}{d.note ? <span className="block text-[10px] text-[var(--color-muted)]">{d.note}</span> : null}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{d.kind}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{d.counterparty || "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{format(new Date(d.date), "d MMM yyyy")}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${t.txt}`}>{d.days < 0 ? `${Math.abs(d.days)}d ago` : `in ${d.days}d`}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${t.badge}`}>{t.label}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setDates(prev => prev.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Dates are entered manually from your reading of the contract — double-check the clause wording for notice periods, which are often counted in calendar vs business days.</p>
    </div>
  );
}

// ── Invoice / Bill Filing Tracker ────────────────────────────────────────────────
// A simple "is this bill physically filed?" register: capture the bill, mark it
// received → filed, and tag where the hard/soft copy lives. Closes the paper gap.
type FilingItem = {
  id: string;
  vendor: string;
  billNo: string;
  amount: number;
  billDate: string;
  location: string;
  status: "to-file" | "filed";
  filedAt?: string;
};

function BillFilingTracker() {
  const [items, setItems] = useFeatureState<FilingItem[]>("doc-filing-items", []);
  const [vendor, setVendor] = useState("");
  const [billNo, setBillNo] = useState("");
  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [location, setLocation] = useState("");
  const [tab, setTab] = useState<"to-file" | "filed">("to-file");
  const fc = formatCurrency;

  const add = () => {
    if (!vendor) { toast.error("Enter a vendor"); return; }
    setItems(prev => [{
      id: crypto.randomUUID(), vendor, billNo, amount: parseFloat(amount) || 0,
      billDate, location, status: "to-file",
    }, ...prev]);
    setVendor(""); setBillNo(""); setAmount(""); setLocation("");
    toast.success("Bill added to filing queue");
  };
  const markFiled = (id: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, status: "filed", filedAt: new Date().toISOString() } : i));
  const unfile = (id: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, status: "to-file", filedAt: undefined } : i));

  const toFile = items.filter(i => i.status === "to-file");
  const filed = items.filter(i => i.status === "filed");
  const shown = tab === "to-file" ? toFile : filed;
  const pendingValue = toFile.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Archive size={14} className="text-[var(--color-primary)]" /> Invoice / Bill Filing Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log every purchase bill the moment it arrives and mark it once it's filed — note whether the copy sits in a folder, a drive or the vault — so audit season has no missing vouchers.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={INP} />
          <input value={billNo} onChange={e => setBillNo(e.target.value)} placeholder="Bill / invoice no." className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Bill date</label>
            <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className={INP} />
          </div>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Where filed (folder / drive)" className={INP} />
          <div className="flex items-end"><button onClick={add} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"><Plus size={13} /> Add bill</button></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "To be filed", value: String(toFile.length), color: toFile.length > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Pending value", value: fc(pendingValue), color: "text-orange-400" },
          { label: "Filed", value: String(filed.length), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {(["to-file", "filed"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-xs px-3 py-1.5 rounded font-medium capitalize transition-colors ${tab === t ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {t === "to-file" ? `To file (${toFile.length})` : `Filed (${filed.length})`}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[660px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Vendor", "Bill no.", "Amount", "Bill date", "Location", "", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {shown.map(i => (
                <tr key={i.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{i.vendor}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{i.billNo || "—"}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-orange-400">{i.amount > 0 ? fc(i.amount) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs">{format(new Date(i.billDate), "d MMM yyyy")}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{i.location || "—"}</td>
                  <td className="px-3 py-2.5">
                    {i.status === "to-file"
                      ? <button onClick={() => markFiled(i.id)} className="text-[10px] text-green-400 hover:underline flex items-center gap-1"><CheckCircle2 size={11} /> Mark filed</button>
                      : <span className="text-[10px] text-[var(--color-muted)] flex items-center gap-1"><Archive size={11} /> Filed {i.filedAt ? format(new Date(i.filedAt), "d MMM") : ""} <button onClick={() => unfile(i.id)} className="ml-1 hover:underline">undo</button></span>}
                  </td>
                  <td className="px-3 py-2.5"><button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <Archive size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">{tab === "to-file" ? "Nothing waiting to be filed." : "No bills filed yet."}</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Keep the original tax invoice for every booked bill — ITC and assessments require the source document, not just the ledger entry. Retain for the statutory period.</p>
    </div>
  );
}

// ── Document Approval Flow ───────────────────────────────────────────────────────
// Route a document to an approver with an amount and reason; track pending →
// approved / rejected with a decision note. A lightweight maker-checker for SMBs.
type ApprovalReq = {
  id: string;
  title: string;
  approver: string;
  amount: number;
  reason: string;
  raisedBy: string;
  raisedAt: string;
  status: "pending" | "approved" | "rejected";
  decisionNote: string;
  decidedAt?: string;
};

function ApprovalFlow() {
  const [reqs, setReqs] = useFeatureState<ApprovalReq[]>("doc-approval-reqs", []);
  const [title, setTitle] = useState("");
  const [approver, setApprover] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const fc = formatCurrency;

  const raise = () => {
    if (!title || !approver) { toast.error("Enter a document and approver"); return; }
    setReqs(prev => [{
      id: crypto.randomUUID(), title, approver, amount: parseFloat(amount) || 0, reason,
      raisedBy, raisedAt: new Date().toISOString(), status: "pending", decisionNote: "",
    }, ...prev]);
    setTitle(""); setApprover(""); setAmount(""); setReason(""); setRaisedBy("");
    toast.success("Sent for approval");
  };
  const decide = (id: string, status: "approved" | "rejected") =>
    setReqs(prev => prev.map(r => {
      if (r.id !== id) return r;
      const decisionNote = window.prompt(status === "approved" ? "Approval note (optional)" : "Reason for rejection (optional)") || "";
      return { ...r, status, decisionNote, decidedAt: new Date().toISOString() };
    }));

  const STATUS_STYLE: Record<ApprovalReq["status"], string> = {
    pending: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    approved: "bg-green-900/30 text-green-400 border-green-800/40",
    rejected: "bg-red-900/30 text-red-400 border-red-800/40",
  };
  const pending = reqs.filter(r => r.status === "pending").length;
  const approvedValue = reqs.filter(r => r.status === "approved").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> Document Approval Flow</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Send a bill, contract or payment voucher to the right person for sign-off, with the amount and reason attached. A simple maker-checker trail of who approved what, and when.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Document / request *" className={INP} />
          <input value={approver} onChange={e => setApprover(e.target.value)} placeholder="Approver *" className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)" className={INP} />
          <input value={raisedBy} onChange={e => setRaisedBy(e.target.value)} placeholder="Raised by" className={INP} />
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason / context" className={INP} />
          <div className="flex items-end"><button onClick={raise} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"><Send size={13} /> Send for approval</button></div>
        </div>
      </div>

      {reqs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending", value: String(pending), color: pending > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Approved value", value: fc(approvedValue), color: "text-green-400" },
            { label: "Total requests", value: String(reqs.length), color: "text-[var(--color-text)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {reqs.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Document", "Approver", "Amount", "Raised", "Status", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {reqs.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{r.title}
                    {r.reason ? <span className="block text-[10px] text-[var(--color-muted)]">{r.reason}</span> : null}
                    {r.raisedBy ? <span className="block text-[10px] text-[var(--color-muted)]">by {r.raisedBy}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{r.approver}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-orange-400">{r.amount > 0 ? fc(r.amount) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs">{format(new Date(r.raisedAt), "d MMM")}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    {r.status !== "pending" && r.decisionNote ? <span className="block text-[10px] text-[var(--color-muted)] mt-0.5 max-w-[160px] truncate">{r.decisionNote}</span> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.status === "pending" && <>
                        <button onClick={() => decide(r.id, "approved")} className="text-[10px] text-green-400 hover:underline flex items-center gap-0.5"><ThumbsUp size={10} /> Approve</button>
                        <button onClick={() => decide(r.id, "rejected")} className="text-[10px] text-red-400 hover:underline flex items-center gap-0.5"><XCircle size={10} /> Reject</button>
                      </>}
                      <button onClick={() => setReqs(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <ClipboardCheck size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No approval requests yet.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Approvals here are tracked by name for an internal trail — for binding authorisation tie each decision to an authenticated user and your delegation-of-authority matrix.</p>
    </div>
  );
}
