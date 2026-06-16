import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useFeatureState } from "@/hooks/useFeatureState";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import {
  Package, ShoppingCart, Truck, Plus, X, MessageCircle,
  Mail, FileSpreadsheet, Phone, CheckCircle2, Clock, AlertTriangle,
  Radar, Copy, TrendingUp, ArrowUpRight, UserPlus, Download,
  Layers, CalendarClock, Wrench, Factory, Warehouse, ScanLine, Route,
  ArrowDownCircle, ArrowUpCircle,
  PieChart, Calculator, Repeat, Percent, Ship, ClipboardCheck, Trash2, Undo2,
  Scale, ShieldCheck, Coins, Hourglass, AlertOctagon,
  ListChecks, SlidersHorizontal, Boxes, Ban,
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { toast } from "sonner";
import type { Order, OrderSource, InventoryItem, ProcurementOrder } from "@/data/types";
import { callNumber, whatsappTo, smsNumber } from "@/lib/nativeFeatures";
import { detectAnomalies, type Anomaly } from "@/lib/anomalies";

type Tab = "overview" | "orders" | "inventory" | "procurement" | "intelligence" | "prices" | "bom" | "leadtime" | "reorder" | "payables"
  | "stockledger" | "batchtrack" | "jobwork" | "production" | "warehouse" | "stocktake" | "dispatch"
  | "abc" | "eoq" | "turnover" | "skumargin" | "landed" | "grn" | "scrap" | "returns"
  | "valuation" | "safetystock" | "carrying" | "aging" | "stockout"
  | "cyclecount" | "minmax" | "whutil" | "oversell";

const SOURCE_ICON: Record<OrderSource, React.ReactNode> = {
  whatsapp: <MessageCircle size={13} className="text-green-400" />,
  email:    <Mail size={13} className="text-blue-400" />,
  excel:    <FileSpreadsheet size={13} className="text-emerald-400" />,
  manual:   <Plus size={13} className="text-[var(--color-muted)]" />,
  phone:    <Phone size={13} className="text-purple-400" />,
};

const STATUS_COLOR: Record<string, string> = {
  pending:    "bg-yellow-900/20 text-yellow-400 border-yellow-800/30",
  confirmed:  "bg-blue-900/20 text-blue-400 border-blue-800/30",
  processing: "bg-purple-900/20 text-purple-400 border-purple-800/30",
  dispatched: "bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/30",
  delivered:  "bg-green-900/20 text-green-400 border-green-800/30",
  cancelled:  "bg-red-900/20 text-red-400 border-red-800/30",
};

const PO_STATUS_COLOR: Record<string, string> = {
  draft:     "text-[var(--color-muted)]",
  approved:  "text-blue-400",
  ordered:   "text-[var(--color-primary)]",
  received:  "text-green-400",
  cancelled: "text-red-400",
};

const ANOMALY_META: Record<Anomaly["type"], { Icon: React.ElementType; label: string }> = {
  duplicate:          { Icon: Copy,        label: "Duplicate" },
  spike:              { Icon: TrendingUp,  label: "Spike" },
  subscription_creep: { Icon: ArrowUpRight, label: "Creep" },
  new_vendor:         { Icon: UserPlus,    label: "New payee" },
};
const SEV_STYLE: Record<Anomaly["severity"], string> = {
  high:   "border-red-700/50 bg-red-950/15",
  medium: "border-orange-700/40 bg-orange-950/10",
  low:    "border-[var(--color-border)]",
};
const SEV_DOT: Record<Anomaly["severity"], string> = {
  high: "bg-red-400", medium: "bg-orange-400", low: "bg-[var(--color-muted)]",
};

export default function OperationsPage() {
  const { store, addOrder, updateOrder, deleteOrder, addInventoryItem, deleteInventoryItem, addProcurement, updateProcurement } = useApp();
  const { orders, inventory, procurement, transactions } = store;
  const [tab, setTab] = useState<Tab>("overview");

  // Real anomaly radar over the tenant's transactions (see src/lib/anomalies.ts).
  const anomalies = useMemo(() => detectAnomalies(transactions), [transactions]);

  // Order form state
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [buyerName,     setBuyerName]     = useState("");
  const [buyerPhone,    setBuyerPhone]    = useState("");
  const [source,        setSource]        = useState<OrderSource>("manual");
  const [itemName,      setItemName]      = useState("");
  const [itemQty,       setItemQty]       = useState("1");
  const [itemPrice,     setItemPrice]     = useState("");

  // Inventory form state
  const [showInvForm,   setShowInvForm]   = useState(false);
  const [invName,       setInvName]       = useState("");
  const [invSku,        setInvSku]        = useState("");
  const [invQty,        setInvQty]        = useState("0");
  const [invCost,       setInvCost]       = useState("");
  const [invReorder,    setInvReorder]    = useState("10");
  const [invCat,        setInvCat]        = useState("general");

  // Procurement form state
  const [showPoForm,    setShowPoForm]    = useState(false);
  const [supplierName,  setSupplierName]  = useState("");
  const [expectedDate,  setExpectedDate]  = useState("");
  const [poItemName,    setPoItemName]    = useState("");
  const [poItemQty,     setPoItemQty]     = useState("1");
  const [poItemCost,    setPoItemCost]    = useState("");

  const totalOrderValue  = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.totalValue, 0);
  const pendingOrders    = orders.filter(o => o.status === "pending").length;
  const lowStockItems    = inventory.filter(i => i.quantity <= i.reorderLevel);
  const totalInventoryVal= inventory.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  const handleAddOrder = () => {
    if (!buyerName || !itemName || !itemPrice) { toast.error("Fill buyer name, item name, and price"); return; }
    const total = Number(itemQty) * Number(itemPrice);
    addOrder({
      id: generateId(), orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
      source, buyerName, buyerPhone, status: "pending", totalValue: total, notes: "",
      items: [{ id: generateId(), productName: itemName, sku: "", quantity: Number(itemQty), unitPrice: Number(itemPrice) }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    toast.success("Order added");
    setBuyerName(""); setBuyerPhone(""); setItemName(""); setItemQty("1"); setItemPrice("");
    setShowOrderForm(false);
  };

  const handleStatusChange = (o: Order, status: Order["status"]) => {
    updateOrder({ ...o, status, updatedAt: new Date().toISOString() });
    if (status === "confirmed") toast.success("Order confirmed — revenue transaction created");
    else toast.success(`Order ${status}`);
  };

  const handleAddInventory = () => {
    if (!invName) { toast.error("Product name required"); return; }
    addInventoryItem({ id: generateId(), productName: invName, sku: invSku, category: invCat, quantity: Number(invQty), unit: "units", unitCost: Number(invCost), reorderLevel: Number(invReorder), updatedAt: new Date().toISOString() });
    toast.success("Product added to inventory");
    setInvName(""); setInvSku(""); setInvQty("0"); setInvCost(""); setInvReorder("10"); setInvCat("general");
    setShowInvForm(false);
  };

  const handleCreatePo = () => {
    if (!supplierName || !poItemName || !poItemCost) { toast.error("Fill supplier name and at least one item"); return; }
    const total = Number(poItemQty) * Number(poItemCost);
    addProcurement({ id: generateId(), supplierName, status: "draft", totalValue: total, expectedDate, items: [{ productName: poItemName, sku: "", quantity: Number(poItemQty), unitCost: Number(poItemCost) }], createdAt: new Date().toISOString() });
    toast.success("Purchase order created");
    setSupplierName(""); setPoItemName(""); setPoItemQty("1"); setPoItemCost(""); setExpectedDate("");
    setShowPoForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Operations Hub</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">Orders · Inventory · Procurement · Anomaly Radar</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-900/20 border border-green-800/30 px-2.5 py-1.5 rounded-lg">
            <MessageCircle size={11} /> WhatsApp active
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([
          ["overview",      "Overview",     null],
          ["orders",        "Orders",       pendingOrders > 0 ? pendingOrders : null],
          ["inventory",     "Inventory",    lowStockItems.length > 0 ? lowStockItems.length : null],
          ["procurement",   "Procurement",  null],
          ["intelligence",  "Anomaly Radar", null],
          ["prices",        "Price List",    null],
          ["bom",           "BOM Costing",   null],
          ["leadtime",      "Lead Time",     null],
          ["reorder",       "Reorder Alert", null],
          ["payables",      "Aged Payables", null],
          ["stockledger",   "Stock Ledger",  null],
          ["batchtrack",    "Batch / Expiry", null],
          ["jobwork",       "Job-Work",      null],
          ["production",    "Production",    null],
          ["warehouse",     "Warehouses",    null],
          ["stocktake",     "Stock Take",    null],
          ["dispatch",      "Dispatch",      null],
          ["abc",           "ABC Analysis",  null],
          ["eoq",           "EOQ Calc",      null],
          ["turnover",      "Stock Turnover", null],
          ["skumargin",     "Margin / SKU",  null],
          ["landed",        "Landed Cost",   null],
          ["grn",           "GRN vs PO",     null],
          ["scrap",         "Scrap / Wastage", null],
          ["returns",       "Returns / RTV", null],
          ["valuation",     "Stock Valuation", null],
          ["safetystock",   "Safety Stock", null],
          ["carrying",      "Carrying Cost", null],
          ["aging",         "Stock Aging", null],
          ["stockout",      "Stockout Cost", null],
          ["cyclecount",    "Cycle Count", null],
          ["minmax",        "Min/Max Plan", null],
          ["whutil",        "Warehouse Use", null],
          ["oversell",      "Oversell Guard", null],
        ] as [Tab, string, number | null][]).map(([id, label, badge]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
            {badge !== null && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">{badge}</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total Order Value",    value: formatCurrency(totalOrderValue),   icon: ShoppingCart,   color: "text-[var(--color-primary)]" },
              { label: "Pending Orders",       value: pendingOrders.toString(),          icon: Clock,          color: "text-yellow-400" },
              { label: "Inventory Value",      value: formatCurrency(totalInventoryVal), icon: Package,        color: "text-blue-400" },
              { label: "Low Stock Alerts",     value: lowStockItems.length.toString(),   icon: AlertTriangle,  color: "text-red-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[var(--color-muted)]">{label}</p>
                  <Icon size={14} className={color} />
                </div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* WhatsApp integration card */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-900/30 rounded-lg flex items-center justify-center shrink-0">
                <MessageCircle size={20} className="text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1">WhatsApp Order Capture</h3>
                <p className="text-sm text-[var(--color-muted)] mb-3">
                  Share your business WhatsApp number with distributors and retailers. Every order message is automatically parsed and added here — no manual entry needed.
                </p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "All message formats", icon: "📱" },
                    { label: "Mixed-language support", icon: "🇮🇳" },
                    { label: "Auto-confirmed + receipt", icon: "✅" },
                  ].map(({ label, icon }) => (
                    <div key={label} className="bg-[var(--color-bg)] rounded-lg p-2 border border-[var(--color-border)]">
                      <p className="text-lg">{icon}</p>
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-3">
                  To activate: go to <strong className="text-[var(--color-text)]">Connectors</strong> and set up your WhatsApp Business number via Twilio or Wati.
                </p>
              </div>
            </div>
          </div>

          {/* Recent orders preview */}
          {orders.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Recent Orders</h3>
              <div className="space-y-2">
                {orders.slice(0, 5).map(o => (
                  <div key={o.id} className="flex items-center justify-between text-sm py-1">
                    <div className="flex items-center gap-2">
                      {SOURCE_ICON[o.source]}
                      <span className="font-medium">{o.buyerName}</span>
                      <span className="text-xs text-[var(--color-muted)]">#{o.orderNumber}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-[var(--color-primary)]">{formatCurrency(o.totalValue)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[o.status]}`}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ORDERS ── */}
      {tab === "orders" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-muted)]">{orders.length} total orders</p>
            <button onClick={() => setShowOrderForm(v => !v)}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
              <Plus size={12} /> Add Order
            </button>
          </div>

          {showOrderForm && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">New Order</h2>
                <button onClick={() => setShowOrderForm(false)}><X size={16} className="text-[var(--color-muted)]" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Buyer / distributor name" value={buyerName} onChange={e => setBuyerName(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <input placeholder="Phone (optional)" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="Product name" value={itemName} onChange={e => setItemName(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="number" min="1" placeholder="Qty" value={itemQty} onChange={e => setItemQty(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="number" min="0" placeholder="Unit price (₹)" value={itemPrice} onChange={e => setItemPrice(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-muted)]">Source:</span>
                {(["manual","whatsapp","email","phone"] as OrderSource[]).map(s => (
                  <button key={s} onClick={() => setSource(s)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all ${source === s ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                    {SOURCE_ICON[s]}{s}
                  </button>
                ))}
              </div>
              <button onClick={handleAddOrder} className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">Add Order</button>
            </div>
          )}

          {orders.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <ShoppingCart size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
              <p className="text-sm text-[var(--color-muted)] mb-4">No orders yet. Add manually or connect WhatsApp to capture them automatically.</p>
              <button onClick={() => setShowOrderForm(true)} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">Add First Order</button>
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {["Source","Order #","Buyer","Value","Status","Actions"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] transition-colors">
                      <td className="px-4 py-3">{SOURCE_ICON[o.source]}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted)]">{o.orderNumber}</td>
                      <td className="px-4 py-3 font-medium">{o.buyerName}</td>
                      <td className="px-4 py-3 font-bold text-[var(--color-primary)]">{formatCurrency(o.totalValue)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[o.status]}`}>{o.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {o.buyerPhone && (
                            <>
                              <button onClick={() => callNumber(o.buyerPhone)} title="Call buyer"
                                className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] rounded"><Phone size={13} /></button>
                              <button onClick={() => whatsappTo(o.buyerPhone, `Hi ${o.buyerName}, regarding your order ${o.orderNumber} (${formatCurrency(o.totalValue)}).`)} title="WhatsApp buyer"
                                className="p-1 text-[var(--color-muted)] hover:text-green-400 rounded"><MessageCircle size={13} /></button>
                              <button onClick={() => smsNumber(o.buyerPhone, `Hi ${o.buyerName}, regarding order ${o.orderNumber} (${formatCurrency(o.totalValue)}).`)} title="SMS buyer"
                                className="p-1 text-[var(--color-muted)] hover:text-blue-400 rounded"><Mail size={13} /></button>
                            </>
                          )}
                          {o.status === "pending"   && <button onClick={() => handleStatusChange(o, "confirmed")}  className="text-xs bg-blue-900/30 text-blue-400 border border-blue-800/30 px-2 py-0.5 rounded hover:bg-blue-900/50">Confirm</button>}
                          {o.status === "confirmed" && <button onClick={() => handleStatusChange(o, "dispatched")} className="text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded">Dispatch</button>}
                          {o.status === "dispatched"&& <button onClick={() => handleStatusChange(o, "delivered")}  className="text-xs bg-green-900/30 text-green-400 border border-green-800/30 px-2 py-0.5 rounded">Delivered</button>}
                          {!["delivered","cancelled"].includes(o.status) && <button onClick={() => deleteOrder(o.id)} className="text-xs text-[var(--color-muted)] hover:text-red-400 ml-1">✕</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── INVENTORY ── */}
      {tab === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--color-muted)]">{inventory.length} SKUs · {formatCurrency(totalInventoryVal)} total value</p>
              {lowStockItems.length > 0 && <p className="text-xs text-red-400 mt-0.5">{lowStockItems.length} items below reorder level</p>}
            </div>
            <button onClick={() => setShowInvForm(v => !v)}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
              <Plus size={12} /> Add Product
            </button>
          </div>

          {showInvForm && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Add Product</h2>
                <button onClick={() => setShowInvForm(false)}><X size={16} className="text-[var(--color-muted)]" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Product name *" value={invName} onChange={e => setInvName(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input placeholder="SKU (optional)" value={invSku} onChange={e => setInvSku(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="number" min="0" placeholder="Current quantity" value={invQty} onChange={e => setInvQty(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="number" min="0" placeholder="Unit cost (₹)" value={invCost} onChange={e => setInvCost(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="number" min="0" placeholder="Reorder level" value={invReorder} onChange={e => setInvReorder(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <select value={invCat} onChange={e => setInvCat(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                  {["general","fmcg","pharma","electronics","apparel","food","raw_material"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={handleAddInventory} className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">Add Product</button>
            </div>
          )}

          {inventory.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <Package size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
              <p className="text-sm text-[var(--color-muted)] mb-4">No products yet. Add SKUs to track stock levels and get low-inventory alerts.</p>
              <button onClick={() => setShowInvForm(true)} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">Add First Product</button>
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {["SKU","Product","Qty","Unit Cost","Value","Reorder","Status",""].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item: InventoryItem) => {
                    const isLow = item.quantity <= item.reorderLevel;
                    const isOut = item.quantity === 0;
                    return (
                      <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{item.sku || "—"}</td>
                        <td className="px-4 py-2.5 font-medium">{item.productName}</td>
                        <td className={`px-4 py-2.5 font-bold ${isOut ? "text-red-400" : isLow ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{item.quantity}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">{formatCurrency(item.unitCost)}</td>
                        <td className="px-4 py-2.5 text-[var(--color-primary)]">{formatCurrency(item.quantity * item.unitCost)}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">{item.reorderLevel}</td>
                        <td className="px-4 py-2.5">
                          {isOut  ? <span className="text-xs text-red-400 font-semibold">Out of stock</span> :
                           isLow  ? <span className="text-xs text-yellow-400 flex items-center gap-1"><AlertTriangle size={10} />Low stock</span> :
                                    <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={10} />OK</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => deleteInventoryItem(item.id)} className="text-xs text-[var(--color-muted)] hover:text-red-400">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── SLOW / DEAD STOCK ── */}
      {tab === "inventory" && inventory.length > 0 && (() => {
        // Map last sale date per product from orders
        const lastSaleDate: Record<string, string> = {};
        orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o => {
          o.items.forEach(item => {
            const prev = lastSaleDate[item.productName];
            if (!prev || o.createdAt > prev) lastSaleDate[item.productName] = o.createdAt;
          });
        });
        const today = new Date();
        const slowItems = inventory.map(item => {
          const last = lastSaleDate[item.productName];
          const daysSinceSale = last
            ? Math.floor((today.getTime() - new Date(last).getTime()) / 86400000)
            : null;
          const stockValue = item.quantity * item.unitCost;
          const category: "dead" | "slow" | "active" | "unsold" =
            daysSinceSale === null ? "unsold"
            : daysSinceSale > 180 ? "dead"
            : daysSinceSale > 60  ? "slow"
            : "active";
          return { ...item, daysSinceSale, stockValue, category };
        }).filter(i => i.category === "dead" || i.category === "slow" || i.category === "unsold");

        if (slowItems.length === 0) return null;
        const deadValue = slowItems.filter(i => i.category === "dead" || i.category === "unsold").reduce((s, i) => s + i.stockValue, 0);

        const CAT_STYLE: Record<string, string> = {
          dead:   "bg-red-950/30 text-red-400 border-red-800/30",
          slow:   "bg-yellow-950/30 text-yellow-400 border-yellow-800/30",
          unsold: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
        };

        return (
          <div className="bg-[var(--color-surface)] border border-orange-800/30 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
              <AlertTriangle size={13} className="text-orange-400" />
              <h3 className="text-sm font-semibold">Slow / Dead Stock</h3>
              <span className="text-xs text-[var(--color-muted)] ml-1">{slowItems.length} SKUs · ₹{(deadValue / 100000).toFixed(1)}L tied up</span>
            </div>
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Product","Stock","Value","Last Sold","Status"].map(h => (
                    <th key={h} className="text-left text-[var(--color-muted)] font-semibold px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slowItems.map(item => (
                  <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium">{item.productName}</td>
                    <td className="px-4 py-2.5 tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(item.stockValue)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">
                      {item.daysSinceSale !== null ? `${item.daysSinceSale}d ago` : "Never sold"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CAT_STYLE[item.category]}`}>
                        {item.category === "dead" ? "Dead (>180d)" : item.category === "slow" ? "Slow (60–180d)" : "Never sold"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── REORDER POINT CALCULATOR ── */}
      {tab === "inventory" && inventory.length > 0 && (() => {
        // Compute avg monthly units sold per product from confirmed/delivered orders
        const salesByProduct: Record<string, number> = {};
        orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o => {
          o.items.forEach(item => {
            salesByProduct[item.productName] = (salesByProduct[item.productName] ?? 0) + item.quantity;
          });
        });
        const monthsOfData = Math.max(1, Object.keys(salesByProduct).length > 0 ? 3 : 1);
        const reorderItems = inventory.map(item => {
          const totalSold   = salesByProduct[item.productName] ?? 0;
          const dailyDemand = totalSold / (monthsOfData * 30);
          const leadTimeDays = 7; // default 7-day supplier lead time
          const safetyStock  = Math.ceil(dailyDemand * leadTimeDays);
          const reorderPoint = Math.ceil(dailyDemand * leadTimeDays + safetyStock);
          const daysUntilOut = dailyDemand > 0 ? Math.floor(item.quantity / dailyDemand) : null;
          return { ...item, dailyDemand, reorderPoint, safetyStock, daysUntilOut, needsReorder: item.quantity <= Math.max(reorderPoint, item.reorderLevel) };
        }).filter(i => i.needsReorder || i.daysUntilOut !== null);

        if (reorderItems.length === 0) return null;
        return (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
              <TrendingUp size={13} className="text-[var(--color-primary)]" />
              <h3 className="text-sm font-semibold">Reorder Point Calculator</h3>
              <span className="text-[10px] text-[var(--color-muted)] ml-1">Based on order history · 7d default lead time</span>
            </div>
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Product","Stock","Daily Demand","Reorder Point","Days Until Stockout","Action"].map(h => (
                    <th key={h} className="text-left text-[var(--color-muted)] font-semibold px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reorderItems.map(item => (
                  <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium">{item.productName}</td>
                    <td className={`px-4 py-2.5 font-bold tabular-nums ${item.quantity === 0 ? "text-red-400" : item.quantity <= item.reorderLevel ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{item.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{item.dailyDemand > 0 ? `${item.dailyDemand.toFixed(1)}/day` : "No history"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-blue-400 font-semibold">{item.reorderPoint > 0 ? item.reorderPoint : item.reorderLevel}</td>
                    <td className="px-4 py-2.5">
                      {item.daysUntilOut === null ? (
                        <span className="text-[var(--color-muted)]">—</span>
                      ) : item.daysUntilOut <= 7 ? (
                        <span className="text-red-400 font-bold">{item.daysUntilOut}d ⚠</span>
                      ) : item.daysUntilOut <= 14 ? (
                        <span className="text-yellow-400 font-semibold">{item.daysUntilOut}d</span>
                      ) : (
                        <span className="text-[var(--color-muted)]">{item.daysUntilOut}d</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => { setTab("procurement"); setShowPoForm(true); setPoItemName(item.productName); setPoItemCost(String(item.unitCost)); setPoItemQty(String(Math.max(item.reorderLevel * 2, 20))); }}
                        className="text-xs text-[var(--color-primary)] hover:underline whitespace-nowrap">
                        Create PO →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── PROCUREMENT ── */}
      {tab === "procurement" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-muted)]">{procurement.length} purchase orders</p>
            <button onClick={() => setShowPoForm(v => !v)}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
              <Plus size={12} /> Create PO
            </button>
          </div>

          {/* Low-stock suggestions */}
          {lowStockItems.length > 0 && (
            <div className="bg-yellow-950/20 border border-yellow-800/30 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><AlertTriangle size={11} /> AI Procurement Suggestions</h3>
              <div className="space-y-2">
                {lowStockItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text)]">{item.productName} <span className="text-yellow-400">({item.quantity} left, reorder at {item.reorderLevel})</span></span>
                    <button onClick={() => {
                      setShowPoForm(true);
                      setPoItemName(item.productName);
                      setPoItemQty(String(Math.max(item.reorderLevel * 2, 50)));
                      setPoItemCost(String(item.unitCost));
                    }} className="text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded hover:bg-[var(--color-primary)]/30">
                      Create PO
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showPoForm && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Create Purchase Order</h2>
                <button onClick={() => setShowPoForm(false)}><X size={16} className="text-[var(--color-muted)]" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Supplier name *" value={supplierName} onChange={e => setSupplierName(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input placeholder="Product name" value={poItemName} onChange={e => setPoItemName(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="number" min="1" placeholder="Qty" value={poItemQty} onChange={e => setPoItemQty(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="number" min="0" placeholder="Unit cost (₹)" value={poItemCost} onChange={e => setPoItemCost(e.target.value)} className="col-span-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              {poItemQty && poItemCost && <p className="text-xs text-[var(--color-muted)]">Total: {formatCurrency(Number(poItemQty) * Number(poItemCost))}</p>}
              <button onClick={handleCreatePo} className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">Create Draft PO</button>
            </div>
          )}

          {procurement.length === 0 && !showPoForm ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <Truck size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
              <p className="text-sm text-[var(--color-muted)] mb-4">No purchase orders yet. Add inventory items first and Headroom will auto-suggest POs when stock is low.</p>
              <button onClick={() => setShowPoForm(true)} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">Create First PO</button>
            </div>
          ) : (
            <div className="space-y-3">
              {procurement.map((po: ProcurementOrder) => (
                <div key={po.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold">{po.supplierName}</p>
                    <span className={`text-xs font-semibold ${PO_STATUS_COLOR[po.status]}`}>{po.status}</span>
                  </div>
                  <p className="text-xl font-bold text-[var(--color-primary)] mb-2">{formatCurrency(po.totalValue)}</p>
                  {po.expectedDate && <p className="text-xs text-[var(--color-muted)] mb-2">Expected: {po.expectedDate}</p>}
                  <div className="flex gap-2">
                    {po.status === "draft"    && <button onClick={() => updateProcurement({ ...po, status: "approved" })} className="text-xs bg-blue-900/30 text-blue-400 border border-blue-800/30 px-2 py-1 rounded">Approve</button>}
                    {po.status === "approved" && <button onClick={() => updateProcurement({ ...po, status: "ordered" })}  className="text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-1 rounded">Mark Ordered</button>}
                    {po.status === "ordered"  && <button onClick={() => updateProcurement({ ...po, status: "received" })} className="text-xs bg-green-900/30 text-green-400 border border-green-800/30 px-2 py-1 rounded">Mark Received</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── INTELLIGENCE ── */}
      {tab === "intelligence" && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Radar size={18} className="text-[var(--color-primary)]" />
            <div>
              <h2 className="text-base font-bold">Anomaly Radar</h2>
              <p className="text-sm text-[var(--color-muted)]">Scans your transactions for duplicate payments, spend spikes, creeping subscriptions, and large new payees — every flag links to the underlying transactions.</p>
            </div>
          </div>

          {/* Severity summary */}
          <div className="grid grid-cols-3 gap-3">
            {([
              ["high",   "Needs attention", "text-red-400"],
              ["medium", "Worth a look",    "text-orange-400"],
              ["low",    "Heads up",        "text-[var(--color-muted)]"],
            ] as const).map(([sev, label, color]) => (
              <div key={sev} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{anomalies.filter(a => a.severity === sev).length}</p>
              </div>
            ))}
          </div>

          {anomalies.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <CheckCircle2 size={26} className="mx-auto mb-3 text-green-400 opacity-60" />
              <p className="text-sm font-semibold mb-1">No anomalies detected</p>
              <p className="text-sm text-[var(--color-muted)] max-w-sm mx-auto">
                {transactions.length === 0
                  ? "Import or add transactions and the radar will watch for duplicate payments, spend spikes and subscription creep."
                  : "Your recent spend looks clean — no duplicate payments, spikes, or unusual new payees."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {anomalies.map(a => {
                const { Icon, label } = ANOMALY_META[a.type];
                return (
                  <div key={a.id} className={`rounded-lg border p-4 ${SEV_STYLE[a.severity]}`}>
                    <div className="flex items-start gap-3">
                      <Icon size={16} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[a.severity]}`} />
                          <p className="text-sm font-semibold">{a.title}</p>
                          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] border border-[var(--color-border)] rounded-full px-1.5 py-0.5">{label}</span>
                        </div>
                        <p className="text-xs text-[var(--color-muted)] mt-1">{a.detail}</p>
                        <p className="text-[11px] text-[var(--color-muted)] mt-1">
                          {new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}{a.txnIds.length} transaction{a.txnIds.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">{formatCurrency(a.amount)}</p>
                        <Link to="/transactions" className="text-[10px] text-[var(--color-primary)] hover:underline">Review →</Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "prices" && <PriceListTab />}
      {tab === "bom" && <BomCostingTab />}
      {tab === "leadtime" && <LeadTimeScorecardTab />}
      {tab === "reorder" && <ReorderAlertTab />}
      {tab === "payables" && <AgedPayablesTab />}
      {tab === "stockledger" && <StockLedgerTab />}
      {tab === "batchtrack" && <BatchExpiryTab />}
      {tab === "jobwork" && <JobWorkTab />}
      {tab === "production" && <ProductionCostingTab />}
      {tab === "warehouse" && <WarehouseStockTab />}
      {tab === "stocktake" && <StockTakeTab />}
      {tab === "dispatch" && <DispatchPlannerTab />}
      {tab === "abc" && <AbcAnalysisTab />}
      {tab === "eoq" && <EoqCalculatorTab />}
      {tab === "turnover" && <StockTurnoverTab />}
      {tab === "skumargin" && <SkuMarginTab />}
      {tab === "landed" && <LandedCostTab />}
      {tab === "grn" && <GrnDiscrepancyTab />}
      {tab === "scrap" && <ScrapWastageTab />}
      {tab === "returns" && <ReturnsRegisterTab />}
      {tab === "valuation" && <StockValuationTab />}
      {tab === "safetystock" && <SafetyStockTab />}
      {tab === "carrying" && <CarryingCostTab />}
      {tab === "aging" && <StockAgingTab />}
      {tab === "stockout" && <StockoutCostTab />}
      {tab === "cyclecount" && <CycleCountScheduleTab />}
      {tab === "minmax" && <MinMaxPlannerTab />}
      {tab === "whutil" && <WarehouseUtilizationTab />}
      {tab === "oversell" && <OversellGuardTab />}
    </div>
  );
}

function PriceListTab() {
  const { store } = useApp();

  type Tier = { label: string; discountPct: number };
  type PriceItem = { id: string; sku: string; name: string; basePrice: number; unit: string; gstRate: number; tiers: Tier[] };

  const DISCOUNT_TIERS: Tier[] = [
    { label: "Retail",     discountPct: 0  },
    { label: "Dealer",     discountPct: 10 },
    { label: "Distributor",discountPct: 20 },
  ];

  const [items,     setItems]     = useFeatureState<PriceItem[]>("price-overrides",
    store.inventory.slice(0, 20).map(p => ({
      id: p.id, sku: p.sku ?? p.id.slice(0, 6).toUpperCase(), name: p.productName,
      basePrice: p.unitCost, unit: p.unit ?? "piece", gstRate: 18, tiers: DISCOUNT_TIERS,
    }))
  );
  const [search,    setSearch]    = useState("");
  const [showAdd,   setShowAdd]   = useState(false);
  const [nSku,      setNSku]      = useState("");
  const [nName,     setNName]     = useState("");
  const [nPrice,    setNPrice]    = useState("");
  const [nUnit,     setNUnit]     = useState("piece");
  const [nGst,      setNGst]      = useState(18);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const addItem = () => {
    if (!nName || !nPrice) return;
    setItems(prev => [...prev, { id: generateId(), sku: nSku || nName.slice(0,6).toUpperCase(), name: nName, basePrice: parseFloat(nPrice), unit: nUnit, gstRate: nGst, tiers: DISCOUNT_TIERS }]);
    setNSku(""); setNName(""); setNPrice(""); setNUnit("piece"); setNGst(18); setShowAdd(false);
  };

  const savePrice = (id: string) => {
    const p = parseFloat(editPrice);
    if (!p) return;
    setItems(prev => prev.map(it => it.id === id ? { ...it, basePrice: p } : it));
    setEditId(null);
  };

  const downloadCsv = () => {
    const headers = ["SKU", "Product", "Unit", "Base Price (₹)", "GST %", ...DISCOUNT_TIERS.map(t => `${t.label} Price`), ...DISCOUNT_TIERS.map(t => `${t.label} Price (incl. GST)`)];
    const rows = filtered.map(it => [
      it.sku, it.name, it.unit, it.basePrice, it.gstRate,
      ...it.tiers.map(t => Math.round(it.basePrice * (1 - t.discountPct / 100))),
      ...it.tiers.map(t => Math.round(it.basePrice * (1 - t.discountPct / 100) * (1 + it.gstRate / 100))),
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "price-list.csv"; a.click();
  };

  const filtered = items.filter(it => !search || it.name.toLowerCase().includes(search.toLowerCase()) || it.sku.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Package size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-8 pr-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={12} /> Add item
        </button>
        <button onClick={downloadCsv}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
          <TrendingUp size={12} /> Export CSV
        </button>
      </div>

      {showAdd && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <input value={nSku} onChange={e=>setNSku(e.target.value)} placeholder="SKU (optional)"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input value={nName} onChange={e=>setNName(e.target.value)} placeholder="Product name *"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input type="number" value={nPrice} onChange={e=>setNPrice(e.target.value)} placeholder="Base price (₹) *"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input value={nUnit} onChange={e=>setNUnit(e.target.value)} placeholder="Unit (kg, piece, box…)"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <select value={nGst} onChange={e=>setNGst(Number(e.target.value))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
              {[0,5,12,18,28].map(r => <option key={r} value={r}>GST {r}%</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={addItem} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-[var(--color-muted)] px-4 py-2 rounded-lg border border-[var(--color-border)] hover:text-[var(--color-text)]">Cancel</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Package size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">{items.length === 0 ? "No products yet. Add a product above or go to Inventory to stock up." : "No products match your search."}</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">SKU</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Product</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">Base Price</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">GST</th>
                  {DISCOUNT_TIERS.map(t => (
                    <th key={t.label} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">
                      {t.label} {t.discountPct > 0 ? `(−${t.discountPct}%)` : ""}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map(it => (
                  <tr key={it.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted)]">{it.sku}</td>
                    <td className="px-4 py-3 font-medium">{it.name}<span className="ml-1 text-[10px] text-[var(--color-muted)]">/{it.unit}</span></td>
                    <td className="px-4 py-3 tabular-nums">
                      {editId === it.id ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={editPrice} onChange={e=>setEditPrice(e.target.value)} autoFocus
                            className="w-24 bg-[var(--color-bg)] border border-[var(--color-primary)] rounded px-2 py-1 text-xs outline-none tabular-nums" />
                          <button onClick={() => savePrice(it.id)} className="text-[10px] text-[var(--color-primary)] hover:underline">✓</button>
                          <button onClick={() => setEditId(null)} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditId(it.id); setEditPrice(String(it.basePrice)); }}
                          className="tabular-nums hover:text-[var(--color-primary)] transition-colors">{formatCurrency(it.basePrice)}</button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{it.gstRate}%</td>
                    {it.tiers.map(t => {
                      const discounted    = Math.round(it.basePrice * (1 - t.discountPct / 100));
                      const withGst       = Math.round(discounted * (1 + it.gstRate / 100));
                      return (
                        <td key={t.label} className="px-4 py-3">
                          <p className="tabular-nums text-xs font-semibold">{formatCurrency(discounted)}</p>
                          <p className="tabular-nums text-[10px] text-[var(--color-muted)]">+GST {formatCurrency(withGst)}</p>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <button onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))}
                        className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Price list auto-populates from your inventory. Click any base price to edit it inline. Export as CSV to share with customers or dealers.
      </div>
    </div>
  );
}

function LeadTimeScorecardTab() {
  type Delivery = { id: string; vendor: string; item: string; orderedDate: string; promisedDate: string; actualDate: string };

  const [deliveries, setDeliveries] = useFeatureState<Delivery[]>("lead-time-deliveries", []);
  const [vendor,   setVendor]   = useState("");
  const [item,     setItem]     = useState("");
  const [ordered,  setOrdered]  = useState(() => new Date().toISOString().split("T")[0]);
  const [promised, setPromised] = useState(() => new Date().toISOString().split("T")[0]);
  const [actual,   setActual]   = useState(() => new Date().toISOString().split("T")[0]);

  const addDelivery = () => {
    if (!vendor || !item) return;
    setDeliveries(prev => [...prev, { id: Math.random().toString(36).slice(2), vendor, item, orderedDate: ordered, promisedDate: promised, actualDate: actual }]);
    setVendor(""); setItem("");
  };

  const daysDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

  const vendorMap: Record<string, { promised: number[]; actual: number[]; onTime: number; total: number }> = {};
  deliveries.forEach(d => {
    if (!vendorMap[d.vendor]) vendorMap[d.vendor] = { promised: [], actual: [], onTime: 0, total: 0 };
    const p = daysDiff(d.orderedDate, d.promisedDate);
    const a = daysDiff(d.orderedDate, d.actualDate);
    vendorMap[d.vendor].promised.push(p);
    vendorMap[d.vendor].actual.push(a);
    vendorMap[d.vendor].total++;
    if (a <= p) vendorMap[d.vendor].onTime++;
  });

  const vendorScores = Object.entries(vendorMap).map(([name, v]) => {
    const avgPromised = v.promised.reduce((s,x)=>s+x,0) / v.promised.length;
    const avgActual   = v.actual.reduce((s,x)=>s+x,0) / v.actual.length;
    const onTimePct   = Math.round((v.onTime / v.total) * 100);
    const avgDelay    = Math.round(avgActual - avgPromised);
    const grade       = onTimePct >= 90 ? "A" : onTimePct >= 70 ? "B" : "C";
    return { name, avgPromised: Math.round(avgPromised), avgActual: Math.round(avgActual), onTimePct, avgDelay, grade, total: v.total };
  }).sort((a,b) => b.onTimePct - a.onTimePct);

  const GRADE_STYLE = { A: "bg-green-900/30 text-green-400 border-green-800/40", B: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40", C: "bg-red-900/30 text-red-400 border-red-800/40" };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1">Vendor Lead Time Scorecard</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track promised vs actual delivery dates per vendor. Grades: A = ≥90% on-time, B = 70-89%, C = below 70%.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={vendor} onChange={e=>setVendor(e.target.value)} placeholder="Vendor name *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input value={item} onChange={e=>setItem(e.target.value)} placeholder="Item / PO reference *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <div className="grid grid-cols-3 gap-1">
            {[["Ordered", ordered, setOrdered], ["Promised", promised, setPromised], ["Actual", actual, setActual]].map(([label, val, set]) => (
              <div key={label as string}>
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{label as string}</p>
                <input type="date" value={val as string} onChange={e=>(set as (v:string)=>void)(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--color-primary)]" />
              </div>
            ))}
          </div>
        </div>
        <button onClick={addDelivery} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Record delivery</button>
      </div>

      {vendorScores.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Vendor Scorecard</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Vendor","Grade","Deliveries","On-Time %","Avg Lead Time","Avg Delay"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {vendorScores.map(v => (
                  <tr key={v.name} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-medium">{v.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${GRADE_STYLE[v.grade as keyof typeof GRADE_STYLE]}`}>{v.grade}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{v.total}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${v.onTimePct}%`, background: v.onTimePct >= 90 ? "#22c55e" : v.onTimePct >= 70 ? "#f97316" : "#ef4444" }} />
                        </div>
                        <span className={`text-xs font-semibold tabular-nums ${v.onTimePct >= 90 ? "text-green-400" : v.onTimePct >= 70 ? "text-orange-400" : "text-red-400"}`}>{v.onTimePct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs">{v.avgActual}d actual / {v.avgPromised}d promised</td>
                    <td className={`px-4 py-3 tabular-nums font-semibold text-xs ${v.avgDelay > 0 ? "text-red-400" : "text-green-400"}`}>
                      {v.avgDelay > 0 ? `+${v.avgDelay}d late` : v.avgDelay < 0 ? `${Math.abs(v.avgDelay)}d early` : "On time"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <p className="text-sm font-semibold">All Deliveries ({deliveries.length})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Vendor","Item","Ordered","Promised","Actual","Variance",""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {deliveries.slice().reverse().map(d => {
                  const delay = daysDiff(d.promisedDate, d.actualDate);
                  return (
                    <tr key={d.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{d.vendor}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{d.item}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums">{d.orderedDate}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums">{d.promisedDate}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums">{d.actualDate}</td>
                      <td className={`px-4 py-2.5 text-xs font-semibold tabular-nums ${delay > 0 ? "text-red-400" : delay < 0 ? "text-green-400" : "text-[var(--color-muted)]"}`}>
                        {delay > 0 ? `+${delay}d` : delay < 0 ? `${delay}d` : "On time"}
                      </td>
                      <td className="px-4 py-2.5"><button onClick={()=>setDeliveries(prev=>prev.filter(x=>x.id!==d.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12}/></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deliveries.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Truck size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No deliveries recorded. Log promised and actual delivery dates to score your vendors.</p>
        </div>
      )}
    </div>
  );
}

function BomCostingTab() {
  type BomLine = { id: string; material: string; qty: number; unit: string; unitCost: number };
  type Bom = { id: string; product: string; outputQty: number; outputUnit: string; overheadPct: number; sellingPrice: number; lines: BomLine[] };

  const [boms, setBoms]     = useFeatureState<Bom[]>("boms", []);
  const [activeBom, setActiveBom] = useState<string | null>(null);
  const [product,   setProduct]   = useState("");
  const [outQty,    setOutQty]    = useState("1");
  const [outUnit,   setOutUnit]   = useState("piece");
  const [overhead,  setOverhead]  = useState("15");
  const [sellPrice, setSellPrice] = useState("");

  // Line form
  const [lMat,  setLMat]  = useState("");
  const [lQty,  setLQty]  = useState("");
  const [lUnit, setLUnit] = useState("kg");
  const [lCost, setLCost] = useState("");

  const createBom = () => {
    if (!product) return;
    const id = Math.random().toString(36).slice(2);
    setBoms(prev => [...prev, { id, product, outputQty: parseFloat(outQty)||1, outputUnit: outUnit, overheadPct: parseFloat(overhead)||15, sellingPrice: parseFloat(sellPrice)||0, lines: [] }]);
    setActiveBom(id); setProduct(""); setOutQty("1"); setOutUnit("piece"); setSellPrice("");
  };

  const addLine = (bomId: string) => {
    if (!lMat || !lCost || !lQty) return;
    setBoms(prev => prev.map(b => b.id === bomId ? { ...b, lines: [...b.lines, { id: Math.random().toString(36).slice(2), material: lMat, qty: parseFloat(lQty), unit: lUnit, unitCost: parseFloat(lCost) }] } : b));
    setLMat(""); setLQty(""); setLCost("");
  };

  const removeLine = (bomId: string, lineId: string) =>
    setBoms(prev => prev.map(b => b.id === bomId ? { ...b, lines: b.lines.filter(l => l.id !== lineId) } : b));

  const calcBom = (b: Bom) => {
    const materialCost = b.lines.reduce((s,l) => s + l.qty * l.unitCost, 0);
    const overhead     = Math.round(materialCost * b.overheadPct / 100);
    const totalCost    = materialCost + overhead;
    const costPerUnit  = b.outputQty > 0 ? totalCost / b.outputQty : totalCost;
    const gm           = b.sellingPrice > 0 ? Math.round(((b.sellingPrice - costPerUnit) / b.sellingPrice) * 100) : null;
    return { materialCost, overhead, totalCost, costPerUnit, gm };
  };

  const active = boms.find(b => b.id === activeBom) ?? null;

  return (
    <div className="space-y-4 max-w-3xl">
      {/* BOM list */}
      {boms.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Your BOMs ({boms.length})</p>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {boms.map(b => {
              const { costPerUnit, gm } = calcBom(b);
              return (
                <button key={b.id} onClick={() => setActiveBom(b.id === activeBom ? null : b.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-white/2 transition-colors ${b.id === activeBom ? "bg-[var(--color-primary)]/10" : ""}`}>
                  <div>
                    <p className="font-medium">{b.product}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{b.lines.length} components · {b.outputQty} {b.outputUnit} output</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums font-semibold">{formatCurrency(Math.round(costPerUnit))}/unit</p>
                    {gm !== null && <p className={`text-[10px] font-semibold ${gm >= 30 ? "text-green-400" : gm >= 15 ? "text-yellow-400" : "text-red-400"}`}>{gm}% GM</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Create new BOM */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Create New BOM</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={product} onChange={e=>setProduct(e.target.value)} placeholder="Finished product name *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] col-span-2 md:col-span-1" />
          <div className="flex gap-2">
            <input type="number" value={outQty} onChange={e=>setOutQty(e.target.value)} placeholder="Qty"
              className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input value={outUnit} onChange={e=>setOutUnit(e.target.value)} placeholder="Unit"
              className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <input type="number" value={sellPrice} onChange={e=>setSellPrice(e.target.value)} placeholder="Selling price (₹, optional)"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Overhead %</span><span className="font-semibold text-[var(--color-text)]">{overhead}%</span></label>
            <input type="range" min={0} max={50} value={overhead} onChange={e=>setOverhead(e.target.value)} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
        <button onClick={createBom} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          Create BOM
        </button>
      </div>

      {/* Active BOM detail */}
      {active && (() => {
        const { materialCost, overhead: oh, totalCost, costPerUnit, gm } = calcBom(active);
        return (
          <div className="space-y-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">BOM: {active.product}</h3>
                <button onClick={() => setBoms(prev => prev.filter(b => b.id !== active.id))}
                  className="text-xs text-red-400 hover:underline">Delete BOM</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Material cost",   value: formatCurrency(Math.round(materialCost)), color: "text-[var(--color-text)]" },
                  { label: `Overhead (${active.overheadPct}%)`, value: formatCurrency(oh), color: "text-orange-400" },
                  { label: "Total cost",      value: formatCurrency(Math.round(totalCost)),    color: "text-red-400" },
                  { label: `Cost per ${active.outputUnit}`, value: formatCurrency(Math.round(costPerUnit)), color: "text-[var(--color-primary)]" },
                ].map(k => (
                  <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                    <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              {active.sellingPrice > 0 && (
                <div className={`rounded-lg px-4 py-3 border text-sm flex items-center justify-between ${(gm??0) >= 20 ? "bg-green-950/30 border-green-800/40" : "bg-red-950/30 border-red-800/40"}`}>
                  <div>
                    <p className="font-semibold">Gross Margin</p>
                    <p className="text-xs text-[var(--color-muted)]">Selling price {formatCurrency(active.sellingPrice)} − cost {formatCurrency(Math.round(costPerUnit))}</p>
                  </div>
                  <p className={`text-2xl font-bold tabular-nums ${(gm??0) >= 20 ? "text-green-400" : "text-red-400"}`}>{gm ?? 0}%</p>
                </div>
              )}
            </div>

            {/* Components */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <p className="text-sm font-semibold">Components / Raw Materials</p>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {active.lines.map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="flex-1 font-medium">{l.material}</span>
                    <span className="text-xs text-[var(--color-muted)] tabular-nums">{l.qty} {l.unit} × {formatCurrency(l.unitCost)}</span>
                    <span className="tabular-nums font-semibold text-xs w-20 text-right">{formatCurrency(Math.round(l.qty * l.unitCost))}</span>
                    <button onClick={() => removeLine(active.id, l.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                  </div>
                ))}
                {active.lines.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-muted)]">No components yet. Add raw materials below.</p>}
              </div>
              <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                <div className="flex items-end gap-2 flex-wrap">
                  <input value={lMat} onChange={e=>setLMat(e.target.value)} placeholder="Material / component *"
                    className="flex-1 min-w-[140px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                  <input type="number" value={lQty} onChange={e=>setLQty(e.target.value)} placeholder="Qty"
                    className="w-16 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                  <input value={lUnit} onChange={e=>setLUnit(e.target.value)} placeholder="Unit"
                    className="w-14 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                  <input type="number" value={lCost} onChange={e=>setLCost(e.target.value)} placeholder="Unit cost (₹)"
                    className="w-24 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                  <button onClick={() => addLine(active.id)} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">+ Add</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {boms.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Package size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No BOMs yet. Create a Bill of Materials to cost your manufactured or assembled products.</p>
        </div>
      )}
    </div>
  );
}

function ReorderAlertTab() {
  const { store } = useApp();
  type ReorderItem = {
    id: string; name: string; currentStock: number; reorderPoint: number;
    reorderQty: number; leadTimeDays: number; unitCost: number; supplier: string;
  };

  const fromInventory: ReorderItem[] = useMemo(() =>
    (store.inventory ?? []).map(item => ({
      id: item.id,
      name: item.productName,
      currentStock: item.quantity ?? 0,
      reorderPoint: item.reorderLevel ?? Math.ceil((item.quantity ?? 0) * 0.3),
      reorderQty: Math.ceil((item.quantity ?? 0) * 0.5),
      leadTimeDays: 7,
      unitCost: item.unitCost ?? 0,
      supplier: "",
    })),
  [store.inventory]);

  const [items, setItems] = useFeatureState<ReorderItem[]>("reorder-items", []);
  const allItems = useMemo(() => {
    const ids = new Set(items.map(i => i.id));
    return [...items, ...fromInventory.filter(i => !ids.has(i.id))];
  }, [items, fromInventory]);

  const [showForm, setShowForm] = useState(false);
  const [fName, setFName]     = useState("");
  const [fStock, setFStock]   = useState("");
  const [fRop,   setFRop]     = useState("");
  const [fQty,   setFQty]     = useState("");
  const [fLead,  setFLead]    = useState("7");
  const [fCost,  setFCost]    = useState("");
  const [fSupp,  setFSupp]    = useState("");

  const addItem = () => {
    if (!fName) return;
    setItems(prev => [...prev, {
      id: generateId(), name: fName,
      currentStock: parseFloat(fStock) || 0, reorderPoint: parseFloat(fRop) || 0,
      reorderQty: parseFloat(fQty) || 0, leadTimeDays: parseFloat(fLead) || 7,
      unitCost: parseFloat(fCost) || 0, supplier: fSupp,
    }]);
    setFName(""); setFStock(""); setFRop(""); setFQty(""); setFLead("7"); setFCost(""); setFSupp("");
    setShowForm(false);
  };

  const updateField = (id: string, field: keyof ReorderItem, val: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: field === "name" || field === "supplier" ? val : parseFloat(val) || 0 } : i));

  const needsReorder  = allItems.filter(i => i.currentStock <= i.reorderPoint);
  const orderValue    = needsReorder.reduce((s, i) => s + i.reorderQty * i.unitCost, 0);
  const fc = formatCurrency;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total SKUs",      value: allItems.length.toString(),       color: "text-[var(--color-primary)]" },
          { label: "Need Reorder",    value: needsReorder.length.toString(),   color: needsReorder.length > 0 ? "text-red-400" : "text-green-400" },
          { label: "Est. Order Value",value: fc(orderValue),                   color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Reorder Point Monitor</span>
            {needsReorder.length > 0 && (
              <span className="text-xs bg-red-950/30 text-red-400 font-semibold px-2 py-0.5 rounded-full">{needsReorder.length} items below ROP</span>
            )}
          </div>
          <button onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <Plus size={11} /> Add SKU
          </button>
        </div>

        {showForm && (
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Item name *" className={inp} />
              <input type="number" value={fStock} onChange={e => setFStock(e.target.value)} placeholder="Current stock" className={inp} />
              <input type="number" value={fRop}   onChange={e => setFRop(e.target.value)}   placeholder="Reorder point" className={inp} />
              <input type="number" value={fQty}   onChange={e => setFQty(e.target.value)}   placeholder="Reorder qty" className={inp} />
              <input type="number" value={fLead}  onChange={e => setFLead(e.target.value)}  placeholder="Lead time (days)" className={inp} />
              <input type="number" value={fCost}  onChange={e => setFCost(e.target.value)}  placeholder="Unit cost (₹)" className={inp} />
              <input value={fSupp} onChange={e => setFSupp(e.target.value)} placeholder="Supplier name" className={`${inp} md:col-span-2`} />
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={addItem} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
              <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
            </div>
          </div>
        )}

        {allItems.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No SKUs configured. Items auto-populate from your inventory. Add custom SKUs to set reorder points.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Item","Stock","ROP","Status","Reorder Qty","Lead Time","Order Value","Supplier",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allItems.sort((a, b) => (a.currentStock - a.reorderPoint) - (b.currentStock - b.reorderPoint)).map(item => {
                  const below = item.currentStock <= item.reorderPoint;
                  const critical = item.currentStock <= item.reorderPoint * 0.5;
                  const stockPct = item.reorderPoint > 0 ? Math.min(100, (item.currentStock / (item.reorderPoint * 2)) * 100) : 100;
                  return (
                    <tr key={item.id} className={`border-b border-[var(--color-border)] last:border-0 ${below ? "bg-red-950/10" : "hover:bg-[var(--color-accent)]"}`}>
                      <td className="px-3 py-2.5 font-medium">{item.name}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${critical ? "bg-red-500" : below ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${stockPct}%` }} />
                          </div>
                          <span className="tabular-nums text-xs">{item.currentStock}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{item.reorderPoint}</td>
                      <td className="px-3 py-2.5">
                        {critical ? <span className="text-xs font-bold text-red-400 bg-red-950/30 px-2 py-0.5 rounded-full">Critical</span>
                          : below  ? <span className="text-xs font-bold text-yellow-400 bg-yellow-950/30 px-2 py-0.5 rounded-full">Reorder</span>
                          : <span className="text-xs font-semibold text-green-400">OK</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <input type="number" value={item.reorderQty} onChange={e => updateField(item.id, "reorderQty", e.target.value)} className="w-16 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none" />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{item.leadTimeDays}d</td>
                      <td className="px-3 py-2.5 tabular-nums">{item.unitCost > 0 ? fc(item.reorderQty * item.unitCost) : "—"}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">{item.supplier || "—"}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setItems(prev => prev.filter(x => x.id !== item.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">ROP = Reorder Point. Items auto-populated from inventory at 30% of current stock. Edit inline to set precise safety stock levels. Critical = stock &lt;50% of ROP.</p>
    </div>
  );
}

function AgedPayablesTab() {
  type Bill = { id: string; vendor: string; billNo: string; amount: number; billDate: string; dueDate: string; isMsme: boolean; status: "unpaid" | "paid" };
  const [bills, setBills] = useFeatureState<Bill[]>("aged-payables", []);
  const [showForm, setShowForm] = useState(false);
  const [fVendor, setFVendor] = useState("");
  const [fBillNo, setFBillNo] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fBillDate, setFBillDate] = useState("");
  const [fDueDate, setFDueDate] = useState("");
  const [fMsme, setFMsme] = useState(false);

  const today = new Date();
  const addBill = () => {
    if (!fVendor || !fAmount || !fDueDate) return;
    setBills(prev => [...prev, { id: generateId(), vendor: fVendor, billNo: fBillNo, amount: parseFloat(fAmount) || 0, billDate: fBillDate, dueDate: fDueDate, isMsme: fMsme, status: "unpaid" }]);
    setFVendor(""); setFBillNo(""); setFAmount(""); setFBillDate(""); setFDueDate(""); setFMsme(false); setShowForm(false);
  };
  const toggle = (id: string) => setBills(prev => prev.map(b => b.id === id ? { ...b, status: b.status === "paid" ? "unpaid" : "paid" } : b));

  const daysOverdue = (b: Bill) => b.dueDate ? differenceInDays(today, parseISO(b.dueDate)) : 0;
  const unpaid = bills.filter(b => b.status === "unpaid");
  const buckets = [
    { key: "Current", test: (d: number) => d <= 0 },
    { key: "1–30",    test: (d: number) => d >= 1 && d <= 30 },
    { key: "31–60",   test: (d: number) => d >= 31 && d <= 60 },
    { key: "61–90",   test: (d: number) => d >= 61 && d <= 90 },
    { key: "90+",     test: (d: number) => d > 90 },
  ].map(bk => {
    const list = unpaid.filter(b => bk.test(daysOverdue(b)));
    return { key: bk.key, count: list.length, amount: list.reduce((s, b) => s + b.amount, 0) };
  });

  const totalPayable = unpaid.reduce((s, b) => s + b.amount, 0);
  const overduePayable = unpaid.filter(b => daysOverdue(b) > 0).reduce((s, b) => s + b.amount, 0);
  const dueThisWeek = unpaid.filter(b => { const d = daysOverdue(b); return d <= 0 && d >= -7; }).reduce((s, b) => s + b.amount, 0);
  const msmeAtRisk = unpaid.filter(b => b.isMsme && daysOverdue(b) > 45).reduce((s, b) => s + b.amount, 0);

  const exportCsv = () => {
    const header = ["Vendor", "Bill No", "Amount", "Bill Date", "Due Date", "Days Overdue", "MSME", "Status"];
    const lines = bills.map(b => [b.vendor, b.billNo, b.amount, b.billDate, b.dueDate, daysOverdue(b), b.isMsme ? "Yes" : "No", b.status].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "aged-payables.csv"; a.click();
    URL.revokeObjectURL(a.href);
  };

  const fc = formatCurrency;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Payable",   value: fc(totalPayable),  color: "text-[var(--color-primary)]" },
          { label: "Overdue Payable", value: fc(overduePayable), color: overduePayable > 0 ? "text-red-400" : "text-green-400" },
          { label: "Due This Week",   value: fc(dueThisWeek),   color: "text-yellow-400" },
          { label: "MSME At-Risk (>45d)", value: fc(msmeAtRisk), color: msmeAtRisk > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-3">Payables Aging</p>
        <div className="grid grid-cols-5 gap-2">
          {buckets.map(b => (
            <div key={b.key} className="bg-[var(--color-bg)] rounded-lg p-3 text-center border border-[var(--color-border)]">
              <p className="text-[10px] text-[var(--color-muted)]">{b.key}</p>
              <p className={`text-sm font-bold tabular-nums ${b.key === "90+" && b.amount > 0 ? "text-red-400" : "text-[var(--color-text)]"}`}>{fc(b.amount)}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{b.count} bill(s)</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Vendor Bills</span>
          </div>
          <div className="flex gap-2">
            {bills.length > 0 && (
              <button onClick={exportCsv} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
                <Download size={11} /> CSV
              </button>
            )}
            <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
              <Plus size={11} /> Add bill
            </button>
          </div>
        </div>

        {showForm && (
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <input value={fVendor} onChange={e => setFVendor(e.target.value)} placeholder="Vendor *" className={inp} />
              <input value={fBillNo} onChange={e => setFBillNo(e.target.value)} placeholder="Bill no." className={inp} />
              <input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="Amount (₹) *" className={inp} />
              <div><label className="text-[10px] text-[var(--color-muted)] block">Bill date</label><input type="date" value={fBillDate} onChange={e => setFBillDate(e.target.value)} className={inp} /></div>
              <div><label className="text-[10px] text-[var(--color-muted)] block">Due date *</label><input type="date" value={fDueDate} onChange={e => setFDueDate(e.target.value)} className={inp} /></div>
              <label className="flex items-center gap-2 text-xs cursor-pointer mt-4"><input type="checkbox" checked={fMsme} onChange={e => setFMsme(e.target.checked)} className="accent-[var(--color-primary)]" /> MSME vendor</label>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={addBill} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
              <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
            </div>
          </div>
        )}

        {bills.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No vendor bills tracked. Add bills to monitor payables aging and MSME 45-day exposure.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Vendor", "Bill No", "Amount", "Due Date", "Days", "MSME", "Status", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...bills].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).map(b => {
                  const d = daysOverdue(b);
                  const overdue = b.status === "unpaid" && d > 0;
                  return (
                    <tr key={b.id} className={`border-b border-[var(--color-border)] last:border-0 ${overdue ? "bg-red-950/10" : "hover:bg-[var(--color-accent)]"}`}>
                      <td className="px-4 py-2.5 font-medium">{b.vendor}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{b.billNo || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{fc(b.amount)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{b.dueDate || "—"}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${overdue ? "text-red-400" : "text-[var(--color-muted)]"}`}>{b.status === "unpaid" && d > 0 ? `${d}d` : "—"}</td>
                      <td className="px-4 py-2.5">{b.isMsme ? <span className="text-[10px] bg-blue-950/30 text-blue-400 px-1.5 py-0.5 rounded-full">MSME</span> : "—"}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggle(b.id)} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.status === "paid" ? "bg-green-950/30 text-green-400" : "bg-yellow-950/30 text-yellow-400"}`}>{b.status === "paid" ? "Paid" : "Unpaid"}</button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setBills(prev => prev.filter(x => x.id !== b.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">MSME vendors must be paid within 45 days (15 if no agreement) under the MSMED Act. Amounts unpaid to MSMEs beyond the limit are disallowed as expense under Sec 43B(h) until actually paid. Consult a CA.</p>
    </div>
  );
}

/* ───────────────────────── #69 Stock Ledger (in/out + FIFO / WA valuation) ───────────────────────── */
function StockLedgerTab() {
  const { store } = useApp();
  type Move = { id: string; date: string; sku: string; product: string; type: "in" | "out"; qty: number; rate: number; note: string };
  const [moves, setMoves] = useFeatureState<Move[]>("stock-ledger-moves", []);
  const [method, setMethod] = useState<"FIFO" | "WA">("FIFO");
  const [filterSku, setFilterSku] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [fDate, setFDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [fSku, setFSku] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fType, setFType] = useState<"in" | "out">("in");
  const [fQty, setFQty] = useState("");
  const [fRate, setFRate] = useState("");
  const [fNote, setFNote] = useState("");

  const addMove = () => {
    if (!fProduct || !fQty) { toast.error("Product and quantity required"); return; }
    setMoves(prev => [...prev, {
      id: generateId(), date: fDate, sku: fSku, product: fProduct, type: fType,
      qty: Math.abs(parseFloat(fQty)) || 0, rate: Math.abs(parseFloat(fRate)) || 0, note: fNote,
    }]);
    toast.success(`Stock ${fType === "in" ? "receipt" : "issue"} recorded`);
    setFSku(""); setFProduct(""); setFQty(""); setFRate(""); setFNote(""); setShowForm(false);
  };

  // Group by product key (sku||product), run a chronological FIFO/WA cost engine.
  const keyOf = (m: Move) => (m.sku || m.product).toLowerCase();
  const valuation = useMemo(() => {
    const byKey: Record<string, Move[]> = {};
    [...moves].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)).forEach(m => {
      (byKey[keyOf(m)] ??= []).push(m);
    });
    return Object.entries(byKey).map(([key, list]) => {
      let qty = 0, value = 0;                       // weighted-average running totals
      const lots: { qty: number; rate: number }[] = []; // FIFO lots
      let cogs = 0;
      for (const m of list) {
        if (m.type === "in") {
          qty += m.qty; value += m.qty * m.rate;
          lots.push({ qty: m.qty, rate: m.rate });
        } else {
          if (method === "WA") {
            const avg = qty > 0 ? value / qty : m.rate;
            const issue = Math.min(m.qty, qty);
            cogs += issue * avg; qty -= issue; value -= issue * avg;
          } else {
            let rem = m.qty;
            while (rem > 0 && lots.length) {
              const lot = lots[0];
              const take = Math.min(rem, lot.qty);
              cogs += take * lot.rate; lot.qty -= take; rem -= take; qty -= take;
              if (lot.qty <= 0) lots.shift();
            }
          }
        }
      }
      const closingQty = method === "WA" ? qty : lots.reduce((s, l) => s + l.qty, 0);
      const closingValue = method === "WA" ? value : lots.reduce((s, l) => s + l.qty * l.rate, 0);
      const avgRate = closingQty > 0 ? closingValue / closingQty : 0;
      return { key, product: list[list.length - 1].product, sku: list[0].sku, closingQty, closingValue, avgRate, cogs };
    });
  }, [moves, method]);

  const totalValue = valuation.reduce((s, v) => s + v.closingValue, 0);
  const filtered = filterSku ? moves.filter(m => keyOf(m).includes(filterSku.toLowerCase())) : moves;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Stock Ledger</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Every in/out move, valued by your chosen method.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-0.5">
            {(["FIFO", "WA"] as const).map(m => (
              <button key={m} onClick={() => setMethod(m)}
                className={`text-xs px-3 py-1 rounded font-semibold transition-colors ${method === m ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)]"}`}>
                {m === "WA" ? "Weighted Avg" : "FIFO"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <Plus size={11} /> Record move
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tracked SKUs", value: valuation.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Total Moves", value: moves.length.toString(), color: "text-blue-400" },
          { label: `Closing Value (${method})`, value: formatCurrency(Math.round(totalValue)), color: "text-green-400" },
          { label: "Total COGS", value: formatCurrency(Math.round(valuation.reduce((s, v) => s + v.cogs, 0))), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><label className="text-[10px] text-[var(--color-muted)] block">Date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inp} /></div>
            <input value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="Product *" className={inp} list="ledger-products" />
            <datalist id="ledger-products">{store.inventory.map(i => <option key={i.id} value={i.productName} />)}</datalist>
            <input value={fSku} onChange={e => setFSku(e.target.value)} placeholder="SKU (optional)" className={inp} />
            <select value={fType} onChange={e => setFType(e.target.value as "in" | "out")} className={inp}>
              <option value="in">Stock In (receipt)</option>
              <option value="out">Stock Out (issue)</option>
            </select>
            <input type="number" value={fQty} onChange={e => setFQty(e.target.value)} placeholder="Quantity *" className={inp} />
            <input type="number" value={fRate} onChange={e => setFRate(e.target.value)} placeholder="Rate ₹ (in only)" className={inp} />
            <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Note / ref" className={`${inp} md:col-span-2`} />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addMove} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      {valuation.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Valuation Summary ({method})</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "SKU", "Closing Qty", "Avg Rate", "Closing Value", "COGS"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {valuation.map(v => (
                  <tr key={v.key} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium">{v.product}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{v.sku || "—"}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${v.closingQty < 0 ? "text-red-400" : ""}`}>{v.closingQty}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(v.avgRate))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)] font-semibold">{formatCurrency(Math.round(v.closingValue))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(v.cogs))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Movement Log</p>
          <input value={filterSku} onChange={e => setFilterSku(e.target.value)} placeholder="Filter SKU / product…" className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] w-44" />
        </div>
        {filtered.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No stock moves yet. Record receipts and issues to build a valued ledger.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Product", "Type", "Qty", "Rate", "Value", "Note", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...filtered].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).map(m => (
                  <tr key={m.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{m.date}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{m.product}{m.sku && <span className="ml-1 text-[10px] text-[var(--color-muted)] font-mono">{m.sku}</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${m.type === "in" ? "text-green-400" : "text-red-400"}`}>
                        {m.type === "in" ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}{m.type === "in" ? "In" : "Out"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{m.qty}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{m.rate > 0 ? formatCurrency(m.rate) : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{m.rate > 0 ? formatCurrency(m.qty * m.rate) : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{m.note || "—"}</td>
                    <td className="px-4 py-2.5"><button onClick={() => setMoves(prev => prev.filter(x => x.id !== m.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">FIFO issues consume oldest receipts first; Weighted Average values issues at the running average cost. Rate applies to receipts; issues are auto-valued.</p>
    </div>
  );
}

/* ───────────────────────── #70 Batch / Expiry / Serial tracking ───────────────────────── */
function BatchExpiryTab() {
  const { store } = useApp();
  type Batch = { id: string; product: string; batchNo: string; serial: string; qty: number; mfgDate: string; expiryDate: string; location: string };
  const [batches, setBatches] = useFeatureState<Batch[]>("batch-tracking", []);
  const [showForm, setShowForm] = useState(false);

  const [fProduct, setFProduct] = useState("");
  const [fBatch, setFBatch] = useState("");
  const [fSerial, setFSerial] = useState("");
  const [fQty, setFQty] = useState("");
  const [fMfg, setFMfg] = useState("");
  const [fExp, setFExp] = useState("");
  const [fLoc, setFLoc] = useState("");

  const addBatch = () => {
    if (!fProduct || !fBatch) { toast.error("Product and batch number required"); return; }
    setBatches(prev => [...prev, {
      id: generateId(), product: fProduct, batchNo: fBatch, serial: fSerial,
      qty: parseFloat(fQty) || 0, mfgDate: fMfg, expiryDate: fExp, location: fLoc,
    }]);
    toast.success("Batch recorded");
    setFProduct(""); setFBatch(""); setFSerial(""); setFQty(""); setFMfg(""); setFExp(""); setFLoc(""); setShowForm(false);
  };

  const today = new Date();
  const statusOf = (b: Batch): { label: string; cls: string; days: number | null } => {
    if (!b.expiryDate) return { label: "No expiry", cls: "text-[var(--color-muted)]", days: null };
    const days = differenceInDays(parseISO(b.expiryDate), today);
    if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, cls: "text-red-400", days };
    if (days <= 30) return { label: `${days}d left`, cls: "text-red-400", days };
    if (days <= 90) return { label: `${days}d left`, cls: "text-yellow-400", days };
    return { label: `${days}d left`, cls: "text-green-400", days };
  };

  const expired = batches.filter(b => { const s = statusOf(b); return s.days !== null && s.days < 0; });
  const expiring = batches.filter(b => { const s = statusOf(b); return s.days !== null && s.days >= 0 && s.days <= 90; });
  const atRiskValue = expired.reduce((s, b) => s + b.qty, 0);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Batch / Expiry / Serial Tracking</h2>
            <p className="text-[11px] text-[var(--color-muted)]">FEFO-ready: track lots, serials and shelf life for pharma, food &amp; FMCG.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> Add batch
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tracked Batches", value: batches.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Expiring ≤90d", value: expiring.length.toString(), color: expiring.length > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Expired Units", value: `${atRiskValue} (${expired.length} lots)`, color: expired.length > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="Product *" className={inp} list="batch-products" />
            <datalist id="batch-products">{store.inventory.map(i => <option key={i.id} value={i.productName} />)}</datalist>
            <input value={fBatch} onChange={e => setFBatch(e.target.value)} placeholder="Batch / lot no. *" className={inp} />
            <input value={fSerial} onChange={e => setFSerial(e.target.value)} placeholder="Serial (optional)" className={inp} />
            <input type="number" value={fQty} onChange={e => setFQty(e.target.value)} placeholder="Qty" className={inp} />
            <div><label className="text-[10px] text-[var(--color-muted)] block">Mfg date</label><input type="date" value={fMfg} onChange={e => setFMfg(e.target.value)} className={inp} /></div>
            <div><label className="text-[10px] text-[var(--color-muted)] block">Expiry date</label><input type="date" value={fExp} onChange={e => setFExp(e.target.value)} className={inp} /></div>
            <input value={fLoc} onChange={e => setFLoc(e.target.value)} placeholder="Location" className={`${inp} md:col-span-2`} />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addBatch} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {batches.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No batches tracked. Add lots with expiry dates to get FEFO and shelf-life alerts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "Batch", "Serial", "Qty", "Mfg", "Expiry", "Status", "Loc", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...batches].sort((a, b) => (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999")).map(b => {
                  const s = statusOf(b);
                  return (
                    <tr key={b.id} className={`border-b border-[var(--color-border)] last:border-0 ${s.days !== null && s.days < 0 ? "bg-red-950/10" : "hover:bg-[var(--color-accent)]"}`}>
                      <td className="px-4 py-2.5 font-medium text-xs">{b.product}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{b.batchNo}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{b.serial || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{b.qty}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{b.mfgDate || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{b.expiryDate || "—"}</td>
                      <td className={`px-4 py-2.5 text-xs font-semibold ${s.cls}`}>{s.label}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{b.location || "—"}</td>
                      <td className="px-4 py-2.5"><button onClick={() => setBatches(prev => prev.filter(x => x.id !== b.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Rows sorted earliest-expiry-first (FEFO). Red ≤30d / expired, amber ≤90d. Essential for pharma, food and cosmetics compliance.</p>
    </div>
  );
}

/* ───────────────────────── #71 Job-Work tracker (Sec 143 / ITC-04) ───────────────────────── */
function JobWorkTab() {
  type Challan = { id: string; challanNo: string; jobWorker: string; gstin: string; product: string; sentQty: number; receivedQty: number; sentDate: string; dueDate: string; process: string; status: "sent" | "partial" | "received" };
  const [rows, setRows] = useFeatureState<Challan[]>("job-work-challans", []);
  const [showForm, setShowForm] = useState(false);

  const [fNo, setFNo] = useState("");
  const [fWorker, setFWorker] = useState("");
  const [fGstin, setFGstin] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fSent, setFSent] = useState("");
  const [fDate, setFDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [fDue, setFDue] = useState("");
  const [fProcess, setFProcess] = useState("");

  const addRow = () => {
    if (!fWorker || !fProduct || !fSent) { toast.error("Job worker, product and qty required"); return; }
    setRows(prev => [...prev, {
      id: generateId(), challanNo: fNo || `JW-${Date.now().toString(36).toUpperCase()}`, jobWorker: fWorker, gstin: fGstin,
      product: fProduct, sentQty: parseFloat(fSent) || 0, receivedQty: 0, sentDate: fDate, dueDate: fDue, process: fProcess, status: "sent",
    }]);
    toast.success("Delivery challan recorded");
    setFNo(""); setFWorker(""); setFGstin(""); setFProduct(""); setFSent(""); setFDue(""); setFProcess(""); setShowForm(false);
  };

  const receiveQty = (id: string, qty: number) => setRows(prev => prev.map(r => {
    if (r.id !== id) return r;
    const received = Math.min(r.sentQty, r.receivedQty + qty);
    return { ...r, receivedQty: received, status: received >= r.sentQty ? "received" : received > 0 ? "partial" : "sent" };
  }));

  const today = new Date();
  // Sec 143: inputs must return within 1 year (365d), capital goods within 3 years.
  const overdueOf = (r: Challan) => r.status !== "received" ? differenceInDays(today, parseISO(r.sentDate)) : 0;
  const pending = rows.filter(r => r.status !== "received");
  const overdue1yr = pending.filter(r => overdueOf(r) > 365);
  const pendingQty = pending.reduce((s, r) => s + (r.sentQty - r.receivedQty), 0);
  const STATUS: Record<Challan["status"], string> = {
    sent: "bg-yellow-950/30 text-yellow-400", partial: "bg-blue-950/30 text-blue-400", received: "bg-green-950/30 text-green-400",
  };
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Job-Work Tracker (Sec 143 / ITC-04)</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Track goods sent to job workers under delivery challans and their return.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> New challan
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open Challans", value: pending.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Qty With Workers", value: pendingQty.toString(), color: "text-blue-400" },
          { label: "Overdue >1yr (143)", value: overdue1yr.length.toString(), color: overdue1yr.length > 0 ? "text-red-400" : "text-green-400" },
          { label: "Total Challans", value: rows.length.toString(), color: "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input value={fNo} onChange={e => setFNo(e.target.value)} placeholder="Challan no. (auto)" className={inp} />
            <input value={fWorker} onChange={e => setFWorker(e.target.value)} placeholder="Job worker *" className={inp} />
            <input value={fGstin} onChange={e => setFGstin(e.target.value.toUpperCase())} placeholder="Worker GSTIN" className={inp} maxLength={15} />
            <input value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="Goods / product *" className={inp} />
            <input type="number" value={fSent} onChange={e => setFSent(e.target.value)} placeholder="Qty sent *" className={inp} />
            <input value={fProcess} onChange={e => setFProcess(e.target.value)} placeholder="Process (e.g. galvanising)" className={inp} />
            <div><label className="text-[10px] text-[var(--color-muted)] block">Sent date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inp} /></div>
            <div><label className="text-[10px] text-[var(--color-muted)] block">Expected return</label><input type="date" value={fDue} onChange={e => setFDue(e.target.value)} className={inp} /></div>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addRow} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No job-work challans. Record goods sent out for processing to track ITC-04 returns.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Challan", "Job Worker", "Goods", "Sent", "Received", "Sent Date", "Age", "Status", "Receive", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...rows].sort((a, b) => b.sentDate.localeCompare(a.sentDate)).map(r => {
                  const age = overdueOf(r);
                  return (
                    <tr key={r.id} className={`border-b border-[var(--color-border)] last:border-0 ${age > 365 ? "bg-red-950/10" : "hover:bg-[var(--color-accent)]"}`}>
                      <td className="px-3 py-2.5 font-mono text-xs">{r.challanNo}</td>
                      <td className="px-3 py-2.5 text-xs font-medium">{r.jobWorker}{r.gstin && <span className="block text-[10px] text-[var(--color-muted)] font-mono">{r.gstin}</span>}</td>
                      <td className="px-3 py-2.5 text-xs">{r.product}{r.process && <span className="block text-[10px] text-[var(--color-muted)]">{r.process}</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.sentQty}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.receivedQty}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.sentDate}</td>
                      <td className={`px-3 py-2.5 tabular-nums text-xs ${age > 365 ? "text-red-400 font-bold" : "text-[var(--color-muted)]"}`}>{r.status === "received" ? "—" : `${age}d`}</td>
                      <td className="px-3 py-2.5"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS[r.status]}`}>{r.status}</span></td>
                      <td className="px-3 py-2.5">
                        {r.status !== "received" && (
                          <button onClick={() => receiveQty(r.id, r.sentQty - r.receivedQty)} className="text-[10px] text-[var(--color-primary)] hover:underline whitespace-nowrap">Receive all</button>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Under Sec 143 of CGST, inputs sent for job work must return within 1 year (capital goods 3 years) or GST is payable. File ITC-04 with these challan details. Consult a CA.</p>
    </div>
  );
}

/* ───────────────────────── #72 Production / BOM costing run ───────────────────────── */
function ProductionCostingTab() {
  type Comp = { id: string; material: string; qtyPerUnit: number; unitCost: number };
  type Run = { id: string; date: string; product: string; plannedQty: number; producedQty: number; laborCost: number; overheadCost: number; components: Comp[] };
  const [runs, setRuns] = useFeatureState<Run[]>("production-runs", []);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [pProduct, setPProduct] = useState("");
  const [pQty, setPQty] = useState("1");
  const [pDate, setPDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [cMat, setCMat] = useState("");
  const [cQty, setCQty] = useState("");
  const [cCost, setCCost] = useState("");

  const createRun = () => {
    if (!pProduct) { toast.error("Product name required"); return; }
    const id = generateId();
    setRuns(prev => [...prev, { id, date: pDate, product: pProduct, plannedQty: parseFloat(pQty) || 1, producedQty: 0, laborCost: 0, overheadCost: 0, components: [] }]);
    setActiveId(id); setPProduct(""); setPQty("1");
    toast.success("Production run created");
  };

  const active = runs.find(r => r.id === activeId) ?? null;
  const patch = (id: string, p: Partial<Run>) => setRuns(prev => prev.map(r => r.id === id ? { ...r, ...p } : r));
  const addComp = (id: string) => {
    if (!cMat || !cQty || !cCost) return;
    patch(id, { components: [...(active?.components ?? []), { id: generateId(), material: cMat, qtyPerUnit: parseFloat(cQty) || 0, unitCost: parseFloat(cCost) || 0 }] });
    setCMat(""); setCQty(""); setCCost("");
  };

  const cost = (r: Run) => {
    const matPerUnit = r.components.reduce((s, c) => s + c.qtyPerUnit * c.unitCost, 0);
    const totalMat = matPerUnit * r.plannedQty;
    const totalCost = totalMat + r.laborCost + r.overheadCost;
    const made = r.producedQty || r.plannedQty;
    const costPerUnit = made > 0 ? totalCost / made : 0;
    const yieldPct = r.plannedQty > 0 && r.producedQty > 0 ? Math.round((r.producedQty / r.plannedQty) * 100) : null;
    return { matPerUnit, totalMat, totalCost, costPerUnit, yieldPct };
  };
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Factory size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Production / BOM Costing</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Cost a manufacturing batch: materials + labour + overhead, with yield.</p>
        </div>
      </div>

      {runs.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Runs ({runs.length})</p></div>
          <div className="divide-y divide-[var(--color-border)]">
            {[...runs].sort((a, b) => b.date.localeCompare(a.date)).map(r => {
              const { costPerUnit, totalCost, yieldPct } = cost(r);
              return (
                <button key={r.id} onClick={() => setActiveId(r.id === activeId ? null : r.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-[var(--color-accent)] ${r.id === activeId ? "bg-[var(--color-primary)]/10" : ""}`}>
                  <div>
                    <p className="font-medium">{r.product}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{r.date} · {r.plannedQty} planned{yieldPct !== null ? ` · ${yieldPct}% yield` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums font-semibold">{formatCurrency(Math.round(costPerUnit))}/unit</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{formatCurrency(Math.round(totalCost))} total</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">New Production Run</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <input value={pProduct} onChange={e => setPProduct(e.target.value)} placeholder="Finished product *" className={inp} />
          <input type="number" value={pQty} onChange={e => setPQty(e.target.value)} placeholder="Planned qty" className={inp} />
          <div><label className="text-[10px] text-[var(--color-muted)] block">Date</label><input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={inp} /></div>
        </div>
        <button onClick={createRun} className="mt-2 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Create run</button>
      </div>

      {active && (() => {
        const { matPerUnit, totalMat, totalCost, costPerUnit, yieldPct } = cost(active);
        return (
          <div className="space-y-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">{active.product}</h3>
                <button onClick={() => { setRuns(prev => prev.filter(r => r.id !== active.id)); setActiveId(null); }} className="text-xs text-red-400 hover:underline">Delete run</button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div><label className="text-[10px] text-[var(--color-muted)] block">Produced qty</label><input type="number" value={active.producedQty || ""} onChange={e => patch(active.id, { producedQty: parseFloat(e.target.value) || 0 })} className={inp} /></div>
                <div><label className="text-[10px] text-[var(--color-muted)] block">Labour cost ₹</label><input type="number" value={active.laborCost || ""} onChange={e => patch(active.id, { laborCost: parseFloat(e.target.value) || 0 })} className={inp} /></div>
                <div><label className="text-[10px] text-[var(--color-muted)] block">Overhead ₹</label><input type="number" value={active.overheadCost || ""} onChange={e => patch(active.id, { overheadCost: parseFloat(e.target.value) || 0 })} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Material/unit", value: formatCurrency(Math.round(matPerUnit)), color: "text-[var(--color-text)]" },
                  { label: "Total material", value: formatCurrency(Math.round(totalMat)), color: "text-blue-400" },
                  { label: "Batch total", value: formatCurrency(Math.round(totalCost)), color: "text-red-400" },
                  { label: "Cost/unit", value: formatCurrency(Math.round(costPerUnit)), color: "text-[var(--color-primary)]" },
                ].map(k => (
                  <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                    <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              {yieldPct !== null && (
                <div className={`mt-3 rounded-lg px-4 py-2 text-xs border ${yieldPct >= 95 ? "bg-green-950/30 border-green-800/40 text-green-400" : yieldPct >= 85 ? "bg-yellow-950/30 border-yellow-800/40 text-yellow-400" : "bg-red-950/30 border-red-800/40 text-red-400"}`}>
                  Yield {yieldPct}% — {active.producedQty} of {active.plannedQty} planned ({active.plannedQty - active.producedQty} loss)
                </div>
              )}
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Components (per unit)</p></div>
              <div className="divide-y divide-[var(--color-border)]">
                {active.components.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="flex-1 font-medium">{c.material}</span>
                    <span className="text-xs text-[var(--color-muted)] tabular-nums">{c.qtyPerUnit} × {formatCurrency(c.unitCost)}</span>
                    <span className="tabular-nums font-semibold text-xs w-20 text-right">{formatCurrency(Math.round(c.qtyPerUnit * c.unitCost))}</span>
                    <button onClick={() => patch(active.id, { components: active.components.filter(x => x.id !== c.id) })} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                  </div>
                ))}
                {active.components.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-muted)]">No components. Add raw materials below.</p>}
              </div>
              <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] flex items-end gap-2 flex-wrap">
                <input value={cMat} onChange={e => setCMat(e.target.value)} placeholder="Material *" className="flex-1 min-w-[120px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                <input type="number" value={cQty} onChange={e => setCQty(e.target.value)} placeholder="Qty/unit" className="w-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                <input type="number" value={cCost} onChange={e => setCCost(e.target.value)} placeholder="Unit cost ₹" className="w-24 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                <button onClick={() => addComp(active.id)} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">+ Add</button>
              </div>
            </div>
          </div>
        );
      })()}

      {runs.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Factory size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No production runs. Create one to cost a manufacturing batch with materials, labour and overhead.</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── #73 Warehouse / multi-location stock + transfers ───────────────────────── */
function WarehouseStockTab() {
  type Loc = { id: string; name: string };
  type Bal = { id: string; locId: string; product: string; qty: number };
  type Transfer = { id: string; date: string; fromId: string; toId: string; product: string; qty: number };
  const [locs, setLocs] = useFeatureState<Loc[]>("warehouse-locations", []);
  const [bals, setBals] = useFeatureState<Bal[]>("warehouse-balances", []);
  const [transfers, setTransfers] = useFeatureState<Transfer[]>("warehouse-transfers", []);

  const [newLoc, setNewLoc] = useState("");
  const [bLoc, setBLoc] = useState("");
  const [bProduct, setBProduct] = useState("");
  const [bQty, setBQty] = useState("");

  const [tFrom, setTFrom] = useState("");
  const [tTo, setTTo] = useState("");
  const [tProduct, setTProduct] = useState("");
  const [tQty, setTQty] = useState("");

  const addLoc = () => {
    if (!newLoc.trim()) return;
    setLocs(prev => [...prev, { id: generateId(), name: newLoc.trim() }]);
    setNewLoc(""); toast.success("Location added");
  };

  const addStock = () => {
    if (!bLoc || !bProduct || !bQty) { toast.error("Location, product and qty required"); return; }
    const q = parseFloat(bQty) || 0;
    setBals(prev => {
      const ex = prev.find(b => b.locId === bLoc && b.product.toLowerCase() === bProduct.toLowerCase());
      if (ex) return prev.map(b => b.id === ex.id ? { ...b, qty: b.qty + q } : b);
      return [...prev, { id: generateId(), locId: bLoc, product: bProduct, qty: q }];
    });
    setBProduct(""); setBQty(""); toast.success("Stock added");
  };

  const doTransfer = () => {
    if (!tFrom || !tTo || !tProduct || !tQty) { toast.error("Fill all transfer fields"); return; }
    if (tFrom === tTo) { toast.error("Source and destination must differ"); return; }
    const q = parseFloat(tQty) || 0;
    const src = bals.find(b => b.locId === tFrom && b.product.toLowerCase() === tProduct.toLowerCase());
    if (!src || src.qty < q) { toast.error("Insufficient stock at source"); return; }
    setBals(prev => {
      let next = prev.map(b => b.id === src.id ? { ...b, qty: b.qty - q } : b);
      const dest = next.find(b => b.locId === tTo && b.product.toLowerCase() === tProduct.toLowerCase());
      if (dest) next = next.map(b => b.id === dest.id ? { ...b, qty: b.qty + q } : b);
      else next = [...next, { id: generateId(), locId: tTo, product: src.product, qty: q }];
      return next;
    });
    setTransfers(prev => [...prev, { id: generateId(), date: new Date().toISOString().split("T")[0], fromId: tFrom, toId: tTo, product: src.product, qty: q }]);
    setTProduct(""); setTQty(""); toast.success("Transfer completed");
  };

  const locName = (id: string) => locs.find(l => l.id === id)?.name ?? "—";
  const products = [...new Set(bals.map(b => b.product))];
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Warehouse size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Warehouses &amp; Multi-Location Stock</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Stock per location with inter-warehouse transfers.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-2">Locations</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {locs.map(l => (
            <span key={l.id} className="inline-flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-2.5 py-1 rounded-full">
              <Warehouse size={11} className="text-[var(--color-primary)]" />{l.name}
              <button onClick={() => { setLocs(prev => prev.filter(x => x.id !== l.id)); setBals(prev => prev.filter(b => b.locId !== l.id)); }} className="text-[var(--color-muted)] hover:text-red-400 ml-0.5"><X size={11} /></button>
            </span>
          ))}
          {locs.length === 0 && <span className="text-xs text-[var(--color-muted)]">No locations yet.</span>}
        </div>
        <div className="flex gap-2">
          <input value={newLoc} onChange={e => setNewLoc(e.target.value)} onKeyDown={e => e.key === "Enter" && addLoc()} placeholder="Warehouse / shop name" className={`${inp} flex-1`} />
          <button onClick={addLoc} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 whitespace-nowrap">+ Add</button>
        </div>
      </div>

      {locs.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-sm font-semibold mb-2">Add Stock</p>
            <div className="space-y-2">
              <select value={bLoc} onChange={e => setBLoc(e.target.value)} className={inp}>
                <option value="">Select location…</option>
                {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <input value={bProduct} onChange={e => setBProduct(e.target.value)} placeholder="Product" className={inp} />
              <input type="number" value={bQty} onChange={e => setBQty(e.target.value)} placeholder="Quantity" className={inp} />
              <button onClick={addStock} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Add to location</button>
            </div>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1"><Route size={13} className="text-[var(--color-primary)]" /> Transfer Stock</p>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select value={tFrom} onChange={e => setTFrom(e.target.value)} className={inp}>
                  <option value="">From…</option>{locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={tTo} onChange={e => setTTo(e.target.value)} className={inp}>
                  <option value="">To…</option>{locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <select value={tProduct} onChange={e => setTProduct(e.target.value)} className={inp}>
                <option value="">Product…</option>{products.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="number" value={tQty} onChange={e => setTQty(e.target.value)} placeholder="Quantity" className={inp} />
              <button onClick={doTransfer} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Transfer</button>
            </div>
          </div>
        </div>
      )}

      {bals.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Stock by Location</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Location", "Product", "Qty", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...bals].sort((a, b) => locName(a.locId).localeCompare(locName(b.locId)) || a.product.localeCompare(b.product)).map(b => (
                  <tr key={b.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 text-xs">{locName(b.locId)}</td>
                    <td className="px-4 py-2.5 font-medium">{b.product}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${b.qty <= 0 ? "text-red-400" : ""}`}>{b.qty}</td>
                    <td className="px-4 py-2.5"><button onClick={() => setBals(prev => prev.filter(x => x.id !== b.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {transfers.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Transfer History ({transfers.length})</p></div>
          <div className="divide-y divide-[var(--color-border)]">
            {[...transfers].reverse().slice(0, 20).map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-[var(--color-muted)]">{t.date}</span>
                <span className="flex items-center gap-1.5"><span className="font-medium">{t.product}</span> × {t.qty}</span>
                <span className="flex items-center gap-1 text-[var(--color-muted)]">{locName(t.fromId)} <ArrowUpRight size={11} className="text-[var(--color-primary)]" /> {locName(t.toId)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {locs.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Warehouse size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add a warehouse or shop above to start tracking stock across locations.</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── #74 Barcode / QR stock-take reconciliation ───────────────────────── */
function StockTakeTab() {
  const { store } = useApp();
  type Count = { id: string; sku: string; product: string; systemQty: number; countedQty: number };
  const [counts, setCounts] = useFeatureState<Count[]>("stock-take-counts", []);
  const [scan, setScan] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Scan/lookup: matches an inventory SKU or product name, seeds the system qty.
  const submitScan = () => {
    const code = scan.trim();
    if (!code) return;
    const match = store.inventory.find(i =>
      (i.sku && i.sku.toLowerCase() === code.toLowerCase()) || i.productName.toLowerCase() === code.toLowerCase()
    );
    const sku = match?.sku || code;
    setCounts(prev => {
      const ex = prev.find(c => c.sku.toLowerCase() === sku.toLowerCase());
      if (ex) return prev.map(c => c.id === ex.id ? { ...c, countedQty: c.countedQty + 1 } : c);
      return [...prev, { id: generateId(), sku, product: match?.productName || code, systemQty: match?.quantity ?? 0, countedQty: 1 }];
    });
    setScan("");
    inputRef.current?.focus();
  };

  const setCounted = (id: string, v: number) => setCounts(prev => prev.map(c => c.id === id ? { ...c, countedQty: Math.max(0, v) } : c));
  const variances = counts.map(c => ({ ...c, variance: c.countedQty - c.systemQty }));
  const mismatches = variances.filter(v => v.variance !== 0);
  const netVar = variances.reduce((s, v) => s + v.variance, 0);

  const exportCsv = () => {
    const header = ["SKU", "Product", "System Qty", "Counted Qty", "Variance"];
    const lines = variances.map(v => [v.sku, v.product, v.systemQty, v.countedQty, v.variance].join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" }));
    a.download = "stock-take.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ScanLine size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Barcode / QR Stock-Take</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Scan or type a code; each scan adds 1. Reconcile counted vs system stock.</p>
          </div>
        </div>
        {counts.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportCsv} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40"><Download size={11} /> CSV</button>
            <button onClick={() => setCounts([])} className="text-xs text-[var(--color-muted)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:text-red-400">Reset</button>
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input ref={inputRef} value={scan} onChange={e => setScan(e.target.value)} onKeyDown={e => e.key === "Enter" && submitScan()} autoFocus
              placeholder="Scan barcode / QR or type SKU, then Enter"
              className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm outline-none focus:border-[var(--color-primary)] font-mono" />
          </div>
          <button onClick={submitScan} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 whitespace-nowrap">+ Count</button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">USB / Bluetooth scanners type the code and send Enter automatically — this field is ready for them.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Lines Counted", value: counts.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Mismatches", value: mismatches.length.toString(), color: mismatches.length > 0 ? "text-red-400" : "text-green-400" },
          { label: "Net Variance", value: (netVar > 0 ? "+" : "") + netVar, color: netVar === 0 ? "text-green-400" : "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {counts.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Start scanning to build a count sheet. Known SKUs pull their system quantity automatically.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["SKU", "Product", "System", "Counted", "Variance", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {variances.map(v => (
                  <tr key={v.id} className={`border-b border-[var(--color-border)] last:border-0 ${v.variance !== 0 ? "bg-yellow-950/10" : "hover:bg-[var(--color-accent)]"}`}>
                    <td className="px-4 py-2.5 font-mono text-xs">{v.sku}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{v.product}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{v.systemQty}</td>
                    <td className="px-4 py-2.5">
                      <input type="number" value={v.countedQty} onChange={e => setCounted(v.id, parseFloat(e.target.value) || 0)}
                        className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums" />
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${v.variance > 0 ? "text-green-400" : v.variance < 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{v.variance > 0 ? `+${v.variance}` : v.variance}</td>
                    <td className="px-4 py-2.5"><button onClick={() => setCounts(prev => prev.filter(x => x.id !== v.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Positive variance = more physical stock than system (under-recorded); negative = shrinkage / loss. Export the variance sheet to adjust your inventory.</p>
    </div>
  );
}

/* ───────────────────────── #75 Dispatch / Route planner ───────────────────────── */
function DispatchPlannerTab() {
  type Stop = { id: string; date: string; customer: string; address: string; area: string; weightKg: number; status: "pending" | "loaded" | "delivered" };
  const [stops, setStops] = useFeatureState<Stop[]>("dispatch-stops", []);
  const [showForm, setShowForm] = useState(false);

  const [fDate, setFDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [fCustomer, setFCustomer] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fArea, setFArea] = useState("");
  const [fWeight, setFWeight] = useState("");

  const addStop = () => {
    if (!fCustomer || !fAddress) { toast.error("Customer and address required"); return; }
    setStops(prev => [...prev, { id: generateId(), date: fDate, customer: fCustomer, address: fAddress, area: fArea, weightKg: parseFloat(fWeight) || 0, status: "pending" }]);
    toast.success("Stop added to plan");
    setFCustomer(""); setFAddress(""); setFArea(""); setFWeight(""); setShowForm(false);
  };

  const cycle = (id: string) => setStops(prev => prev.map(s => s.id === id
    ? { ...s, status: s.status === "pending" ? "loaded" : s.status === "loaded" ? "delivered" : "pending" } : s));

  // Build a route per day, grouping stops by area to minimise back-tracking.
  const today = new Date().toISOString().split("T")[0];
  const todayStops = stops.filter(s => s.date === today);
  const route = useMemo(() => {
    return [...todayStops].sort((a, b) =>
      (a.area || "zzz").localeCompare(b.area || "zzz") || a.customer.localeCompare(b.customer)
    );
  }, [todayStops]);
  const totalWeight = todayStops.reduce((s, x) => s + x.weightKg, 0);
  const delivered = todayStops.filter(s => s.status === "delivered").length;
  const STATUS: Record<Stop["status"], string> = {
    pending: "bg-[var(--color-accent)] text-[var(--color-muted)]", loaded: "bg-blue-950/30 text-blue-400", delivered: "bg-green-950/30 text-green-400",
  };
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Route size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Dispatch / Route Planner</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Plan today's delivery run, grouped by area for an efficient route.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> Add stop
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Stops Today", value: todayStops.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Delivered", value: `${delivered}/${todayStops.length}`, color: "text-green-400" },
          { label: "Total Load", value: `${totalWeight} kg`, color: "text-blue-400" },
          { label: "All Planned Stops", value: stops.length.toString(), color: "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><label className="text-[10px] text-[var(--color-muted)] block">Date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inp} /></div>
            <input value={fCustomer} onChange={e => setFCustomer(e.target.value)} placeholder="Customer *" className={inp} />
            <input value={fArea} onChange={e => setFArea(e.target.value)} placeholder="Area / zone" className={inp} />
            <input type="number" value={fWeight} onChange={e => setFWeight(e.target.value)} placeholder="Weight (kg)" className={inp} />
            <input value={fAddress} onChange={e => setFAddress(e.target.value)} placeholder="Delivery address *" className={`${inp} md:col-span-4`} />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addStop} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Today's Route ({route.length} stops, area-optimised)</p></div>
        {route.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No stops planned for today. Add deliveries to build an area-grouped route.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {route.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-xs font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.customer}{s.area && <span className="ml-2 text-[10px] text-[var(--color-muted)] bg-[var(--color-accent)] px-1.5 py-0.5 rounded">{s.area}</span>}</p>
                  <p className="text-xs text-[var(--color-muted)] truncate">{s.address}{s.weightKg > 0 ? ` · ${s.weightKg} kg` : ""}</p>
                </div>
                <button onClick={() => cycle(s.id)} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS[s.status]}`}>{s.status}</button>
                <button onClick={() => setStops(prev => prev.filter(x => x.id !== s.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {stops.some(s => s.date !== today) && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Other-Day Stops</p></div>
          <div className="divide-y divide-[var(--color-border)]">
            {stops.filter(s => s.date !== today).sort((a, b) => a.date.localeCompare(b.date)).map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-[var(--color-muted)] tabular-nums">{s.date}</span>
                <span className="font-medium flex-1 px-3 truncate">{s.customer} <span className="text-[var(--color-muted)]">{s.area}</span></span>
                <button onClick={() => setStops(prev => prev.filter(x => x.id !== s.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Stops are grouped by area to reduce back-tracking. Tap a status chip to cycle pending → loaded → delivered.</p>
    </div>
  );
}

/* ───────────────────────── #22 ABC inventory analysis (Pareto by value) ───────────────────────── */
function AbcAnalysisTab() {
  const { store } = useApp();
  const { inventory } = store;

  // Annual usage value = unit cost × quantity-on-hand (proxy for consumption value when
  // no sales velocity exists). Rank descending, then bucket by cumulative value share.
  const rows = useMemo(() => {
    const valued = inventory.map(i => ({
      id: i.id, product: i.productName, sku: i.sku, qty: i.quantity,
      unitCost: i.unitCost, annualValue: i.quantity * i.unitCost,
    })).sort((a, b) => b.annualValue - a.annualValue);
    const grand = valued.reduce((s, v) => s + v.annualValue, 0) || 1;
    let cum = 0;
    return valued.map(v => {
      cum += v.annualValue;
      const cumPct = (cum / grand) * 100;
      const cls: "A" | "B" | "C" = cumPct <= 80 ? "A" : cumPct <= 95 ? "B" : "C";
      return { ...v, sharePct: (v.annualValue / grand) * 100, cumPct, cls };
    });
  }, [inventory]);

  const grand = rows.reduce((s, v) => s + v.annualValue, 0);
  const summary = (["A", "B", "C"] as const).map(c => {
    const list = rows.filter(r => r.cls === c);
    return { cls: c, count: list.length, value: list.reduce((s, v) => s + v.annualValue, 0) };
  });
  const CLS_STYLE: Record<string, string> = {
    A: "bg-red-950/30 text-red-400 border-red-800/40",
    B: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
    C: "bg-green-950/30 text-green-400 border-green-800/40",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PieChart size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">ABC Inventory Analysis</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Pareto classification by stock value — focus controls on the vital few (A) items.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {summary.map(s => (
          <div key={s.cls} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-[var(--color-muted)]">Class {s.cls} · {s.count} SKU{s.count === 1 ? "" : "s"}</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CLS_STYLE[s.cls]}`}>{s.cls}</span>
            </div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(Math.round(s.value))}</p>
            <p className="text-[10px] text-[var(--color-muted)]">{grand > 0 ? Math.round((s.value / grand) * 100) : 0}% of value</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No inventory yet. Add SKUs in the Inventory tab and they will be auto-classified A/B/C by value.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Rank", "Product", "Qty", "Unit Cost", "Stock Value", "% of Value", "Cumulative %", "Class"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{r.product}{r.sku && <span className="ml-1 text-[10px] text-[var(--color-muted)] font-mono">{r.sku}</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.qty}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.unitCost)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)] font-semibold">{formatCurrency(Math.round(r.annualValue))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{r.sharePct.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.cumPct.toFixed(1)}%</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CLS_STYLE[r.cls]}`}>{r.cls}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Class A ≈ top 80% of value, B the next 15%, C the final 5%. Tighten counts, security and supplier terms on A items; relax on C.</p>
    </div>
  );
}

/* ───────────────────────── #28 Economic Order Quantity (EOQ) calculator ───────────────────────── */
function EoqCalculatorTab() {
  const { store } = useApp();
  const [product, setProduct] = useState("");
  const [annualDemand, setAnnualDemand] = useState("1200");
  const [orderCost, setOrderCost] = useState("500");
  const [unitCost, setUnitCost] = useState("100");
  const [holdingPct, setHoldingPct] = useState("20");

  const D = Math.max(0, parseFloat(annualDemand) || 0);
  const S = Math.max(0, parseFloat(orderCost) || 0);
  const C = Math.max(0, parseFloat(unitCost) || 0);
  const Hpct = Math.max(0, parseFloat(holdingPct) || 0);
  const H = C * (Hpct / 100); // holding cost per unit / year

  const eoq = D > 0 && S > 0 && H > 0 ? Math.sqrt((2 * D * S) / H) : 0;
  const ordersPerYear = eoq > 0 ? D / eoq : 0;
  const cycleDays = ordersPerYear > 0 ? 365 / ordersPerYear : 0;
  const annualOrderCost = eoq > 0 ? (D / eoq) * S : 0;
  const annualHoldingCost = (eoq / 2) * H;
  const totalCost = annualOrderCost + annualHoldingCost;

  const onPick = (name: string) => {
    const it = store.inventory.find(i => i.productName === name);
    setProduct(name);
    if (it) setUnitCost(String(it.unitCost));
  };
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Calculator size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Economic Order Quantity (EOQ)</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Find the order size that minimises combined ordering + holding cost.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Product (optional)</label>
            <input value={product} onChange={e => onPick(e.target.value)} placeholder="Pick / type" className={inp} list="eoq-products" />
            <datalist id="eoq-products">{store.inventory.map(i => <option key={i.id} value={i.productName} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Annual demand (units)</label><input type="number" value={annualDemand} onChange={e => setAnnualDemand(e.target.value)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Cost per order (₹)</label><input type="number" value={orderCost} onChange={e => setOrderCost(e.target.value)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Unit cost (₹)</label><input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Holding cost (% of unit/yr)</label><input type="number" value={holdingPct} onChange={e => setHoldingPct(e.target.value)} className={inp} /></div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-5 text-center">
        <p className="text-xs text-[var(--color-muted)] mb-1">Optimal order quantity</p>
        <p className="text-4xl font-bold text-[var(--color-primary)] tabular-nums">{eoq > 0 ? Math.round(eoq) : "—"}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">units per order{eoq > 0 ? ` · ${ordersPerYear.toFixed(1)} orders/yr · every ${Math.round(cycleDays)} days` : ""}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Holding cost / unit / yr", value: formatCurrency(Math.round(H)), color: "text-orange-400" },
          { label: "Annual ordering cost", value: formatCurrency(Math.round(annualOrderCost)), color: "text-blue-400" },
          { label: "Annual holding cost", value: formatCurrency(Math.round(annualHoldingCost)), color: "text-yellow-400" },
          { label: "Total annual cost", value: formatCurrency(Math.round(totalCost)), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">EOQ = √(2 · D · S / H), where D = annual demand, S = cost per order, H = holding cost per unit per year. At the EOQ, ordering cost equals holding cost.</p>
    </div>
  );
}

/* ───────────────────────── #51 Stock-turnover ratio & days-of-inventory ───────────────────────── */
function StockTurnoverTab() {
  const { store } = useApp();
  const { inventory, orders } = store;
  const [periodDays, setPeriodDays] = useState("365");

  // Units sold per product from fulfilled orders → COGS proxy via current unit cost.
  const rows = useMemo(() => {
    const soldUnits: Record<string, number> = {};
    orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o =>
      o.items.forEach(it => { soldUnits[it.productName] = (soldUnits[it.productName] ?? 0) + it.quantity; })
    );
    const days = Math.max(1, parseFloat(periodDays) || 365);
    return inventory.map(i => {
      const sold = soldUnits[i.productName] ?? 0;
      const cogs = sold * i.unitCost;
      const avgInvValue = i.quantity * i.unitCost; // closing as proxy for average
      const turns = avgInvValue > 0 ? cogs / avgInvValue : 0;
      const dio = turns > 0 ? days / turns : null; // days of inventory
      return { id: i.id, product: i.productName, sku: i.sku, sold, cogs, avgInvValue, turns, dio };
    }).sort((a, b) => b.turns - a.turns);
  }, [inventory, orders, periodDays]);

  const totalCogs = rows.reduce((s, r) => s + r.cogs, 0);
  const totalInv = rows.reduce((s, r) => s + r.avgInvValue, 0);
  const overallTurns = totalInv > 0 ? totalCogs / totalInv : 0;
  const days = Math.max(1, parseFloat(periodDays) || 365);
  const overallDio = overallTurns > 0 ? days / overallTurns : 0;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] w-20";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Repeat size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Stock Turnover &amp; Days of Inventory</h2>
            <p className="text-[11px] text-[var(--color-muted)]">How many times stock cycles per period — higher turns free up working capital.</p>
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">Period (days)<input type="number" value={periodDays} onChange={e => setPeriodDays(e.target.value)} className={inp} /></label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Overall Turns", value: overallTurns > 0 ? `${overallTurns.toFixed(1)}×` : "—", color: "text-[var(--color-primary)]" },
          { label: "Avg Days of Inventory", value: overallDio > 0 ? `${Math.round(overallDio)}d` : "—", color: overallDio > 90 ? "text-red-400" : "text-green-400" },
          { label: "Period COGS (est.)", value: formatCurrency(Math.round(totalCogs)), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No inventory yet. Add SKUs and confirm orders so turnover can be computed from real sales.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "Units Sold", "Stock Value", "COGS (est.)", "Turns", "Days of Inv."].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.product}{r.sku && <span className="ml-1 text-[10px] text-[var(--color-muted)] font-mono">{r.sku}</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.sold}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.avgInvValue))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(r.cogs))}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${r.turns >= 4 ? "text-green-400" : r.turns > 0 ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>{r.turns > 0 ? `${r.turns.toFixed(1)}×` : "—"}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${r.dio !== null && r.dio > 120 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{r.dio !== null ? `${Math.round(r.dio)}d` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Turns = period COGS ÷ stock value. Days of Inventory = period ÷ turns. COGS is estimated from fulfilled-order units × current unit cost.</p>
    </div>
  );
}

/* ───────────────────────── #26/#36 Gross margin by SKU ───────────────────────── */
function SkuMarginTab() {
  const { store } = useApp();
  type Override = { sellPrice: number };
  const [overrides, setOverrides] = useFeatureState<Record<string, Override>>("ops-sku-margin-prices", {});

  const rows = useMemo(() => store.inventory.map(i => {
    const sell = overrides[i.id]?.sellPrice ?? Math.round(i.unitCost * 1.4); // default 40% markup
    const profit = sell - i.unitCost;
    const marginPct = sell > 0 ? (profit / sell) * 100 : 0;
    const markupPct = i.unitCost > 0 ? (profit / i.unitCost) * 100 : 0;
    const stockProfit = profit * i.quantity;
    return { id: i.id, product: i.productName, sku: i.sku, qty: i.quantity, cost: i.unitCost, sell, profit, marginPct, markupPct, stockProfit };
  }).sort((a, b) => a.marginPct - b.marginPct), [store.inventory, overrides]);

  const setSell = (id: string, v: string) =>
    setOverrides(prev => ({ ...prev, [id]: { sellPrice: Math.max(0, parseFloat(v) || 0) } }));

  const totalPotential = rows.reduce((s, r) => s + r.stockProfit, 0);
  const lowMargin = rows.filter(r => r.marginPct < 15).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Percent size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Gross Margin by SKU</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Set a selling price per SKU and see margin %, markup, and profit locked in current stock.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "SKUs Priced", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Low Margin (<15%)", value: lowMargin.toString(), color: lowMargin > 0 ? "text-red-400" : "text-green-400" },
          { label: "Profit in Stock", value: formatCurrency(Math.round(totalPotential)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No inventory yet. Add SKUs in the Inventory tab, then set selling prices here to track margin.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "Cost", "Sell Price", "Profit/Unit", "Margin %", "Markup %", "Profit in Stock"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.product}{r.sku && <span className="ml-1 text-[10px] text-[var(--color-muted)] font-mono">{r.sku}</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.cost)}</td>
                    <td className="px-4 py-2.5">
                      <input type="number" value={r.sell} onChange={e => setSell(r.id, e.target.value)}
                        className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums" />
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums ${r.profit < 0 ? "text-red-400" : ""}`}>{formatCurrency(Math.round(r.profit))}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${r.marginPct >= 30 ? "text-green-400" : r.marginPct >= 15 ? "text-yellow-400" : "text-red-400"}`}>{r.marginPct.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.markupPct.toFixed(0)}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)] font-semibold">{formatCurrency(Math.round(r.stockProfit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Margin % = profit ÷ selling price; markup % = profit ÷ cost. Selling prices default to cost + 40% and are saved per SKU. Rows sorted lowest-margin first.</p>
    </div>
  );
}

/* ───────────────────────── #13 Landed-cost allocation calculator ───────────────────────── */
function LandedCostTab() {
  type Line = { id: string; item: string; qty: number; unitCost: number; weightKg: number };
  const [lines, setLines] = useFeatureState<Line[]>("ops-landed-lines", []);
  const [freight, setFreight] = useFeatureState<number>("ops-landed-freight", 0);
  const [duty, setDuty] = useFeatureState<number>("ops-landed-duty", 0);
  const [insurance, setInsurance] = useFeatureState<number>("ops-landed-insurance", 0);
  const [basis, setBasis] = useState<"value" | "weight">("value");

  const [iName, setIName] = useState("");
  const [iQty, setIQty] = useState("");
  const [iCost, setICost] = useState("");
  const [iWeight, setIWeight] = useState("");

  const addLine = () => {
    if (!iName || !iCost) { toast.error("Item and unit cost required"); return; }
    setLines(prev => [...prev, { id: generateId(), item: iName, qty: parseFloat(iQty) || 1, unitCost: parseFloat(iCost) || 0, weightKg: parseFloat(iWeight) || 0 }]);
    setIName(""); setIQty(""); setICost(""); setIWeight("");
  };

  const overhead = (parseFloat(String(freight)) || 0) + (parseFloat(String(duty)) || 0) + (parseFloat(String(insurance)) || 0);
  const computed = useMemo(() => {
    const goodsValue = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
    const totalWeight = lines.reduce((s, l) => s + l.weightKg * l.qty, 0);
    return lines.map(l => {
      const lineValue = l.qty * l.unitCost;
      const lineWeight = l.weightKg * l.qty;
      const share = basis === "weight"
        ? (totalWeight > 0 ? lineWeight / totalWeight : 0)
        : (goodsValue > 0 ? lineValue / goodsValue : 0);
      const allocOverhead = overhead * share;
      const landedTotal = lineValue + allocOverhead;
      const landedUnit = l.qty > 0 ? landedTotal / l.qty : 0;
      return { ...l, lineValue, allocOverhead, landedTotal, landedUnit, upliftPct: l.unitCost > 0 ? ((landedUnit - l.unitCost) / l.unitCost) * 100 : 0 };
    });
  }, [lines, overhead, basis]);

  const goodsValue = computed.reduce((s, l) => s + l.lineValue, 0);
  const grandLanded = goodsValue + overhead;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";
  const numField = (label: string, val: number, set: (n: number) => void) => (
    <div>
      <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">{label}</label>
      <input type="number" value={val || ""} onChange={e => set(parseFloat(e.target.value) || 0)} placeholder="₹" className={inp} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Ship size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Landed-Cost Calculator</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Spread freight, duty &amp; insurance across imported items by value or weight.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm font-semibold">Shipment Overheads</p>
          <div className="flex bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5">
            {(["value", "weight"] as const).map(b => (
              <button key={b} onClick={() => setBasis(b)} className={`text-xs px-3 py-1 rounded font-semibold transition-colors ${basis === b ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)]"}`}>
                By {b}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {numField("Freight (₹)", freight, setFreight)}
          {numField("Customs duty (₹)", duty, setDuty)}
          {numField("Insurance (₹)", insurance, setInsurance)}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-2">Add Item</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input value={iName} onChange={e => setIName(e.target.value)} placeholder="Item *" className={inp} />
          <input type="number" value={iQty} onChange={e => setIQty(e.target.value)} placeholder="Qty" className={inp} />
          <input type="number" value={iCost} onChange={e => setICost(e.target.value)} placeholder="Unit cost ₹ *" className={inp} />
          <input type="number" value={iWeight} onChange={e => setIWeight(e.target.value)} placeholder="Weight/unit (kg)" className={inp} />
        </div>
        <button onClick={addLine} className="mt-2 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add item</button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {computed.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Add imported items and shipment overheads to allocate true landed cost.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Item", "Qty", "Goods Value", "Alloc. Overhead", "Landed Total", "Landed / Unit", "Uplift", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {computed.map(l => (
                  <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{l.item}</td>
                    <td className="px-4 py-2.5 tabular-nums">{l.qty}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(l.lineValue))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(l.allocOverhead))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)] font-semibold">{formatCurrency(Math.round(l.landedTotal))}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(l.landedUnit))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-yellow-400">+{l.upliftPct.toFixed(0)}%</td>
                    <td className="px-4 py-2.5"><button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-accent)] font-semibold">
                  <td className="px-4 py-2.5 text-xs" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(goodsValue))}</td>
                  <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(overhead))}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(grandLanded))}</td>
                  <td className="px-4 py-2.5" colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Overheads are apportioned by each item's share of total goods value (or weight). Landed unit cost = goods + allocated overhead, the true cost to value stock and price imports.</p>
    </div>
  );
}

/* ───────────────────────── #32/#33 GRN vs PO discrepancy log (3-way match) ───────────────────────── */
function GrnDiscrepancyTab() {
  type Grn = { id: string; date: string; poRef: string; vendor: string; item: string; orderedQty: number; receivedQty: number; orderedRate: number; invoicedRate: number; note: string };
  const [rows, setRows] = useFeatureState<Grn[]>("ops-grn-log", []);
  const [showForm, setShowForm] = useState(false);

  const [fDate, setFDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [fPo, setFPo] = useState("");
  const [fVendor, setFVendor] = useState("");
  const [fItem, setFItem] = useState("");
  const [fOrdered, setFOrdered] = useState("");
  const [fReceived, setFReceived] = useState("");
  const [fRate, setFRate] = useState("");
  const [fInvRate, setFInvRate] = useState("");
  const [fNote, setFNote] = useState("");

  const addRow = () => {
    if (!fVendor || !fItem) { toast.error("Vendor and item required"); return; }
    setRows(prev => [...prev, {
      id: generateId(), date: fDate, poRef: fPo, vendor: fVendor, item: fItem,
      orderedQty: parseFloat(fOrdered) || 0, receivedQty: parseFloat(fReceived) || 0,
      orderedRate: parseFloat(fRate) || 0, invoicedRate: parseFloat(fInvRate) || (parseFloat(fRate) || 0), note: fNote,
    }]);
    toast.success("GRN recorded");
    setFPo(""); setFVendor(""); setFItem(""); setFOrdered(""); setFReceived(""); setFRate(""); setFInvRate(""); setFNote(""); setShowForm(false);
  };

  const analysed = rows.map(r => {
    const qtyDiff = r.receivedQty - r.orderedQty;
    const rateDiff = r.invoicedRate - r.orderedRate;
    const priceVariance = rateDiff * r.receivedQty;
    const ok = qtyDiff === 0 && Math.abs(rateDiff) < 0.001;
    return { ...r, qtyDiff, rateDiff, priceVariance, ok };
  });
  const mismatches = analysed.filter(r => !r.ok);
  const netVariance = analysed.reduce((s, r) => s + r.priceVariance, 0);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">GRN vs PO Discrepancy Log</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Three-way check: ordered vs received quantity and PO rate vs invoiced rate.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> Record GRN
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "GRNs Logged", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "With Discrepancy", value: mismatches.length.toString(), color: mismatches.length > 0 ? "text-red-400" : "text-green-400" },
          { label: "Net Price Variance", value: formatCurrency(Math.round(netVariance)), color: netVariance > 0 ? "text-red-400" : netVariance < 0 ? "text-green-400" : "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><label className="text-[10px] text-[var(--color-muted)] block">Date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inp} /></div>
            <input value={fPo} onChange={e => setFPo(e.target.value)} placeholder="PO reference" className={inp} />
            <input value={fVendor} onChange={e => setFVendor(e.target.value)} placeholder="Vendor *" className={inp} />
            <input value={fItem} onChange={e => setFItem(e.target.value)} placeholder="Item *" className={inp} />
            <input type="number" value={fOrdered} onChange={e => setFOrdered(e.target.value)} placeholder="Ordered qty" className={inp} />
            <input type="number" value={fReceived} onChange={e => setFReceived(e.target.value)} placeholder="Received qty" className={inp} />
            <input type="number" value={fRate} onChange={e => setFRate(e.target.value)} placeholder="PO rate ₹" className={inp} />
            <input type="number" value={fInvRate} onChange={e => setFInvRate(e.target.value)} placeholder="Invoiced rate ₹" className={inp} />
            <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Note / quality hold" className={`${inp} md:col-span-4`} />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addRow} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {analysed.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No GRNs recorded. Log goods receipts against POs to catch short deliveries and price mismatches before paying.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Date", "PO", "Vendor", "Item", "Ord/Recd", "Qty Δ", "Rate (PO→Inv)", "Price Variance", "Status", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...analysed].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                  <tr key={r.id} className={`border-b border-[var(--color-border)] last:border-0 ${!r.ok ? "bg-red-950/10" : "hover:bg-[var(--color-accent)]"}`}>
                    <td className="px-3 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.date}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.poRef || "—"}</td>
                    <td className="px-3 py-2.5 text-xs font-medium">{r.vendor}</td>
                    <td className="px-3 py-2.5 text-xs">{r.item}</td>
                    <td className="px-3 py-2.5 tabular-nums text-xs">{r.orderedQty} / {r.receivedQty}</td>
                    <td className={`px-3 py-2.5 tabular-nums text-xs font-bold ${r.qtyDiff !== 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{r.qtyDiff > 0 ? `+${r.qtyDiff}` : r.qtyDiff}</td>
                    <td className="px-3 py-2.5 tabular-nums text-xs">{formatCurrency(r.orderedRate)} → {formatCurrency(r.invoicedRate)}</td>
                    <td className={`px-3 py-2.5 tabular-nums text-xs font-semibold ${r.priceVariance > 0 ? "text-red-400" : r.priceVariance < 0 ? "text-green-400" : "text-[var(--color-muted)]"}`}>{r.priceVariance !== 0 ? formatCurrency(Math.round(r.priceVariance)) : "—"}</td>
                    <td className="px-3 py-2.5">{r.ok ? <span className="text-[10px] font-semibold text-green-400 bg-green-950/30 px-2 py-0.5 rounded-full">Matched</span> : <span className="text-[10px] font-semibold text-red-400 bg-red-950/30 px-2 py-0.5 rounded-full">Discrepancy</span>}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Positive qty Δ = over-delivery; negative = short receipt. Positive price variance = vendor invoiced above PO rate — resolve before approving payment.</p>
    </div>
  );
}

/* ───────────────────────── #49 Scrap / wastage tracker ───────────────────────── */
function ScrapWastageTab() {
  const { store } = useApp();
  type Scrap = { id: string; date: string; product: string; qty: number; unitCost: number; reason: string };
  const [rows, setRows] = useFeatureState<Scrap[]>("ops-scrap-log", []);
  const [showForm, setShowForm] = useState(false);

  const REASONS = ["Damaged", "Expired", "Production loss", "Quality reject", "Spillage", "Theft / shrinkage", "Other"];
  const [fDate, setFDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [fProduct, setFProduct] = useState("");
  const [fQty, setFQty] = useState("");
  const [fCost, setFCost] = useState("");
  const [fReason, setFReason] = useState(REASONS[0]);

  const onPick = (name: string) => {
    setFProduct(name);
    const it = store.inventory.find(i => i.productName === name);
    if (it) setFCost(String(it.unitCost));
  };

  const addRow = () => {
    if (!fProduct || !fQty) { toast.error("Product and quantity required"); return; }
    setRows(prev => [...prev, { id: generateId(), date: fDate, product: fProduct, qty: parseFloat(fQty) || 0, unitCost: parseFloat(fCost) || 0, reason: fReason }]);
    toast.success("Wastage recorded");
    setFProduct(""); setFQty(""); setFCost(""); setFReason(REASONS[0]); setShowForm(false);
  };

  const totalLoss = rows.reduce((s, r) => s + r.qty * r.unitCost, 0);
  const byReason = REASONS.map(reason => ({
    reason, value: rows.filter(r => r.reason === reason).reduce((s, r) => s + r.qty * r.unitCost, 0),
  })).filter(b => b.value > 0).sort((a, b) => b.value - a.value);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Scrap / Wastage Tracker</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Log damaged, expired and production-loss stock with its cost impact.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> Record wastage
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Entries", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Total Loss Value", value: formatCurrency(Math.round(totalLoss)), color: totalLoss > 0 ? "text-red-400" : "text-green-400" },
          { label: "Top Reason", value: byReason[0]?.reason ?? "—", color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {byReason.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-sm font-semibold mb-2">Loss by Reason</p>
          <div className="space-y-2">
            {byReason.map(b => (
              <div key={b.reason} className="flex items-center gap-3">
                <span className="text-xs w-32 shrink-0 text-[var(--color-muted)]">{b.reason}</span>
                <div className="flex-1 h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full bg-red-500/70 rounded-full" style={{ width: `${totalLoss > 0 ? (b.value / totalLoss) * 100 : 0}%` }} />
                </div>
                <span className="text-xs tabular-nums w-24 text-right font-semibold">{formatCurrency(Math.round(b.value))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><label className="text-[10px] text-[var(--color-muted)] block">Date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inp} /></div>
            <input value={fProduct} onChange={e => onPick(e.target.value)} placeholder="Product *" className={inp} list="scrap-products" />
            <datalist id="scrap-products">{store.inventory.map(i => <option key={i.id} value={i.productName} />)}</datalist>
            <input type="number" value={fQty} onChange={e => setFQty(e.target.value)} placeholder="Qty *" className={inp} />
            <input type="number" value={fCost} onChange={e => setFCost(e.target.value)} placeholder="Unit cost ₹" className={inp} />
            <select value={fReason} onChange={e => setFReason(e.target.value)} className={`${inp} md:col-span-2`}>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addRow} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No wastage logged. Recording scrap keeps your stock value honest and surfaces avoidable losses.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Product", "Qty", "Unit Cost", "Loss Value", "Reason", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...rows].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.date}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{r.product}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.qty}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.unitCost)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(r.qty * r.unitCost))}</td>
                    <td className="px-4 py-2.5 text-xs">{r.reason}</td>
                    <td className="px-4 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Wastage value = quantity × unit cost. Track reasons over time to attack the biggest avoidable losses first.</p>
    </div>
  );
}

/* ───────────────────────── #40/#41 Returns (customer & RTV) register ───────────────────────── */
function ReturnsRegisterTab() {
  const { store } = useApp();
  type Ret = { id: string; date: string; kind: "customer" | "rtv"; party: string; product: string; qty: number; unitValue: number; reason: string; disposition: "restock" | "quarantine" | "scrap"; status: "open" | "closed" };
  const [rows, setRows] = useFeatureState<Ret[]>("ops-returns-register", []);
  const [showForm, setShowForm] = useState(false);

  const [fDate, setFDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [fKind, setFKind] = useState<"customer" | "rtv">("customer");
  const [fParty, setFParty] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fQty, setFQty] = useState("");
  const [fValue, setFValue] = useState("");
  const [fReason, setFReason] = useState("");
  const [fDisp, setFDisp] = useState<"restock" | "quarantine" | "scrap">("restock");

  const onPick = (name: string) => {
    setFProduct(name);
    const it = store.inventory.find(i => i.productName === name);
    if (it) setFValue(String(it.unitCost));
  };

  const addRow = () => {
    if (!fParty || !fProduct || !fQty) { toast.error("Party, product and qty required"); return; }
    setRows(prev => [...prev, {
      id: generateId(), date: fDate, kind: fKind, party: fParty, product: fProduct,
      qty: parseFloat(fQty) || 0, unitValue: parseFloat(fValue) || 0, reason: fReason, disposition: fDisp, status: "open",
    }]);
    toast.success(fKind === "rtv" ? "Vendor return (RTV) logged" : "Customer return logged");
    setFParty(""); setFProduct(""); setFQty(""); setFValue(""); setFReason(""); setFDisp("restock"); setShowForm(false);
  };

  const toggle = (id: string) => setRows(prev => prev.map(r => r.id === id ? { ...r, status: r.status === "open" ? "closed" : "open" } : r));

  const custValue = rows.filter(r => r.kind === "customer").reduce((s, r) => s + r.qty * r.unitValue, 0);
  const rtvValue = rows.filter(r => r.kind === "rtv").reduce((s, r) => s + r.qty * r.unitValue, 0);
  const open = rows.filter(r => r.status === "open").length;
  const DISP_STYLE: Record<string, string> = {
    restock: "text-green-400", quarantine: "text-yellow-400", scrap: "text-red-400",
  };
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Undo2 size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Returns &amp; RTV Register</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Track customer returns and return-to-vendor (RTV) with disposition and value.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> Log return
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Returns", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Open Items", value: open.toString(), color: open > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Customer Return Value", value: formatCurrency(Math.round(custValue)), color: "text-red-400" },
          { label: "RTV Value", value: formatCurrency(Math.round(rtvValue)), color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            {(["customer", "rtv"] as const).map(k => (
              <button key={k} onClick={() => setFKind(k)} className={`text-xs px-3 py-1 rounded-lg border font-semibold transition-all ${fKind === k ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {k === "customer" ? "Customer return" : "Return to vendor (RTV)"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><label className="text-[10px] text-[var(--color-muted)] block">Date</label><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inp} /></div>
            <input value={fParty} onChange={e => setFParty(e.target.value)} placeholder={fKind === "rtv" ? "Vendor *" : "Customer *"} className={inp} />
            <input value={fProduct} onChange={e => onPick(e.target.value)} placeholder="Product *" className={inp} list="returns-products" />
            <datalist id="returns-products">{store.inventory.map(i => <option key={i.id} value={i.productName} />)}</datalist>
            <input type="number" value={fQty} onChange={e => setFQty(e.target.value)} placeholder="Qty *" className={inp} />
            <input type="number" value={fValue} onChange={e => setFValue(e.target.value)} placeholder="Unit value ₹" className={inp} />
            <input value={fReason} onChange={e => setFReason(e.target.value)} placeholder="Reason" className={inp} />
            <select value={fDisp} onChange={e => setFDisp(e.target.value as typeof fDisp)} className={inp}>
              <option value="restock">Restock</option>
              <option value="quarantine">Quarantine</option>
              <option value="scrap">Scrap</option>
            </select>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addRow} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No returns logged. Track customer returns and vendor returns (RTV) to control reverse-logistics cost.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Type", "Party", "Product", "Qty", "Value", "Reason", "Disposition", "Status", ""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...rows].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-3 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.date}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.kind === "rtv" ? "bg-blue-950/30 text-blue-400" : "bg-orange-950/30 text-orange-400"}`}>{r.kind === "rtv" ? "RTV" : "Customer"}</span></td>
                    <td className="px-3 py-2.5 text-xs font-medium">{r.party}</td>
                    <td className="px-3 py-2.5 text-xs">{r.product}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.qty}</td>
                    <td className="px-3 py-2.5 tabular-nums text-xs">{formatCurrency(Math.round(r.qty * r.unitValue))}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.reason || "—"}</td>
                    <td className={`px-3 py-2.5 text-xs font-semibold ${DISP_STYLE[r.disposition]}`}>{r.disposition}</td>
                    <td className="px-3 py-2.5"><button onClick={() => toggle(r.id)} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.status === "closed" ? "bg-green-950/30 text-green-400" : "bg-yellow-950/30 text-yellow-400"}`}>{r.status}</button></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">RTV (return-to-vendor) defective stock may need an ITC reversal / debit note under GST — consult a CA. Restock returns flow back to sellable inventory; quarantine and scrap do not.</p>
    </div>
  );
}

/* ───────────────────────── #2/#3/#35 Stock valuation report (FIFO vs Weighted-avg) ───────────────────────── */
function StockValuationTab() {
  const { store } = useApp();
  const { inventory } = store;
  type Method = "wavg" | "fifo";
  const [method, setMethod] = useState<Method>("wavg");
  // Optional per-SKU oldest-lot cost override, persisted (drives the FIFO lower/upper band).
  const [oldestCost, setOldestCost] = useFeatureState<Record<string, number>>("ops-valuation-oldest-cost", {});
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory
      .filter(i => !q || i.productName.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q))
      .map(i => {
        const wavg = i.unitCost;
        const oldest = oldestCost[i.id];
        // FIFO closing value uses the most-recent (latest) lot cost for the units on hand,
        // approximated as current unitCost; if an older lot cost is supplied we show the spread.
        const fifoUnit = method === "fifo" && oldest != null ? oldest : wavg;
        const unit = method === "fifo" ? fifoUnit : wavg;
        return {
          ...i,
          unit,
          value: i.quantity * unit,
          wavgValue: i.quantity * wavg,
          fifoValue: i.quantity * (oldest != null ? oldest : wavg),
        };
      });
  }, [inventory, method, oldestCost, query]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const wavgTotal = rows.reduce((s, r) => s + r.wavgValue, 0);
  const fifoTotal = rows.reduce((s, r) => s + r.fifoValue, 0);
  const spread = fifoTotal - wavgTotal;

  const downloadCsv = () => {
    const headers = ["SKU", "Product", "Qty", "Unit Cost (method)", `Closing Value (${method === "fifo" ? "FIFO" : "Weighted-avg"})`];
    const lines = rows.map(r => [r.sku || "—", r.productName, r.quantity, Math.round(r.unit), Math.round(r.value)].join(","));
    const csv = [headers.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `stock-valuation-${method}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Valuation report exported");
  };

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Stock Valuation Report</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Closing-stock value by costing method — for year-end audit and balance-sheet COGS.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["wavg", "fifo"] as const).map(m => (
            <button key={m} onClick={() => setMethod(m)} className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${method === m ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {m === "wavg" ? "Weighted-avg" : "FIFO"}
            </button>
          ))}
          <button onClick={downloadCsv} disabled={rows.length === 0} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 disabled:opacity-40">
            <Download size={11} /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: `Closing Value (${method === "fifo" ? "FIFO" : "W-Avg"})`, value: formatCurrency(Math.round(totalValue)), color: "text-[var(--color-primary)]" },
          { label: "Weighted-avg Value", value: formatCurrency(Math.round(wavgTotal)), color: "text-blue-400" },
          { label: "FIFO Value", value: formatCurrency(Math.round(fifoTotal)), color: "text-emerald-400" },
          { label: "Method Spread", value: formatCurrency(Math.round(spread)), color: spread >= 0 ? "text-yellow-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by product / SKU" className={`${inp} flex-1 max-w-xs`} />
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No SKUs match. Add inventory items to value your closing stock.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["SKU", "Product", "Qty", "W-Avg Cost", "FIFO Oldest-Lot Cost", "Closing Value"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{r.sku || "—"}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{r.productName}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.unitCost)}</td>
                    <td className="px-4 py-2.5">
                      <input type="number" value={oldestCost[r.id] ?? ""} placeholder={String(Math.round(r.unitCost))}
                        onChange={e => setOldestCost(prev => {
                          const next = { ...prev };
                          if (e.target.value === "") delete next[r.id]; else next[r.id] = parseFloat(e.target.value) || 0;
                          return next;
                        })}
                        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs w-24 tabular-nums outline-none focus:border-[var(--color-primary)]" />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(Math.round(r.value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Weighted-average uses each SKU's stored unit cost. FIFO values on-hand units at the oldest open-lot cost (enter it per row); the spread shows how much the chosen method shifts reported stock value. Lock one method for the full year for audit consistency.</p>
    </div>
  );
}

/* ───────────────────────── #29 Safety-stock & min/max planner ───────────────────────── */
function SafetyStockTab() {
  const { store } = useApp();
  const { inventory, orders } = store;
  // Planning inputs (durable so the planner reopens with the owner's assumptions).
  const [leadTime, setLeadTime] = useFeatureState<number>("ops-ss-lead-time", 7);
  const [leadVar, setLeadVar] = useFeatureState<number>("ops-ss-lead-variance", 2);
  const [service, setService] = useFeatureState<number>("ops-ss-service-level", 95);
  const [reviewDays, setReviewDays] = useFeatureState<number>("ops-ss-review-days", 30);

  // Z-factor for common service levels (one-tailed).
  const Z: Record<number, number> = { 90: 1.28, 95: 1.65, 97: 1.88, 99: 2.33 };
  const z = Z[service] ?? 1.65;

  // Daily demand per SKU from fulfilled orders (assume ~90 days of order history).
  const daysWindow = 90;
  const soldByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o => {
      o.items.forEach(it => { map[it.productName] = (map[it.productName] ?? 0) + it.quantity; });
    });
    return map;
  }, [orders]);

  const rows = useMemo(() => inventory.map(i => {
    const sold = soldByProduct[i.productName] ?? 0;
    const dailyDemand = sold / daysWindow;
    // Safety stock from demand × lead-time-variability (std-dev proxy) at service level.
    const safety = Math.ceil(z * dailyDemand * Math.sqrt(Math.max(0, leadVar)));
    const min = Math.ceil(dailyDemand * leadTime + safety); // reorder point
    const max = Math.ceil(min + dailyDemand * reviewDays);  // order-up-to level
    const orderQty = Math.max(0, max - i.quantity);
    const below = i.quantity <= min;
    return { ...i, dailyDemand, safety, min, max, orderQty, below };
  }), [inventory, soldByProduct, z, leadTime, leadVar, reviewDays]);

  const belowCount = rows.filter(r => r.below).length;
  const totalOrderValue = rows.filter(r => r.below).reduce((s, r) => s + r.orderQty * r.unitCost, 0);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Safety-Stock &amp; Min/Max Planner</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Set buffer stock from lead-time variability and a target service level — then min/max levels per SKU.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Lead time (days)</label><input type="number" value={leadTime} onChange={e => setLeadTime(parseFloat(e.target.value) || 0)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Lead-time variance (days)</label><input type="number" value={leadVar} onChange={e => setLeadVar(parseFloat(e.target.value) || 0)} className={inp} /></div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Service level</label>
            <select value={service} onChange={e => setService(parseInt(e.target.value, 10))} className={inp}>
              {[90, 95, 97, 99].map(s => <option key={s} value={s}>{s}% (z={Z[s]})</option>)}
            </select>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Review cycle (days)</label><input type="number" value={reviewDays} onChange={e => setReviewDays(parseFloat(e.target.value) || 0)} className={inp} /></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "SKUs Below Min", value: belowCount.toString(), color: belowCount > 0 ? "text-red-400" : "text-green-400" },
          { label: "Suggested Buy Value", value: formatCurrency(Math.round(totalOrderValue)), color: "text-[var(--color-primary)]" },
          { label: "Service Level", value: `${service}%`, color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Add inventory items and capture orders to compute safety stock and min/max levels.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "On Hand", "Daily Demand", "Safety", "Min (ROP)", "Max", "Order Qty"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] ${r.below ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-xs">{r.productName}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${r.below ? "text-red-400" : "text-[var(--color-text)]"}`}>{r.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.dailyDemand > 0 ? `${r.dailyDemand.toFixed(2)}/day` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-yellow-400">{r.safety}</td>
                    <td className="px-4 py-2.5 tabular-nums text-blue-400 font-semibold">{r.min}</td>
                    <td className="px-4 py-2.5 tabular-nums text-emerald-400 font-semibold">{r.max}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.orderQty > 0 ? <span className="text-[var(--color-primary)] font-bold">{r.orderQty}</span> : <span className="text-[var(--color-muted)]">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Safety stock = z × daily demand × √(lead-time variance). Min (reorder point) = demand over lead time + safety; Max = min + demand over the review cycle. Order quantity tops stock back up to Max. Daily demand uses ~90 days of fulfilled-order history.</p>
    </div>
  );
}

/* ───────────────────────── #52 Carrying-cost calculator ───────────────────────── */
function CarryingCostTab() {
  const { store } = useApp();
  const { inventory } = store;
  // Annual carrying-cost components as % of average stock value (persisted assumptions).
  const [capitalPct, setCapitalPct] = useFeatureState<number>("ops-carry-capital-pct", 14);
  const [storagePct, setStoragePct] = useFeatureState<number>("ops-carry-storage-pct", 4);
  const [obsoletePct, setObsoletePct] = useFeatureState<number>("ops-carry-obsolete-pct", 3);
  const [insurancePct, setInsurancePct] = useFeatureState<number>("ops-carry-insurance-pct", 1);

  const totalPct = Math.max(0, capitalPct) + Math.max(0, storagePct) + Math.max(0, obsoletePct) + Math.max(0, insurancePct);

  const rows = useMemo(() => inventory.map(i => {
    const stockValue = i.quantity * i.unitCost;
    const annualCarry = stockValue * (totalPct / 100);
    return { ...i, stockValue, annualCarry, monthlyCarry: annualCarry / 12, carryPerUnit: i.quantity > 0 ? annualCarry / i.quantity : 0 };
  }).sort((a, b) => b.annualCarry - a.annualCarry), [inventory, totalPct]);

  const totalStock = rows.reduce((s, r) => s + r.stockValue, 0);
  const totalCarry = rows.reduce((s, r) => s + r.annualCarry, 0);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Coins size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Carrying-Cost Calculator</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Quantify the true annual cost of holding stock — capital, storage, obsolescence and insurance.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Cost of capital (%/yr)</label><input type="number" value={capitalPct} onChange={e => setCapitalPct(parseFloat(e.target.value) || 0)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Storage / handling (%/yr)</label><input type="number" value={storagePct} onChange={e => setStoragePct(parseFloat(e.target.value) || 0)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Obsolescence / shrink (%/yr)</label><input type="number" value={obsoletePct} onChange={e => setObsoletePct(parseFloat(e.target.value) || 0)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Insurance (%/yr)</label><input type="number" value={insurancePct} onChange={e => setInsurancePct(parseFloat(e.target.value) || 0)} className={inp} /></div>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">Total carrying rate: <span className="font-bold text-[var(--color-primary)]">{totalPct.toFixed(1)}%</span> of average stock value per year.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Stock Value", value: formatCurrency(Math.round(totalStock)), color: "text-blue-400" },
          { label: "Annual Carrying Cost", value: formatCurrency(Math.round(totalCarry)), color: "text-red-400" },
          { label: "Monthly Carrying Cost", value: formatCurrency(Math.round(totalCarry / 12)), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Add inventory items to estimate what holding them really costs each year.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "Stock Value", "Annual Carry", "Monthly Carry", "Carry / Unit"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.productName}</td>
                    <td className="px-4 py-2.5 tabular-nums text-blue-400">{formatCurrency(Math.round(r.stockValue))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(r.annualCarry))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(r.monthlyCarry))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.carryPerUnit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Carrying cost = stock value × total annual rate. Typical SMB carrying rates run 18–30% — the biggest hidden tax on slow stock. Cut it by shrinking dead stock and tightening reorder quantities (see EOQ).</p>
    </div>
  );
}

/* ───────────────────────── #19 Stock-aging report ───────────────────────── */
function StockAgingTab() {
  const { store } = useApp();
  const { inventory, orders } = store;

  // Last fulfilled-sale date per product → days held proxy.
  const lastSale = useMemo(() => {
    const map: Record<string, string> = {};
    orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o => {
      o.items.forEach(it => {
        const prev = map[it.productName];
        if (!prev || o.createdAt > prev) map[it.productName] = o.createdAt;
      });
    });
    return map;
  }, [orders]);

  const BUCKETS = [
    { key: "b0", label: "0–30 days", max: 30, color: "text-green-400", bar: "bg-green-500/70" },
    { key: "b30", label: "31–60 days", max: 60, color: "text-blue-400", bar: "bg-blue-500/70" },
    { key: "b60", label: "61–90 days", max: 90, color: "text-yellow-400", bar: "bg-yellow-500/70" },
    { key: "b90", label: "91–180 days", max: 180, color: "text-orange-400", bar: "bg-orange-500/70" },
    { key: "b180", label: "180+ days", max: Infinity, color: "text-red-400", bar: "bg-red-500/70" },
  ];

  const rows = useMemo(() => {
    const today = Date.now();
    return inventory.map(i => {
      const ref = lastSale[i.productName] ?? i.updatedAt;
      const days = ref ? Math.max(0, Math.floor((today - new Date(ref).getTime()) / 86400000)) : null;
      const value = i.quantity * i.unitCost;
      const bucket = days === null ? BUCKETS[4] : (BUCKETS.find(b => days <= b.max) ?? BUCKETS[4]);
      return { ...i, days, value, bucket };
    });
  }, [inventory, lastSale]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const bucketTotals = BUCKETS.map(b => ({
    ...b,
    value: rows.filter(r => r.bucket.key === b.key).reduce((s, r) => s + r.value, 0),
    count: rows.filter(r => r.bucket.key === b.key).length,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Hourglass size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Stock-Aging Report</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Bucket inventory by days held since last sale to spot obsolescence before the audit does.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-3">Value by Age Bucket · {formatCurrency(Math.round(totalValue))} total</p>
        <div className="space-y-2">
          {bucketTotals.map(b => (
            <div key={b.key} className="flex items-center gap-3">
              <span className={`text-xs w-28 shrink-0 font-medium ${b.color}`}>{b.label}</span>
              <div className="flex-1 h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className={`h-full ${b.bar} rounded-full`} style={{ width: `${totalValue > 0 ? (b.value / totalValue) * 100 : 0}%` }} />
              </div>
              <span className="text-[10px] text-[var(--color-muted)] w-10 text-right">{b.count} SKU</span>
              <span className="text-xs tabular-nums w-24 text-right font-semibold">{formatCurrency(Math.round(b.value))}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Add inventory items to age your stock by days held.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "Qty", "Value", "Days Held", "Age Bucket"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...rows].sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity)).map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.productName}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(r.value))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.days === null ? "—" : `${r.days}d`}</td>
                    <td className={`px-4 py-2.5 text-xs font-semibold ${r.bucket.color}`}>{r.bucket.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Days held is measured from the last fulfilled sale (or last stock update if never sold). Stock in the 180+ bucket is a strong write-off / clearance candidate — review provisioning with your CA.</p>
    </div>
  );
}

/* ───────────────────────── #53 Stockout-cost estimator ───────────────────────── */
function StockoutCostTab() {
  const { store } = useApp();
  const { inventory, orders } = store;
  // Margin % used to value lost gross profit, and goodwill loss per stockout event.
  const [marginPct, setMarginPct] = useFeatureState<number>("ops-stockout-margin-pct", 25);
  const [goodwillPct, setGoodwillPct] = useFeatureState<number>("ops-stockout-goodwill-pct", 10);

  // Daily demand from ~90 days of fulfilled orders.
  const daysWindow = 90;
  const soldByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o => {
      o.items.forEach(it => { map[it.productName] = (map[it.productName] ?? 0) + it.quantity; });
    });
    return map;
  }, [orders]);

  // Average selling price per product from order line items (fallback to cost × (1+margin)).
  const avgPrice = useMemo(() => {
    const acc: Record<string, { sum: number; qty: number }> = {};
    orders.forEach(o => o.items.forEach(it => {
      const a = acc[it.productName] ?? { sum: 0, qty: 0 };
      a.sum += it.unitPrice * it.quantity; a.qty += it.quantity; acc[it.productName] = a;
    }));
    const out: Record<string, number> = {};
    Object.keys(acc).forEach(k => { out[k] = acc[k].qty > 0 ? acc[k].sum / acc[k].qty : 0; });
    return out;
  }, [orders]);

  const m = Math.max(0, marginPct) / 100;
  const g = Math.max(0, goodwillPct) / 100;

  const rows = useMemo(() => inventory.map(i => {
    const sold = soldByProduct[i.productName] ?? 0;
    const dailyDemand = sold / daysWindow;
    const sellPrice = avgPrice[i.productName] || i.unitCost * (1 + m);
    const daysToStockout = dailyDemand > 0 ? Math.floor(i.quantity / dailyDemand) : null;
    // If demand continues and no resupply, units short over a 30-day horizon once stock runs out.
    const horizon = 30;
    const coverDays = dailyDemand > 0 ? i.quantity / dailyDemand : horizon;
    const shortDays = Math.max(0, horizon - coverDays);
    const unitsShort = dailyDemand * shortDays;
    const lostMargin = unitsShort * sellPrice * m;
    const goodwillCost = lostMargin * g;
    const totalRisk = lostMargin + goodwillCost;
    return { ...i, dailyDemand, sellPrice, daysToStockout, unitsShort, lostMargin, goodwillCost, totalRisk };
  }).filter(r => r.dailyDemand > 0).sort((a, b) => b.totalRisk - a.totalRisk), [inventory, soldByProduct, avgPrice, m, g]);

  const totalRisk = rows.reduce((s, r) => s + r.totalRisk, 0);
  const atRisk = rows.filter(r => r.daysToStockout !== null && r.daysToStockout <= 14).length;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertOctagon size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Stockout-Cost Estimator</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Estimate lost gross profit and goodwill from running out — over a 30-day horizon.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Gross margin (%)</label><input type="number" value={marginPct} onChange={e => setMarginPct(parseFloat(e.target.value) || 0)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Goodwill loss (% of lost margin)</label><input type="number" value={goodwillPct} onChange={e => setGoodwillPct(parseFloat(e.target.value) || 0)} className={inp} /></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "30-Day Stockout Risk", value: formatCurrency(Math.round(totalRisk)), color: "text-red-400" },
          { label: "SKUs Out Within 14d", value: atRisk.toString(), color: atRisk > 0 ? "text-orange-400" : "text-green-400" },
          { label: "SKUs With Demand", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No sales velocity yet. Capture fulfilled orders so stockout risk can be estimated from real demand.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "On Hand", "Days to Stockout", "Units Short (30d)", "Lost Margin", "Goodwill", "Total Risk"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.productName}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {r.daysToStockout === null ? <span className="text-[var(--color-muted)]">—</span>
                        : r.daysToStockout <= 7 ? <span className="text-red-400 font-bold">{r.daysToStockout}d</span>
                        : r.daysToStockout <= 14 ? <span className="text-orange-400 font-semibold">{r.daysToStockout}d</span>
                        : <span className="text-[var(--color-muted)]">{r.daysToStockout}d</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.unitsShort > 0 ? Math.round(r.unitsShort) : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(Math.round(r.lostMargin))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(r.goodwillCost))}</td>
                    <td className="px-4 py-2.5 tabular-nums font-bold text-[var(--color-primary)]">{formatCurrency(Math.round(r.totalRisk))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Risk assumes demand continues unmet once stock runs out within the 30-day window. Lost margin = units short × selling price × margin %; goodwill adds a fraction of lost margin for damaged customer trust. Use it to prioritise which SKUs to reorder first.</p>
    </div>
  );
}

/* ───────────────────────── #20 Cycle-count scheduler ───────────────────────── */
function CycleCountScheduleTab() {
  const { store } = useApp();
  const { inventory, orders } = store;

  // Counting cadence (days) per ABC class — A counted most often, C least.
  const [freqA, setFreqA] = useFeatureState<number>("ops-cycle-freq-a", 30);
  const [freqB, setFreqB] = useFeatureState<number>("ops-cycle-freq-b", 90);
  const [freqC, setFreqC] = useFeatureState<number>("ops-cycle-freq-c", 180);
  // Last counted date per SKU id (ISO date) — marked when the user records a count.
  const [lastCounted, setLastCounted] = useFeatureState<Record<string, string>>("ops-cycle-last-counted", {});

  // Sales value per product over fulfilled orders → ABC ranking by revenue contribution.
  const revByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o => {
      o.items.forEach(it => { map[it.productName] = (map[it.productName] ?? 0) + it.unitPrice * it.quantity; });
    });
    return map;
  }, [orders]);

  const today = new Date();
  const rows = useMemo(() => {
    const ranked = [...inventory].map(i => ({ item: i, rev: revByProduct[i.productName] ?? 0 }))
      .sort((a, b) => b.rev - a.rev);
    const totalRev = ranked.reduce((s, r) => s + r.rev, 0);
    let cum = 0;
    return ranked.map(({ item, rev }) => {
      cum += rev;
      const share = totalRev > 0 ? cum / totalRev : (ranked.length > 0 ? 1 : 0);
      const cls: "A" | "B" | "C" = totalRev === 0 ? "C" : share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
      const freq = cls === "A" ? freqA : cls === "B" ? freqB : freqC;
      const last = lastCounted[item.id];
      const daysSince = last ? Math.floor((today.getTime() - new Date(last).getTime()) / 86400000) : null;
      const due = daysSince === null || daysSince >= freq;
      const nextInDays = daysSince === null ? 0 : Math.max(0, freq - daysSince);
      return { item, rev, cls, freq, last, daysSince, due, nextInDays };
    });
  }, [inventory, revByProduct, freqA, freqB, freqC, lastCounted]);

  const dueNow = rows.filter(r => r.due).length;
  const markCounted = (id: string) => {
    setLastCounted(prev => ({ ...prev, [id]: new Date().toISOString() }));
    toast.success("Count recorded — next cycle scheduled");
  };
  const CLS_STYLE: Record<"A" | "B" | "C", string> = {
    A: "bg-red-950/30 text-red-400 border-red-800/30",
    B: "bg-yellow-950/30 text-yellow-400 border-yellow-800/30",
    C: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  };
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Cycle-Count Scheduler</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Plan rolling counts by ABC class so you never shut the business down for a full annual stock-take.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-3">Counting Cadence (days between counts)</p>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          <div><label className="text-[10px] text-red-400 block mb-0.5">Class A (vital)</label><input type="number" min="1" value={freqA} onChange={e => setFreqA(parseInt(e.target.value) || 1)} className={inp} /></div>
          <div><label className="text-[10px] text-yellow-400 block mb-0.5">Class B</label><input type="number" min="1" value={freqB} onChange={e => setFreqB(parseInt(e.target.value) || 1)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Class C (trivial)</label><input type="number" min="1" value={freqC} onChange={e => setFreqC(parseInt(e.target.value) || 1)} className={inp} /></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "SKUs Tracked", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Counts Due Now", value: dueNow.toString(), color: dueNow > 0 ? "text-red-400" : "text-green-400" },
          { label: "Class A SKUs", value: rows.filter(r => r.cls === "A").length.toString(), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Add inventory items to build a rolling count schedule by ABC class.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "Class", "Cadence", "Last Counted", "Status", "Action"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...rows].sort((a, b) => Number(b.due) - Number(a.due) || a.nextInDays - b.nextInDays).map(r => (
                  <tr key={r.item.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.item.productName}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CLS_STYLE[r.cls]}`}>{r.cls}</span></td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">every {r.freq}d</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">{r.daysSince === null ? "Never" : `${r.daysSince}d ago`}</td>
                    <td className="px-4 py-2.5">
                      {r.due ? <span className="text-xs font-semibold text-red-400">Due now</span>
                        : <span className="text-xs text-green-400">In {r.nextInDays}d</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => markCounted(r.item.id)} className="text-xs text-[var(--color-primary)] hover:underline whitespace-nowrap">Mark counted</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">ABC class is derived live from each SKU's revenue contribution (A = top 80% of sales, B = next 15%, C = rest). High-value A items are counted most often. "Mark counted" resets that SKU's clock so the schedule keeps rolling.</p>
    </div>
  );
}

/* ───────────────────────── #10 Min/Max stock planner ───────────────────────── */
function MinMaxPlannerTab() {
  const { store } = useApp();
  const { inventory, orders } = store;

  // Planning inputs: supplier lead time and how many days of cover the max level should hold.
  const [leadDays, setLeadDays] = useFeatureState<number>("ops-minmax-lead-days", 7);
  const [maxCoverDays, setMaxCoverDays] = useFeatureState<number>("ops-minmax-max-cover", 30);
  const [safetyDays, setSafetyDays] = useFeatureState<number>("ops-minmax-safety-days", 5);

  const daysWindow = 90;
  const soldByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => ["confirmed", "dispatched", "delivered"].includes(o.status)).forEach(o => {
      o.items.forEach(it => { map[it.productName] = (map[it.productName] ?? 0) + it.quantity; });
    });
    return map;
  }, [orders]);

  const rows = useMemo(() => inventory.map(i => {
    const sold = soldByProduct[i.productName] ?? 0;
    const dailyDemand = sold / daysWindow;
    // Min = demand over (lead time + safety buffer); Max = min + demand over the cover window.
    const min = Math.ceil(dailyDemand * (leadDays + safetyDays));
    const max = Math.ceil(min + dailyDemand * maxCoverDays);
    const orderUpTo = Math.max(0, max - i.quantity);
    const status: "below" | "above" | "ok" = i.quantity < min ? "below" : i.quantity > max ? "above" : "ok";
    return { ...i, dailyDemand, min, max, orderUpTo, status };
  }), [inventory, soldByProduct, leadDays, maxCoverDays, safetyDays]);

  const belowMin = rows.filter(r => r.status === "below").length;
  const aboveMax = rows.filter(r => r.status === "above").length;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Min/Max Stock Planner</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Set per-SKU min and max levels from real demand so you reorder up to a target — not by gut feel.</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="grid grid-cols-3 gap-3 max-w-lg">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Lead time (days)</label><input type="number" min="0" value={leadDays} onChange={e => setLeadDays(parseInt(e.target.value) || 0)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Safety buffer (days)</label><input type="number" min="0" value={safetyDays} onChange={e => setSafetyDays(parseInt(e.target.value) || 0)} className={inp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Max cover (days)</label><input type="number" min="0" value={maxCoverDays} onChange={e => setMaxCoverDays(parseInt(e.target.value) || 0)} className={inp} /></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "SKUs Planned", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Below Min", value: belowMin.toString(), color: belowMin > 0 ? "text-red-400" : "text-green-400" },
          { label: "Above Max (overstock)", value: aboveMax.toString(), color: aboveMax > 0 ? "text-orange-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Add inventory items to compute min/max levels from demand.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "On Hand", "Daily Demand", "Min", "Max", "Order Up To", "Status"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...rows].sort((a, b) => Number(a.status === "below" ? 0 : a.status === "above" ? 1 : 2) - Number(b.status === "below" ? 0 : b.status === "above" ? 1 : 2)).map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.productName}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${r.status === "below" ? "text-red-400" : r.status === "above" ? "text-orange-400" : ""}`}>{r.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.dailyDemand > 0 ? `${r.dailyDemand.toFixed(2)}/day` : "No history"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-yellow-400">{r.min}</td>
                    <td className="px-4 py-2.5 tabular-nums text-blue-400">{r.max}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{r.status === "below" ? r.orderUpTo : "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold">
                      {r.status === "below" ? <span className="text-red-400">Reorder</span>
                        : r.status === "above" ? <span className="text-orange-400">Overstock</span>
                        : <span className="text-green-400">Healthy</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Min = demand across (lead time + safety buffer); Max = min plus demand across the cover window. When on-hand drops below Min, "Order Up To" is the quantity that refills back to Max. Items above Max are tying up working capital.</p>
    </div>
  );
}

/* ───────────────────────── #38 Warehouse-utilization planner ───────────────────────── */
function WarehouseUtilizationTab() {
  type Zone = { id: string; name: string; capacity: number; used: number };
  const [zones, setZones] = useFeatureState<Zone[]>("ops-wh-util-zones", []);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [used, setUsed] = useState("");

  const addZone = () => {
    const cap = parseFloat(capacity) || 0;
    if (!name.trim() || cap <= 0) { toast.error("Zone name and capacity required"); return; }
    setZones(prev => [...prev, { id: generateId(), name: name.trim(), capacity: cap, used: Math.max(0, parseFloat(used) || 0) }]);
    setName(""); setCapacity(""); setUsed(""); toast.success("Zone added");
  };
  const updateUsed = (id: string, val: string) => {
    const v = Math.max(0, parseFloat(val) || 0);
    setZones(prev => prev.map(z => z.id === id ? { ...z, used: v } : z));
  };

  const totalCap = zones.reduce((s, z) => s + z.capacity, 0);
  const totalUsed = zones.reduce((s, z) => s + z.used, 0);
  const overallPct = totalCap > 0 ? (totalUsed / totalCap) * 100 : 0;
  const overCount = zones.filter(z => z.used > z.capacity).length;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  const barColor = (pct: number) => pct > 100 ? "bg-red-500/70" : pct >= 90 ? "bg-orange-500/70" : pct >= 70 ? "bg-yellow-500/70" : "bg-green-500/70";
  const txtColor = (pct: number) => pct > 100 ? "text-red-400" : pct >= 90 ? "text-orange-400" : pct >= 70 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Boxes size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Warehouse-Utilization Planner</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Track used vs available capacity per zone or rack so you know when to expand — or when space is wasted.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Overall Utilization", value: `${overallPct.toFixed(0)}%`, color: txtColor(overallPct) },
          { label: "Total Capacity", value: totalCap.toLocaleString("en-IN"), color: "text-blue-400" },
          { label: "Zones Over Capacity", value: overCount.toString(), color: overCount > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-2">Add Zone / Rack</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Zone name (e.g. Rack A)" className={inp} />
          <input type="number" min="0" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Capacity (units / pallets)" className={inp} />
          <input type="number" min="0" value={used} onChange={e => setUsed(e.target.value)} placeholder="Currently used" className={inp} />
          <button onClick={addZone} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add Zone</button>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Boxes size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add a zone above to start tracking how full each part of your warehouse is.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map(z => {
            const pct = z.capacity > 0 ? (z.used / z.capacity) * 100 : 0;
            return (
              <div key={z.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Warehouse size={13} className="text-[var(--color-primary)]" />
                    <span className="text-sm font-semibold">{z.name}</span>
                    <span className="text-xs text-[var(--color-muted)]">{z.used.toLocaleString("en-IN")} / {z.capacity.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold tabular-nums ${txtColor(pct)}`}>{pct.toFixed(0)}%</span>
                    <button onClick={() => setZones(prev => prev.filter(x => x.id !== z.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                  </div>
                </div>
                <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full ${barColor(pct)} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[10px] text-[var(--color-muted)]">Update used:</label>
                  <input type="number" min="0" defaultValue={z.used} onBlur={e => updateUsed(z.id, e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] w-28" />
                  {z.used > z.capacity && <span className="text-[10px] text-red-400 font-semibold">Over capacity — rebalance or expand</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Utilization above 90% leaves no room for inbound goods; below 50% across many zones signals wasted rent. Use it to plan transfers, mezzanine adds, or 3PL space before you hit a wall.</p>
    </div>
  );
}

/* ───────────────────────── #25 Negative-stock / oversell guardrail ───────────────────────── */
function OversellGuardTab() {
  const { store } = useApp();
  const { inventory, orders } = store;

  // Open (not yet fulfilled / cancelled) order demand per product.
  const committed = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => o.status === "pending" || o.status === "confirmed" || o.status === "processing").forEach(o => {
      o.items.forEach(it => { map[it.productName] = (map[it.productName] ?? 0) + it.quantity; });
    });
    return map;
  }, [orders]);

  const rows = useMemo(() => inventory.map(i => {
    const reserved = committed[i.productName] ?? 0;
    const available = i.quantity - reserved;
    const status: "oversold" | "tight" | "ok" = available < 0 ? "oversold" : available <= i.reorderLevel ? "tight" : "ok";
    return { ...i, reserved, available, status };
  }).filter(r => r.reserved > 0 || r.status !== "ok"), [inventory, committed]);

  const oversold = rows.filter(r => r.status === "oversold");
  const shortUnits = oversold.reduce((s, r) => s + Math.abs(r.available), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Ban size={16} className="text-[var(--color-primary)]" />
        <div>
          <h2 className="text-sm font-semibold">Oversell / Negative-Stock Guard</h2>
          <p className="text-[11px] text-[var(--color-muted)]">Catch SKUs where open orders promise more than you physically hold — before you ship phantom stock.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Oversold SKUs", value: oversold.length.toString(), color: oversold.length > 0 ? "text-red-400" : "text-green-400" },
          { label: "Units Short", value: shortUnits.toLocaleString("en-IN"), color: shortUnits > 0 ? "text-orange-400" : "text-green-400" },
          { label: "SKUs With Commitments", value: rows.filter(r => r.reserved > 0).length.toString(), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {oversold.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-4">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1 flex items-center gap-1.5"><AlertTriangle size={11} /> Overselling Detected</p>
          <p className="text-xs text-[var(--color-muted)]">{oversold.length} SKU{oversold.length > 1 ? "s have" : " has"} more committed than on hand. Expedite procurement or hold confirmations until stock is replenished.</p>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No open-order commitments yet. Add pending or confirmed orders and this guard will watch for oversell against on-hand stock.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "On Hand", "Committed", "Available", "Status"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {[...rows].sort((a, b) => a.available - b.available).map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.productName}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-blue-400">{r.reserved}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${r.available < 0 ? "text-red-400" : r.status === "tight" ? "text-yellow-400" : "text-green-400"}`}>{r.available}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold">
                      {r.status === "oversold" ? <span className="text-red-400 flex items-center gap-1"><Ban size={11} />Oversold</span>
                        : r.status === "tight" ? <span className="text-yellow-400">Tight</span>
                        : <span className="text-green-400">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Committed = quantity on open (pending / confirmed / processing) orders. Available = on-hand minus committed; a negative value means you have promised stock you do not have. "Tight" SKUs are at or below reorder level after commitments.</p>
    </div>
  );
}
