import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import {
  Package, ShoppingCart, Truck, BarChart2, Plus, X, MessageCircle,
  Mail, FileSpreadsheet, Phone, CheckCircle2, Clock, AlertTriangle,
  Radar, Copy, TrendingUp, ArrowUpRight, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { Order, OrderSource, InventoryItem, ProcurementOrder } from "@/data/types";
import { callNumber, whatsappTo, smsNumber } from "@/lib/nativeFeatures";
import { detectAnomalies, type Anomaly } from "@/lib/anomalies";

type Tab = "overview" | "orders" | "inventory" | "procurement" | "intelligence" | "prices" | "bom" | "leadtime" | "reorder";

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
  const { store, addOrder, updateOrder, deleteOrder, addInventoryItem, updateInventoryItem, deleteInventoryItem, addProcurement, updateProcurement } = useApp();
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

  const [items,     setItems]     = useState<PriceItem[]>(() =>
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

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
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

  const [boms, setBoms]     = useState<Bom[]>([]);
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
              const { totalCost, costPerUnit, gm } = calcBom(b);
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

  const [items, setItems] = useState<ReorderItem[]>([]);
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
