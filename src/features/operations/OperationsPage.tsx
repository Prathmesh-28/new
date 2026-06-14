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

type Tab = "overview" | "orders" | "inventory" | "procurement" | "intelligence";

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
    </div>
  );
}
