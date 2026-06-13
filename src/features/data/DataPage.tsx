import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { generateDemoData } from "@/lib/demoData";
import { Database, Upload, Download, FileSpreadsheet, Sparkles, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import TransactionImportModal from "@/components/TransactionImportModal";
import type { Transaction } from "@/data/types";

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const { store, setStore, canAccess, canEdit } = useApp();
  const navigate = useNavigate();
  const [showImport, setShowImport] = useState(false);

  if (!canAccess("data")) return <Navigate to="/dashboard" replace />;

  const editable = canEdit();
  const importAccountId = store.bankAccounts[0]?.id ?? "manual-import";

  const handleImport = (txns: Transaction[]) => {
    setStore(s => {
      // Ensure there's an account to attach imported rows to
      const accounts = s.bankAccounts.length > 0 ? s.bankAccounts : [{
        id: "manual-import", name: "Imported (manual)", provider: "manual", balance: 0,
        lastSync: new Date().toISOString(), status: "connected" as const,
      }];
      return { ...s, bankAccounts: accounts, transactions: [...txns, ...s.transactions] };
    });
  };

  const loadDemo = () => {
    if (!window.confirm("Load the FY23–FY28 demo dataset? This replaces your current transactions, invoices, accounts, loans and obligations with realistic sample data.")) return;
    const demo = generateDemoData();
    setStore(s => ({
      ...s,
      firm: { ...s.firm, ...demo.firm },
      bankAccounts: demo.bankAccounts ?? s.bankAccounts,
      transactions: demo.transactions ?? s.transactions,
      invoices: demo.invoices ?? s.invoices,
      activeLoans: demo.activeLoans ?? s.activeLoans,
      obligations: demo.obligations ?? s.obligations,
    }));
    toast.success(`Loaded ${demo.transactions?.length ?? 0} transactions across FY23–FY28`);
  };

  const clearAll = () => {
    if (!window.confirm("Clear ALL financial data (transactions, invoices, accounts, loans)? This cannot be undone.")) return;
    setStore(s => ({ ...s, transactions: [], invoices: [], bankAccounts: [], activeLoans: [], obligations: [] }));
    toast.success("All financial data cleared");
  };

  const txnTemplate = "date,amount,description,counterparty\n01/06/2026,250000,Client payment,Mehta Corp\n03/06/2026,-120000,Office rent,Landlord\n05/06/2026,-410000,Monthly payroll,Team\n";
  const invTemplate = "customer,amount,invoice_number,invoice_date,due_date,status\nMehta Corp,250000,INV-001,01/06/2026,01/07/2026,pending\n";

  const stats = [
    { label: "Transactions", value: store.transactions.length },
    { label: "Invoices", value: store.invoices.length },
    { label: "Bank accounts", value: store.bankAccounts.length },
    { label: "Active loans", value: store.activeLoans.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Database size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Data &amp; Import</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Bring your numbers in fast — upload a CSV, load sample data, or edit in bulk.</p>
        </div>
      </div>

      {/* Current data snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{s.value}</p>
          </div>
        ))}
      </div>

      {!editable && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-3 text-sm">
          Your role has read-only access — importing and editing are disabled.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bulk CSV import */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Bulk import transactions</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Upload a bank/accounting CSV. We auto-detect date, amount and description columns, guess categories, and let you preview before committing.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!editable} onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40">
              <Upload size={13} /> Upload CSV
            </button>
            <button onClick={() => downloadCsv("transactions-template.csv", txnTemplate)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
              <Download size={13} /> Template
            </button>
          </div>
        </div>

        {/* Demo data */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Load sample data · FY23–FY28</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Populate the whole app with six years of realistic financials — revenue, payroll, GST, a loan and live invoices — so every statement, chart and forecast comes to life.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!editable} onClick={loadDemo}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40">
              <Sparkles size={13} /> Load demo data
            </button>
            <button disabled={!editable} onClick={clearAll}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-red-400 disabled:opacity-40">
              <Trash2 size={13} /> Clear all
            </button>
          </div>
        </div>

        {/* Bulk edit */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Pencil size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Edit in bulk</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Select many transactions and re-categorise them at once, or save a rule so every future row from a vendor is categorised automatically.</p>
          <button onClick={() => navigate("/transactions")}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-2 rounded-lg hover:border-[var(--color-primary)]">
            Open Transactions →
          </button>
        </div>

        {/* CSV templates */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">CSV templates</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Start from a correctly-formatted file. Dates accept DD/MM/YYYY; negative amounts are expenses.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadCsv("transactions-template.csv", txnTemplate)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
              <Download size={13} /> Transactions
            </button>
            <button onClick={() => downloadCsv("invoices-template.csv", invTemplate)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
              <Download size={13} /> Invoices
            </button>
          </div>
        </div>
      </div>

      {showImport && (
        <TransactionImportModal
          bankAccountId={importAccountId}
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}
    </div>
  );
}
