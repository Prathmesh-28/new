import { useState, useRef } from "react";
import { FolderOpen, Upload, FileText, FileImage, File, Search, Tag, Trash2, Download, Eye, Plus, Lock, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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

const CATEGORIES: { id: DocCategory; label: string; color: string; bg: string }[] = [
  { id: "gst",     label: "GST",        color: "text-orange-400", bg: "bg-orange-950/30 border-orange-800/30" },
  { id: "banking", label: "Banking",    color: "text-blue-400",   bg: "bg-blue-950/30 border-blue-800/30"   },
  { id: "legal",   label: "Legal",      color: "text-purple-400", bg: "bg-purple-950/30 border-purple-800/30"},
  { id: "tax",     label: "Tax / IT",   color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-800/30"},
  { id: "payroll", label: "Payroll",    color: "text-green-400",  bg: "bg-green-950/30 border-green-800/30"  },
  { id: "other",   label: "Other",      color: "text-[var(--color-muted)]", bg: "bg-[var(--color-accent)]"  },
];

const INITIAL_DOCS: Doc[] = [
  { id: "d1", name: "GSTIN Registration Certificate.pdf",  category: "gst",     size: "245 KB", uploadedAt: new Date(2025, 3, 10), status: "valid",    tags: ["GST", "Registration"], type: "pdf",   expiresAt: new Date(2027, 3, 10) },
  { id: "d2", name: "HDFC Current Account Statement.pdf",  category: "banking", size: "1.2 MB", uploadedAt: new Date(2026, 4, 1),  status: "uploaded", tags: ["HDFC", "Statement"],   type: "pdf"   },
  { id: "d3", name: "Company PAN Card.pdf",                category: "legal",   size: "88 KB",  uploadedAt: new Date(2024, 8, 15), status: "valid",    tags: ["PAN", "Identity"],     type: "pdf"   },
  { id: "d4", name: "MOA & AOA.pdf",                       category: "legal",   size: "3.4 MB", uploadedAt: new Date(2023, 1, 20), status: "valid",    tags: ["Incorporation"],       type: "pdf"   },
  { id: "d5", name: "Form 16 FY2024-25.pdf",               category: "tax",     size: "512 KB", uploadedAt: new Date(2025, 5, 10), status: "valid",    tags: ["Form 16", "ITR"],      type: "pdf"   },
  { id: "d6", name: "June 2026 Payroll Register.xlsx",     category: "payroll", size: "78 KB",  uploadedAt: new Date(2026, 5, 1),  status: "uploaded", tags: ["Payroll", "Jun 2026"], type: "excel" },
  { id: "d7", name: "Trade License 2026.pdf",              category: "legal",   size: "190 KB", uploadedAt: new Date(2026, 0, 5),  expiresAt: new Date(2026, 11, 31), status: "expiring", tags: ["License"], type: "pdf" },
  { id: "d8", name: "Shop Act Registration.pdf",           category: "legal",   size: "110 KB", uploadedAt: new Date(2025, 9, 1),  expiresAt: new Date(2026, 8, 30),  status: "valid",   tags: ["Shop Act"],type: "pdf" },
];

function genId() { return Math.random().toString(36).slice(2, 9); }

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

function UploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (doc: Doc) => void }) {
  const [name, setName]         = useState("");
  const [category, setCategory] = useState<DocCategory>("other");
  const [tags, setTags]         = useState("");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiry, setExpiry]     = useState("");
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    if (!name) setName(f.name);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = () => {
    if (!name) { toast.error("Enter a document name"); return; }
    const doc: Doc = {
      id: genId(),
      name: name.endsWith(".pdf") || name.includes(".") ? name : name + ".pdf",
      category,
      size: file ? `${(file.size / 1024).toFixed(0)} KB` : "—",
      uploadedAt: new Date(),
      expiresAt: hasExpiry && expiry ? new Date(expiry) : undefined,
      status: hasExpiry && expiry ? "valid" : "uploaded",
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      type: "pdf",
    };
    onUpload(doc);
    toast.success("Document uploaded");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">Upload document</h2>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>

        {/* Drop zone */}
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
                <p className="text-xs text-[var(--color-muted)] mt-0.5">PDF, image, Excel, Word — max 20 MB</p>
              </>
          }
          <input ref={inputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
            className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 flex items-center justify-center gap-1.5"
          >
            <Upload size={13} /> Upload
          </button>
          <button onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const [docs, setDocs]           = useState<Doc[]>(INITIAL_DOCS);
  const [query, setQuery]         = useState("");
  const [catFilter, setCatFilter] = useState<DocCategory | "all">("all");
  const [showUpload, setShowUpload] = useState(false);

  const addDoc = (doc: Doc) => setDocs(d => [doc, ...d]);
  const deleteDoc = (id: string) => {
    setDocs(d => d.filter(doc => doc.id !== id));
    toast.success("Document removed");
  };

  const filtered = docs.filter(d => {
    const q = query.toLowerCase();
    const matchQ = !q || d.name.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
    const matchC = catFilter === "all" || d.category === catFilter;
    return matchQ && matchC;
  });

  const expiring  = docs.filter(d => d.status === "expiring").length;
  const expired   = docs.filter(d => d.status === "expired").length;
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
            GST certificates, bank statements, legal docs — all in one secure place your CA can access.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-semibold hover:opacity-90 transition-all"
        >
          <Plus size={13} /> Upload document
        </button>
      </div>

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
            <p className="text-xs font-semibold">CA access</p>
            <p className="text-xs text-[var(--color-muted)]">shared with advisor</p>
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

          {filtered.length === 0 && (
            <div className="py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              <File size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
              <p className="text-sm text-[var(--color-muted)]">No documents found</p>
            </div>
          )}

          {filtered.map(doc => {
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
                      onClick={() => toast("Preview not available in demo")}
                      className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors rounded"
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => toast("Download not available in demo")}
                      className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors rounded"
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => deleteDoc(doc.id)}
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

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUpload={addDoc} />}
    </div>
  );
}
