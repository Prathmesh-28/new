# ERP — manufacturing (`/api/erp`)

Manufacturing/production: multi-level BOMs, work orders, job cards, material requests, production plans, and reorder logic. A faithful port of **ERPNext's** BOM / Work Order / Job Card algorithms onto Headroom's Postgres + books stack. Material consumption and finished-goods receipts post stock movements through the `books` inventory ledger.

**Files:** `index.js` (ported pure algorithms + data layer) · `http.js` (routes) · `schema.js`.

**Key routes:** `GET /boms/:id/explode`, `POST /work-orders`, `POST /work-orders/:id/{start,transfer,manufacture,complete}`, job cards, `GET /reorder`.

**Tables:** `erp_boms`, `erp_bom_items`, `erp_bom_operations`, `erp_work_orders`, `erp_work_order_items/operations`, `erp_job_cards`, `erp_material_requests(+_items)`, `erp_production_plans(+_items/_materials)`, `erp_warehouses`, `erp_putaway_rules`, `erp_item_valuation`.

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
