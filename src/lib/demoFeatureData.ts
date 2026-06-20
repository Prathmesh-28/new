// Investor-demo feature data bag.
// AUTO-GENERATED from scratchpad/demoseed/*.json — do not edit by hand.
// Regenerate by re-running the demo-seed merge step.

export const DEMO_FEATURE_DATA: Record<string, unknown> = {
  "field-queue": [
    {
      "id": "q-7f3a1c2e-0001",
      "kind": "collection",
      "label": "CASH from Sharma Stores",
      "amount": 18500,
      "at": "2026-06-21T09:42:00.000Z",
      "synced": false,
      "customer": "Sharma Stores",
      "mode": "cash",
      "meta": "GPS 12.9716, 77.5946"
    },
    {
      "id": "q-7f3a1c2e-0002",
      "kind": "sale",
      "label": "Quick-bill (4 items)",
      "amount": 7240,
      "at": "2026-06-21T10:15:00.000Z",
      "synced": false,
      "customer": "Counter sale"
    },
    {
      "id": "q-7f3a1c2e-0003",
      "kind": "collection",
      "label": "UPI from Verma Traders",
      "amount": 32000,
      "at": "2026-06-21T11:05:00.000Z",
      "synced": true,
      "customer": "Verma Traders",
      "mode": "upi",
      "syncedAt": "2026-06-21T11:08:00.000Z",
      "ledgerRef": "Cash book + INV-2026-0142 settled"
    },
    {
      "id": "q-7f3a1c2e-0004",
      "kind": "daysheet",
      "label": "Van day-sheet · sold ₹14,000",
      "amount": 12500,
      "at": "2026-06-20T17:30:00.000Z",
      "synced": true,
      "syncedAt": "2026-06-20T19:02:00.000Z",
      "ledgerRef": "Cash book (revenue)",
      "meta": "Closing stock ₹7,000 · variance -₹1,500"
    },
    {
      "id": "q-7f3a1c2e-0005",
      "kind": "visit",
      "label": "Visit · Iyer Provision Mart",
      "amount": 0,
      "at": "2026-06-21T12:20:00.000Z",
      "synced": false,
      "meta": "Order discussed, follow-up next week"
    },
    {
      "id": "q-7f3a1c2e-0006",
      "kind": "collection",
      "label": "CASH from Patel Hardware",
      "amount": 9800,
      "at": "2026-06-21T13:10:00.000Z",
      "synced": false,
      "customer": "Patel Hardware",
      "mode": "cash",
      "syncError": "collection has no matching invoice",
      "meta": "GPS 12.9352, 77.6245"
    },
    {
      "id": "q-7f3a1c2e-0007",
      "kind": "receipt",
      "label": "Expense · Fuel",
      "amount": 600,
      "at": "2026-06-21T08:30:00.000Z",
      "synced": true,
      "syncedAt": "2026-06-21T08:35:00.000Z",
      "ledgerRef": "Logged (no ledger impact)",
      "meta": "Diesel top-up at HP pump"
    },
    {
      "id": "q-7f3a1c2e-0008",
      "kind": "sale",
      "label": "Order · Reddy Kirana (3 items)",
      "amount": 5600,
      "at": "2026-06-21T14:05:00.000Z",
      "synced": false,
      "meta": "10×Atta, 5×Sugar, 2×Oil"
    }
  ],
  "field-upi-id": "acmemfg@okhdfcbank",
  "field-low-data": true,
  "field-visits": [
    {
      "id": "v-aa01",
      "customer": "Sharma Stores",
      "purpose": "Collection",
      "outcome": "Collected ₹18,500 cash",
      "followUp": "Next order on 28 Jun",
      "at": "2026-06-21T09:45:00.000Z"
    },
    {
      "id": "v-aa02",
      "customer": "Verma Traders",
      "purpose": "Order booking",
      "outcome": "Booked ₹32,000 order",
      "followUp": "Deliver by 24 Jun",
      "at": "2026-06-21T11:00:00.000Z"
    },
    {
      "id": "v-aa03",
      "customer": "Iyer Provision Mart",
      "purpose": "Relationship visit",
      "outcome": "Discussed monsoon scheme",
      "followUp": "Send price list",
      "at": "2026-06-21T12:20:00.000Z"
    },
    {
      "id": "v-aa04",
      "customer": "Patel Hardware",
      "purpose": "Collection",
      "outcome": "Promised payment Friday",
      "followUp": "Call 26 Jun",
      "at": "2026-06-20T15:30:00.000Z"
    },
    {
      "id": "v-aa05",
      "customer": "Reddy Kirana",
      "purpose": "Order booking",
      "outcome": "Small order placed",
      "followUp": "Upsell premium range",
      "at": "2026-06-19T10:10:00.000Z"
    },
    {
      "id": "v-aa06",
      "customer": "Gupta General Store",
      "purpose": "New customer pitch",
      "outcome": "Interested, wants sample",
      "followUp": "Drop demo unit",
      "at": "2026-06-18T16:40:00.000Z"
    }
  ],
  "field-beat": [
    {
      "id": "s-b01",
      "customer": "Sharma Stores",
      "done": true
    },
    {
      "id": "s-b02",
      "customer": "Verma Traders",
      "done": true
    },
    {
      "id": "s-b03",
      "customer": "Iyer Provision Mart",
      "done": true
    },
    {
      "id": "s-b04",
      "customer": "Patel Hardware",
      "done": false
    },
    {
      "id": "s-b05",
      "customer": "Reddy Kirana",
      "done": false
    },
    {
      "id": "s-b06",
      "customer": "Gupta General Store",
      "done": false
    }
  ],
  "field-receipts": [
    {
      "id": "r-c01",
      "note": "Diesel ₹600 - HP pump Koramangala",
      "fileName": "fuel_21jun.jpg",
      "at": "2026-06-21T08:32:00.000Z",
      "preview": null
    },
    {
      "id": "r-c02",
      "note": "Toll receipt NICE road",
      "fileName": "toll_21jun.jpg",
      "at": "2026-06-21T09:10:00.000Z",
      "preview": null
    },
    {
      "id": "r-c03",
      "note": "Loading labour at warehouse",
      "fileName": "loading_20jun.jpg",
      "at": "2026-06-20T07:50:00.000Z",
      "preview": null
    },
    {
      "id": "r-c04",
      "note": "Tea & snacks for client",
      "fileName": "food_20jun.jpg",
      "at": "2026-06-20T13:15:00.000Z",
      "preview": null
    },
    {
      "id": "r-c05",
      "note": "Mobile recharge data pack",
      "fileName": "recharge_19jun.jpg",
      "at": "2026-06-19T18:20:00.000Z",
      "preview": null
    }
  ],
  "field-attendance": [
    {
      "id": "ci-01",
      "type": "out",
      "at": "2026-06-20T18:30:00.000Z",
      "place": "KR Market",
      "gps": "12.9591, 77.5837"
    },
    {
      "id": "ci-02",
      "type": "in",
      "at": "2026-06-20T09:15:00.000Z",
      "place": "KR Market",
      "gps": "12.9591, 77.5837"
    },
    {
      "id": "ci-03",
      "type": "out",
      "at": "2026-06-19T18:05:00.000Z",
      "place": "Chickpet Bazaar",
      "gps": "12.9698, 77.5797"
    },
    {
      "id": "ci-04",
      "type": "in",
      "at": "2026-06-19T09:05:00.000Z",
      "place": "Chickpet Bazaar",
      "gps": "12.9698, 77.5797"
    },
    {
      "id": "ci-05",
      "type": "in",
      "at": "2026-06-21T09:00:00.000Z",
      "place": "Jayanagar 4th Block",
      "gps": "12.9250, 77.5938"
    }
  ],
  "field-expenses": [
    {
      "id": "e-d01",
      "category": "Fuel",
      "amount": 600,
      "note": "Diesel top-up",
      "at": "2026-06-21T08:32:00.000Z"
    },
    {
      "id": "e-d02",
      "category": "Toll / Parking",
      "amount": 120,
      "note": "NICE road toll",
      "at": "2026-06-21T09:10:00.000Z"
    },
    {
      "id": "e-d03",
      "category": "Food",
      "amount": 250,
      "note": "Lunch on beat",
      "at": "2026-06-21T13:30:00.000Z"
    },
    {
      "id": "e-d04",
      "category": "Loading",
      "amount": 400,
      "note": "Hamali charges",
      "at": "2026-06-20T07:50:00.000Z"
    },
    {
      "id": "e-d05",
      "category": "Phone / Data",
      "amount": 199,
      "note": "Monthly data pack",
      "at": "2026-06-19T18:20:00.000Z"
    },
    {
      "id": "e-d06",
      "category": "Other",
      "amount": 150,
      "note": "Photocopies of invoices",
      "at": "2026-06-18T11:00:00.000Z"
    }
  ],
  "field-stock-req": [
    {
      "id": "sr-e01",
      "item": "Sugar 1kg",
      "qty": 50,
      "urgent": true
    },
    {
      "id": "sr-e02",
      "item": "Atta 10kg",
      "qty": 20,
      "urgent": false
    },
    {
      "id": "sr-e03",
      "item": "Refined Oil 1L",
      "qty": 30,
      "urgent": true
    },
    {
      "id": "sr-e04",
      "item": "Tea Powder 500g",
      "qty": 15,
      "urgent": false
    },
    {
      "id": "sr-e05",
      "item": "Detergent 1kg",
      "qty": 25,
      "urgent": false
    }
  ],
  "field-signatures": [
    {
      "id": "sg-f01",
      "customer": "Sharma Stores",
      "at": "2026-06-21T09:46:00.000Z",
      "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    },
    {
      "id": "sg-f02",
      "customer": "Verma Traders",
      "at": "2026-06-21T11:02:00.000Z",
      "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    },
    {
      "id": "sg-f03",
      "customer": "Patel Hardware",
      "at": "2026-06-20T15:32:00.000Z",
      "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    },
    {
      "id": "sg-f04",
      "customer": "Reddy Kirana",
      "at": "2026-06-19T10:12:00.000Z",
      "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    }
  ],
  "field-pod": [
    {
      "id": "pod-g01",
      "customer": "Verma Traders",
      "note": "Received by Suresh, good condition",
      "at": "2026-06-21T11:10:00.000Z",
      "gps": "12.9779, 77.5713",
      "image": null
    },
    {
      "id": "pod-g02",
      "customer": "Sharma Stores",
      "note": "2 cartons delivered",
      "at": "2026-06-21T09:50:00.000Z",
      "gps": "12.9716, 77.5946",
      "image": null
    },
    {
      "id": "pod-g03",
      "customer": "Iyer Provision Mart",
      "note": "Left at counter",
      "at": "2026-06-20T14:20:00.000Z",
      "gps": "12.9352, 77.6245",
      "image": null
    },
    {
      "id": "pod-g04",
      "customer": "Reddy Kirana",
      "note": "Received by owner",
      "at": "2026-06-19T10:30:00.000Z",
      "gps": null,
      "image": null
    }
  ],
  "field-target-sales": 50000,
  "field-target-visits": 12,
  "field-km-trips": [
    {
      "id": "km-h01",
      "from": "Warehouse Peenya",
      "to": "KR Market",
      "km": 14.2,
      "amount": 114,
      "at": "2026-06-21T08:50:00.000Z",
      "gps": true
    },
    {
      "id": "km-h02",
      "from": "KR Market",
      "to": "Jayanagar",
      "km": 6.5,
      "amount": 52,
      "at": "2026-06-21T11:30:00.000Z",
      "gps": true
    },
    {
      "id": "km-h03",
      "from": "Jayanagar",
      "to": "Koramangala",
      "km": 4.8,
      "amount": 38,
      "at": "2026-06-21T13:00:00.000Z",
      "gps": false
    },
    {
      "id": "km-h04",
      "from": "Warehouse Peenya",
      "to": "Chickpet",
      "km": 16,
      "amount": 128,
      "at": "2026-06-20T09:00:00.000Z",
      "gps": true
    },
    {
      "id": "km-h05",
      "from": "Chickpet",
      "to": "Warehouse Peenya",
      "km": 16,
      "amount": 128,
      "at": "2026-06-20T18:10:00.000Z",
      "gps": true
    }
  ],
  "field-km-rate": 8,
  "field-intel": [
    {
      "id": "in-i01",
      "competitor": "Fortune",
      "product": "Refined Oil 1L",
      "price": 145,
      "ourPrice": 138,
      "note": "Buy 2 get 1 scheme running",
      "at": "2026-06-21T10:20:00.000Z"
    },
    {
      "id": "in-i02",
      "competitor": "Aashirvaad",
      "product": "Atta 10kg",
      "price": 460,
      "ourPrice": 475,
      "note": "Wider shelf space at Iyer",
      "at": "2026-06-21T12:25:00.000Z"
    },
    {
      "id": "in-i03",
      "competitor": "Tata",
      "product": "Salt 1kg",
      "price": 28,
      "ourPrice": 26,
      "note": "We are cheaper",
      "at": "2026-06-20T14:00:00.000Z"
    },
    {
      "id": "in-i04",
      "competitor": "Red Label",
      "product": "Tea Powder 500g",
      "price": 260,
      "ourPrice": 0,
      "note": "We don't stock this SKU",
      "at": "2026-06-19T11:00:00.000Z"
    },
    {
      "id": "in-i05",
      "competitor": "Surf Excel",
      "product": "Detergent 1kg",
      "price": 155,
      "ourPrice": 160,
      "note": "Festive combo pack pushed hard",
      "at": "2026-06-18T16:00:00.000Z"
    }
  ],
  "field-meter": [
    {
      "id": "mt-j01",
      "asset": "Genset DG-1",
      "value": 10450,
      "unit": "hrs",
      "at": "2026-06-21T08:00:00.000Z",
      "delta": 12.5
    },
    {
      "id": "mt-j02",
      "asset": "Genset DG-1",
      "value": 10437.5,
      "unit": "hrs",
      "at": "2026-06-20T08:00:00.000Z",
      "delta": null
    },
    {
      "id": "mt-j03",
      "asset": "Delivery Van KA-01",
      "value": 84210,
      "unit": "km",
      "at": "2026-06-21T18:00:00.000Z",
      "delta": 57.5
    },
    {
      "id": "mt-j04",
      "asset": "Delivery Van KA-01",
      "value": 84152.5,
      "unit": "km",
      "at": "2026-06-20T18:00:00.000Z",
      "delta": null
    },
    {
      "id": "mt-j05",
      "asset": "Warehouse Meter",
      "value": 23890,
      "unit": "kWh",
      "at": "2026-06-19T09:00:00.000Z",
      "delta": null
    }
  ],
  "field-issues": [
    {
      "id": "is-k01",
      "title": "Damaged stock at Sharma Stores",
      "priority": "high",
      "note": "3 oil bottles leaked in transit",
      "at": "2026-06-21T09:48:00.000Z",
      "gps": "12.9716, 77.5946",
      "image": null,
      "resolved": false
    },
    {
      "id": "is-k02",
      "title": "Signage faded at Verma Traders",
      "priority": "low",
      "note": "Needs replacement board",
      "at": "2026-06-21T11:05:00.000Z",
      "gps": "12.9779, 77.5713",
      "image": null,
      "resolved": false
    },
    {
      "id": "is-k03",
      "title": "Payment dispute Patel Hardware",
      "priority": "medium",
      "note": "Disagreement on last bill amount",
      "at": "2026-06-20T15:35:00.000Z",
      "gps": "12.9352, 77.6245",
      "image": null,
      "resolved": false
    },
    {
      "id": "is-k04",
      "title": "Freezer fault at Reddy Kirana",
      "priority": "high",
      "note": "Compressor not cooling",
      "at": "2026-06-19T10:40:00.000Z",
      "gps": null,
      "image": null,
      "resolved": true
    }
  ],
  "field-quote-gst": 18,
  "field-quote-disc": 5,
  "field-route-tags": {
    "q-7f3a1c2e-0001": "South Beat",
    "q-7f3a1c2e-0002": "Counter",
    "q-7f3a1c2e-0003": "South Beat",
    "q-7f3a1c2e-0005": "East Beat",
    "q-7f3a1c2e-0008": "West Beat"
  },
  "field-discount-cap": 5,
  "field-deposits": [
    {
      "id": "dp-l01",
      "bank": "HDFC Bank Jayanagar",
      "ref": "DEP-4471",
      "amount": 32000,
      "at": "2026-06-21T16:00:00.000Z",
      "image": null
    },
    {
      "id": "dp-l02",
      "bank": "CMS Cash Point",
      "ref": "CMS-8820",
      "amount": 18500,
      "at": "2026-06-21T16:30:00.000Z",
      "image": null
    },
    {
      "id": "dp-l03",
      "bank": "HDFC Bank Jayanagar",
      "ref": "DEP-4458",
      "amount": 12500,
      "at": "2026-06-20T17:15:00.000Z",
      "image": null
    },
    {
      "id": "dp-l04",
      "bank": "SBI Koramangala",
      "ref": "DEP-3392",
      "amount": 9000,
      "at": "2026-06-19T16:45:00.000Z",
      "image": null
    }
  ],
  "field-visit-grace": 14,
  "field-coverage-target": 12,
  "field-samples": [
    {
      "id": "sm-m01",
      "item": "Demo Blender X200",
      "customer": "Gupta General Store",
      "qty": 1,
      "status": "issued",
      "at": "2026-06-18T16:45:00.000Z"
    },
    {
      "id": "sm-m02",
      "item": "Sample Atta 1kg",
      "customer": "Iyer Provision Mart",
      "qty": 5,
      "status": "converted",
      "at": "2026-06-19T12:00:00.000Z"
    },
    {
      "id": "sm-m03",
      "item": "Demo Mixer Grinder",
      "customer": "Reddy Kirana",
      "qty": 1,
      "status": "returned",
      "at": "2026-06-17T10:30:00.000Z"
    },
    {
      "id": "sm-m04",
      "item": "Sample Oil 500ml",
      "customer": "Sharma Stores",
      "qty": 3,
      "status": "issued",
      "at": "2026-06-21T09:47:00.000Z"
    },
    {
      "id": "sm-m05",
      "item": "Demo Water Purifier",
      "customer": "Verma Traders",
      "qty": 1,
      "status": "converted",
      "at": "2026-06-16T14:00:00.000Z"
    }
  ],
  "field-callplan": [
    {
      "id": "cp-n01",
      "customer": "Patel Hardware",
      "reason": "Collection follow-up",
      "priority": "high",
      "date": "2026-06-22",
      "done": false
    },
    {
      "id": "cp-n02",
      "customer": "Gupta General Store",
      "reason": "Demo conversion",
      "priority": "high",
      "date": "2026-06-22",
      "done": false
    },
    {
      "id": "cp-n03",
      "customer": "Reddy Kirana",
      "reason": "Upsell premium range",
      "priority": "medium",
      "date": "2026-06-23",
      "done": false
    },
    {
      "id": "cp-n04",
      "customer": "Iyer Provision Mart",
      "reason": "Send price list",
      "priority": "medium",
      "date": "2026-06-23",
      "done": false
    },
    {
      "id": "cp-n05",
      "customer": "Sharma Stores",
      "reason": "Next order booking",
      "priority": "low",
      "date": "2026-06-28",
      "done": false
    },
    {
      "id": "cp-n06",
      "customer": "Verma Traders",
      "reason": "Delivery confirmation",
      "priority": "high",
      "date": "2026-06-21",
      "done": true
    }
  ],
  "zbb-periods": [
    {
      "period": "2026-06",
      "lines": [
        {
          "id": "zbb-1",
          "category": "payroll",
          "label": "Production floor wages",
          "justified": 1850000
        },
        {
          "id": "zbb-2",
          "category": "expense",
          "label": "Raw material - MS sheet",
          "justified": 2400000
        },
        {
          "id": "zbb-3",
          "category": "expense",
          "label": "Power & fuel",
          "justified": 620000
        },
        {
          "id": "zbb-4",
          "category": "expense",
          "label": "Factory rent - Peenya unit",
          "justified": 450000
        },
        {
          "id": "zbb-5",
          "category": "tax",
          "label": "GST + advance tax provision",
          "justified": 780000
        },
        {
          "id": "zbb-6",
          "category": "expense",
          "label": "Logistics & freight outward",
          "justified": 340000
        }
      ]
    },
    {
      "period": "2026-05",
      "lines": [
        {
          "id": "zbb-7",
          "category": "payroll",
          "label": "Production floor wages",
          "justified": 1800000
        },
        {
          "id": "zbb-8",
          "category": "expense",
          "label": "Raw material - MS sheet",
          "justified": 2250000
        },
        {
          "id": "zbb-9",
          "category": "expense",
          "label": "Power & fuel",
          "justified": 590000
        },
        {
          "id": "zbb-10",
          "category": "expense",
          "label": "Factory rent - Peenya unit",
          "justified": 450000
        }
      ]
    }
  ],
  "dept-budget-pool": "8500000",
  "dept-allocations": [
    {
      "id": "da-1",
      "name": "Production",
      "allocated": 3200000,
      "category": "expense",
      "status": "approved",
      "note": "Q2 production ramp for export order"
    },
    {
      "id": "da-2",
      "name": "Sales & Marketing",
      "allocated": 1400000,
      "category": "expense",
      "status": "submitted",
      "note": "Trade show + dealer incentives"
    },
    {
      "id": "da-3",
      "name": "Human Resources",
      "allocated": 1850000,
      "category": "payroll",
      "status": "approved",
      "note": "Includes 6 new hires"
    },
    {
      "id": "da-4",
      "name": "Logistics",
      "allocated": 720000,
      "category": "expense",
      "status": "draft",
      "note": ""
    },
    {
      "id": "da-5",
      "name": "Finance & Compliance",
      "allocated": 980000,
      "category": "tax",
      "status": "submitted",
      "note": "GST + TDS filings, statutory audit"
    },
    {
      "id": "da-6",
      "name": "IT & Admin",
      "allocated": 350000,
      "category": "expense",
      "status": "rejected",
      "note": "Deferred ERP upgrade to next FY"
    }
  ],
  "capex-items": [
    {
      "id": "cx-1",
      "asset": "CNC laser cutting machine",
      "planned": 4500000,
      "spent": 4620000,
      "date": "2026-03-15",
      "status": "completed"
    },
    {
      "id": "cx-2",
      "asset": "Warehouse racking - Bommasandra",
      "planned": 850000,
      "spent": 790000,
      "date": "2026-05-20",
      "status": "completed"
    },
    {
      "id": "cx-3",
      "asset": "Solar rooftop 100kW",
      "planned": 3800000,
      "spent": 0,
      "date": "2026-09-01",
      "status": "approved"
    },
    {
      "id": "cx-4",
      "asset": "Delivery truck (Tata 407)",
      "planned": 1250000,
      "spent": 0,
      "date": "2026-08-10",
      "status": "planned"
    },
    {
      "id": "cx-5",
      "asset": "Quality testing lab equipment",
      "planned": 1600000,
      "spent": 0,
      "date": "2026-10-05",
      "status": "planned"
    },
    {
      "id": "cx-6",
      "asset": "Office HVAC overhaul",
      "planned": 620000,
      "spent": 680000,
      "date": "2026-02-12",
      "status": "completed"
    }
  ],
  "bud-annual-lines": [
    {
      "id": "al-1",
      "label": "Raw material procurement",
      "category": "expense",
      "annual": 28800000,
      "mode": "seasonal"
    },
    {
      "id": "al-2",
      "label": "Salaries & wages",
      "category": "payroll",
      "annual": 22200000,
      "mode": "even"
    },
    {
      "id": "al-3",
      "label": "Power, fuel & utilities",
      "category": "expense",
      "annual": 7440000,
      "mode": "even"
    },
    {
      "id": "al-4",
      "label": "GST & direct taxes",
      "category": "tax",
      "annual": 9360000,
      "mode": "even"
    },
    {
      "id": "al-5",
      "label": "Marketing & trade promotion",
      "category": "expense",
      "annual": 3600000,
      "mode": "seasonal"
    },
    {
      "id": "al-6",
      "label": "Working capital loan EMI",
      "category": "loan",
      "annual": 4800000,
      "mode": "even"
    }
  ],
  "bud-flex-lines": [
    {
      "id": "fl-1",
      "label": "Direct material",
      "fixed": 0,
      "variablePerUnit": 1850
    },
    {
      "id": "fl-2",
      "label": "Direct labour",
      "fixed": 350000,
      "variablePerUnit": 420
    },
    {
      "id": "fl-3",
      "label": "Factory overhead",
      "fixed": 620000,
      "variablePerUnit": 180
    },
    {
      "id": "fl-4",
      "label": "Power & consumables",
      "fixed": 120000,
      "variablePerUnit": 95
    },
    {
      "id": "fl-5",
      "label": "Packing & dispatch",
      "fixed": 80000,
      "variablePerUnit": 60
    }
  ],
  "bud-flex-planned-vol": "1200",
  "bud-cash-opening": "3500000",
  "bud-cash-rows": [
    {
      "id": "cr-1",
      "month": "2026-06",
      "inflow": 9200000,
      "outflow": 8100000
    },
    {
      "id": "cr-2",
      "month": "2026-07",
      "inflow": 8800000,
      "outflow": 9400000
    },
    {
      "id": "cr-3",
      "month": "2026-08",
      "inflow": 10500000,
      "outflow": 8900000
    },
    {
      "id": "cr-4",
      "month": "2026-09",
      "inflow": 11200000,
      "outflow": 9600000
    },
    {
      "id": "cr-5",
      "month": "2026-10",
      "inflow": 13800000,
      "outflow": 11200000
    },
    {
      "id": "cr-6",
      "month": "2026-11",
      "inflow": 12400000,
      "outflow": 10100000
    }
  ],
  "bud-headcount": [
    {
      "id": "hc-1",
      "role": "CNC Operator",
      "dept": "Production",
      "headcount": 8,
      "monthlyCtc": 28000,
      "startMonth": "2026-07"
    },
    {
      "id": "hc-2",
      "role": "Quality Inspector",
      "dept": "Quality",
      "headcount": 3,
      "monthlyCtc": 32000,
      "startMonth": "2026-07"
    },
    {
      "id": "hc-3",
      "role": "Sales Executive",
      "dept": "Sales & Marketing",
      "headcount": 4,
      "monthlyCtc": 38000,
      "startMonth": "2026-08"
    },
    {
      "id": "hc-4",
      "role": "Accounts Officer",
      "dept": "Finance",
      "headcount": 2,
      "monthlyCtc": 45000,
      "startMonth": "2026-09"
    },
    {
      "id": "hc-5",
      "role": "Warehouse Supervisor",
      "dept": "Logistics",
      "headcount": 1,
      "monthlyCtc": 42000,
      "startMonth": "2026-07"
    },
    {
      "id": "hc-6",
      "role": "Production Manager",
      "dept": "Production",
      "headcount": 1,
      "monthlyCtc": 95000,
      "startMonth": "2026-10"
    }
  ],
  "bud-projects": [
    {
      "id": "pj-1",
      "name": "Export order - Sharjah",
      "client": "Gulf Steel Trading LLC",
      "budget": 6500000,
      "spent": 5980000
    },
    {
      "id": "pj-2",
      "name": "L&T fabrication contract",
      "client": "Larsen & Toubro Ltd",
      "budget": 12000000,
      "spent": 13200000
    },
    {
      "id": "pj-3",
      "name": "Tata Motors bracket supply",
      "client": "Tata Motors Ltd",
      "budget": 8400000,
      "spent": 4100000
    },
    {
      "id": "pj-4",
      "name": "BMTC chassis components",
      "client": "BMTC",
      "budget": 3200000,
      "spent": 2750000
    },
    {
      "id": "pj-5",
      "name": "In-house tooling upgrade",
      "client": "Internal",
      "budget": 1500000,
      "spent": 920000
    }
  ],
  "bud-reforecast-adjust": "8",
  "bud-mktg-budget": "1500000",
  "bud-mktg-channels": [
    {
      "id": "ch-1",
      "name": "Google Ads",
      "spend": 320000,
      "revenue": 1280000
    },
    {
      "id": "ch-2",
      "name": "IndiaMART leads",
      "spend": 240000,
      "revenue": 1560000
    },
    {
      "id": "ch-3",
      "name": "Trade shows",
      "spend": 480000,
      "revenue": 1440000
    },
    {
      "id": "ch-4",
      "name": "Dealer incentives",
      "spend": 360000,
      "revenue": 2880000
    },
    {
      "id": "ch-5",
      "name": "LinkedIn outreach",
      "spend": 150000,
      "revenue": 420000
    },
    {
      "id": "ch-6",
      "name": "WhatsApp campaigns",
      "spend": 90000,
      "revenue": 540000
    }
  ],
  "bud-cut-levels": {
    "expense": "medium",
    "payroll": "hard",
    "tax": "hard",
    "loan": "hard",
    "transfer": "easy",
    "other": "easy"
  },
  "bud-realloc-moves": [
    {
      "id": "mv-1",
      "fromId": "budget-marketing",
      "toId": "budget-production",
      "amount": 200000
    },
    {
      "id": "mv-2",
      "fromId": "budget-admin",
      "toId": "budget-logistics",
      "amount": 120000
    },
    {
      "id": "mv-3",
      "fromId": "budget-travel",
      "toId": "budget-payroll",
      "amount": 85000
    }
  ],
  "bud-phasing-lines": [
    {
      "id": "ph-1",
      "label": "Raw material procurement",
      "annual": 28800000,
      "q1": 6200000,
      "q2": 6800000,
      "q3": 7400000,
      "q4": 8400000
    },
    {
      "id": "ph-2",
      "label": "Salaries & wages",
      "annual": 22200000,
      "q1": 5550000,
      "q2": 5550000,
      "q3": 5550000,
      "q4": 5550000
    },
    {
      "id": "ph-3",
      "label": "Marketing & promotion",
      "annual": 3600000,
      "q1": 700000,
      "q2": 800000,
      "q3": 900000,
      "q4": 1200000
    },
    {
      "id": "ph-4",
      "label": "Capex outlay",
      "annual": 9600000,
      "q1": 4500000,
      "q2": 2100000,
      "q3": 1500000,
      "q4": 1500000
    }
  ],
  "bud-contingency-pct": "12",
  "price-overrides": [
    {
      "id": "po-1",
      "sku": "MS-SHT-2MM",
      "name": "MS Sheet 2mm (4x8 ft)",
      "basePrice": 4200,
      "unit": "sheet",
      "gstRate": 18,
      "tiers": [
        {
          "label": "Retail",
          "discountPct": 0
        },
        {
          "label": "Dealer",
          "discountPct": 10
        },
        {
          "label": "Distributor",
          "discountPct": 20
        }
      ]
    },
    {
      "id": "po-2",
      "sku": "MS-ANG-50",
      "name": "MS Angle 50x50x5mm",
      "basePrice": 580,
      "unit": "kg",
      "gstRate": 18,
      "tiers": [
        {
          "label": "Retail",
          "discountPct": 0
        },
        {
          "label": "Dealer",
          "discountPct": 10
        },
        {
          "label": "Distributor",
          "discountPct": 20
        }
      ]
    },
    {
      "id": "po-3",
      "sku": "GI-PIPE-25",
      "name": "GI Pipe 25mm Class B",
      "basePrice": 920,
      "unit": "meter",
      "gstRate": 18,
      "tiers": [
        {
          "label": "Retail",
          "discountPct": 0
        },
        {
          "label": "Dealer",
          "discountPct": 10
        },
        {
          "label": "Distributor",
          "discountPct": 20
        }
      ]
    },
    {
      "id": "po-4",
      "sku": "BRKT-TM-01",
      "name": "Mounting Bracket (Tata spec)",
      "basePrice": 145,
      "unit": "piece",
      "gstRate": 18,
      "tiers": [
        {
          "label": "Retail",
          "discountPct": 0
        },
        {
          "label": "Dealer",
          "discountPct": 10
        },
        {
          "label": "Distributor",
          "discountPct": 20
        }
      ]
    },
    {
      "id": "po-5",
      "sku": "WELD-ROD-3",
      "name": "Welding Rod 3.15mm (pkt)",
      "basePrice": 380,
      "unit": "box",
      "gstRate": 18,
      "tiers": [
        {
          "label": "Retail",
          "discountPct": 0
        },
        {
          "label": "Dealer",
          "discountPct": 10
        },
        {
          "label": "Distributor",
          "discountPct": 20
        }
      ]
    },
    {
      "id": "po-6",
      "sku": "FAB-CHS-02",
      "name": "Fabricated Chassis Frame",
      "basePrice": 18500,
      "unit": "piece",
      "gstRate": 18,
      "tiers": [
        {
          "label": "Retail",
          "discountPct": 0
        },
        {
          "label": "Dealer",
          "discountPct": 10
        },
        {
          "label": "Distributor",
          "discountPct": 20
        }
      ]
    }
  ],
  "lead-time-deliveries": [
    {
      "id": "ltd-1",
      "vendor": "JSW Steel Ltd",
      "item": "PO-2026-0412 / HR Coil",
      "orderedDate": "2026-05-02",
      "promisedDate": "2026-05-12",
      "actualDate": "2026-05-11"
    },
    {
      "id": "ltd-2",
      "vendor": "JSW Steel Ltd",
      "item": "PO-2026-0455 / MS Sheet",
      "orderedDate": "2026-05-20",
      "promisedDate": "2026-05-30",
      "actualDate": "2026-06-02"
    },
    {
      "id": "ltd-3",
      "vendor": "Sundaram Fasteners",
      "item": "PO-2026-0461 / Bolts M12",
      "orderedDate": "2026-05-22",
      "promisedDate": "2026-05-28",
      "actualDate": "2026-05-27"
    },
    {
      "id": "ltd-4",
      "vendor": "Sundaram Fasteners",
      "item": "PO-2026-0489 / Washers",
      "orderedDate": "2026-06-01",
      "promisedDate": "2026-06-06",
      "actualDate": "2026-06-05"
    },
    {
      "id": "ltd-5",
      "vendor": "Bharat Forge",
      "item": "PO-2026-0470 / Forgings",
      "orderedDate": "2026-05-10",
      "promisedDate": "2026-05-25",
      "actualDate": "2026-06-08"
    },
    {
      "id": "ltd-6",
      "vendor": "Ador Welding",
      "item": "PO-2026-0498 / Welding rods",
      "orderedDate": "2026-06-03",
      "promisedDate": "2026-06-09",
      "actualDate": "2026-06-09"
    }
  ],
  "boms": [
    {
      "id": "bom-1",
      "product": "Fabricated Chassis Frame",
      "outputQty": 1,
      "outputUnit": "piece",
      "overheadPct": 15,
      "sellingPrice": 18500,
      "lines": [
        {
          "id": "bl-1",
          "material": "MS Sheet 2mm",
          "qty": 12,
          "unit": "kg",
          "unitCost": 68
        },
        {
          "id": "bl-2",
          "material": "MS Angle 50x50",
          "qty": 8,
          "unit": "kg",
          "unitCost": 72
        },
        {
          "id": "bl-3",
          "material": "Welding rod",
          "qty": 0.5,
          "unit": "kg",
          "unitCost": 240
        },
        {
          "id": "bl-4",
          "material": "Paint & primer",
          "qty": 1,
          "unit": "litre",
          "unitCost": 320
        }
      ]
    },
    {
      "id": "bom-2",
      "product": "Mounting Bracket (Tata spec)",
      "outputQty": 10,
      "outputUnit": "piece",
      "overheadPct": 12,
      "sellingPrice": 1450,
      "lines": [
        {
          "id": "bl-5",
          "material": "MS Plate 6mm",
          "qty": 4,
          "unit": "kg",
          "unitCost": 70
        },
        {
          "id": "bl-6",
          "material": "Zinc plating",
          "qty": 10,
          "unit": "piece",
          "unitCost": 6
        },
        {
          "id": "bl-7",
          "material": "Fasteners M12",
          "qty": 20,
          "unit": "piece",
          "unitCost": 4
        }
      ]
    },
    {
      "id": "bom-3",
      "product": "GI Storage Tank 500L",
      "outputQty": 1,
      "outputUnit": "piece",
      "overheadPct": 18,
      "sellingPrice": 9800,
      "lines": [
        {
          "id": "bl-8",
          "material": "GI Sheet 1.6mm",
          "qty": 22,
          "unit": "kg",
          "unitCost": 82
        },
        {
          "id": "bl-9",
          "material": "Flange & fittings",
          "qty": 1,
          "unit": "set",
          "unitCost": 650
        },
        {
          "id": "bl-10",
          "material": "Welding consumables",
          "qty": 1,
          "unit": "set",
          "unitCost": 180
        }
      ]
    }
  ],
  "reorder-items": [
    {
      "id": "ri-1",
      "name": "MS Sheet 2mm (4x8 ft)",
      "currentStock": 45,
      "reorderPoint": 60,
      "reorderQty": 120,
      "leadTimeDays": 10,
      "unitCost": 4200,
      "supplier": "JSW Steel Ltd"
    },
    {
      "id": "ri-2",
      "name": "MS Angle 50x50x5mm",
      "currentStock": 820,
      "reorderPoint": 500,
      "reorderQty": 1000,
      "leadTimeDays": 8,
      "unitCost": 580,
      "supplier": "JSW Steel Ltd"
    },
    {
      "id": "ri-3",
      "name": "Welding Rod 3.15mm",
      "currentStock": 18,
      "reorderPoint": 40,
      "reorderQty": 100,
      "leadTimeDays": 5,
      "unitCost": 380,
      "supplier": "Ador Welding"
    },
    {
      "id": "ri-4",
      "name": "Fasteners M12 (box)",
      "currentStock": 12,
      "reorderPoint": 25,
      "reorderQty": 80,
      "leadTimeDays": 6,
      "unitCost": 1200,
      "supplier": "Sundaram Fasteners"
    },
    {
      "id": "ri-5",
      "name": "GI Pipe 25mm Class B",
      "currentStock": 340,
      "reorderPoint": 200,
      "reorderQty": 400,
      "leadTimeDays": 9,
      "unitCost": 920,
      "supplier": "APL Apollo Tubes"
    },
    {
      "id": "ri-6",
      "name": "Industrial Paint (20L)",
      "currentStock": 6,
      "reorderPoint": 15,
      "reorderQty": 30,
      "leadTimeDays": 4,
      "unitCost": 5400,
      "supplier": "Asian Paints PPG"
    }
  ],
  "aged-payables": [
    {
      "id": "ap-1",
      "vendor": "JSW Steel Ltd",
      "billNo": "JSW/24-25/8841",
      "amount": 1450000,
      "billDate": "2026-04-18",
      "dueDate": "2026-05-18",
      "isMsme": false,
      "status": "unpaid"
    },
    {
      "id": "ap-2",
      "vendor": "Sundaram Fasteners",
      "billNo": "SF/2026/2210",
      "amount": 285000,
      "billDate": "2026-05-02",
      "dueDate": "2026-06-01",
      "isMsme": false,
      "status": "unpaid"
    },
    {
      "id": "ap-3",
      "vendor": "Sri Venkateshwara Engg",
      "billNo": "SVE-0192",
      "amount": 96000,
      "billDate": "2026-04-25",
      "dueDate": "2026-05-10",
      "isMsme": true,
      "status": "unpaid"
    },
    {
      "id": "ap-4",
      "vendor": "Ador Welding",
      "billNo": "ADW/26/1145",
      "amount": 142000,
      "billDate": "2026-05-20",
      "dueDate": "2026-06-19",
      "isMsme": false,
      "status": "paid"
    },
    {
      "id": "ap-5",
      "vendor": "Karnataka Power Corp",
      "billNo": "KPTCL-MAY26",
      "amount": 318000,
      "billDate": "2026-05-31",
      "dueDate": "2026-06-15",
      "isMsme": false,
      "status": "unpaid"
    },
    {
      "id": "ap-6",
      "vendor": "Deepak Transport",
      "billNo": "DT/26/0771",
      "amount": 64500,
      "billDate": "2026-06-01",
      "dueDate": "2026-06-16",
      "isMsme": true,
      "status": "unpaid"
    }
  ],
  "stock-ledger-moves": [
    {
      "id": "sl-1",
      "date": "2026-06-02",
      "sku": "MS-SHT-2MM",
      "product": "MS Sheet 2mm",
      "type": "in",
      "qty": 120,
      "rate": 4200,
      "note": "GRN against PO-2026-0455"
    },
    {
      "id": "sl-2",
      "date": "2026-06-04",
      "sku": "MS-SHT-2MM",
      "product": "MS Sheet 2mm",
      "type": "out",
      "qty": 38,
      "rate": 4200,
      "note": "Issued to production - chassis batch"
    },
    {
      "id": "sl-3",
      "date": "2026-06-06",
      "sku": "WELD-ROD-3",
      "product": "Welding Rod 3.15mm",
      "type": "out",
      "qty": 22,
      "rate": 380,
      "note": "Consumed - fabrication line"
    },
    {
      "id": "sl-4",
      "date": "2026-06-09",
      "sku": "GI-PIPE-25",
      "product": "GI Pipe 25mm",
      "type": "in",
      "qty": 400,
      "rate": 920,
      "note": "Stock receipt - APL Apollo"
    },
    {
      "id": "sl-5",
      "date": "2026-06-12",
      "sku": "BRKT-TM-01",
      "product": "Mounting Bracket",
      "type": "out",
      "qty": 500,
      "rate": 145,
      "note": "Dispatched to Tata Motors"
    },
    {
      "id": "sl-6",
      "date": "2026-06-15",
      "sku": "MS-ANG-50",
      "product": "MS Angle 50x50",
      "type": "out",
      "qty": 180,
      "rate": 580,
      "note": "Issued to job work"
    }
  ],
  "batch-tracking": [
    {
      "id": "bt-1",
      "product": "Industrial Paint (20L)",
      "batchNo": "BATCH-AP-2604",
      "serial": "SN-00112",
      "qty": 30,
      "mfgDate": "2026-04-10",
      "expiryDate": "2027-04-09",
      "location": "Store-A Rack 3"
    },
    {
      "id": "bt-2",
      "product": "Welding Rod 3.15mm",
      "batchNo": "ADW-WR-0591",
      "serial": "SN-00188",
      "qty": 100,
      "mfgDate": "2026-05-01",
      "expiryDate": "2028-04-30",
      "location": "Store-B Rack 1"
    },
    {
      "id": "bt-3",
      "product": "Adhesive Sealant",
      "batchNo": "SLNT-2605",
      "serial": "SN-00203",
      "qty": 45,
      "mfgDate": "2026-03-15",
      "expiryDate": "2026-09-14",
      "location": "Store-A Rack 5"
    },
    {
      "id": "bt-4",
      "product": "Primer Coating",
      "batchNo": "PRM-2604",
      "serial": "SN-00219",
      "qty": 24,
      "mfgDate": "2026-04-22",
      "expiryDate": "2027-04-21",
      "location": "Store-A Rack 3"
    },
    {
      "id": "bt-5",
      "product": "Threadlocker",
      "batchNo": "TL-2602",
      "serial": "SN-00231",
      "qty": 12,
      "mfgDate": "2026-02-10",
      "expiryDate": "2026-08-09",
      "location": "Store-B Rack 4"
    }
  ],
  "job-work-challans": [
    {
      "id": "jw-1",
      "challanNo": "JW/2026/0045",
      "jobWorker": "Sri Ganesh Powder Coating",
      "gstin": "29AAGCS1234M1Z2",
      "product": "Mounting Bracket",
      "sentQty": 500,
      "receivedQty": 500,
      "sentDate": "2026-05-28",
      "dueDate": "2026-06-05",
      "process": "Powder coating",
      "status": "received"
    },
    {
      "id": "jw-2",
      "challanNo": "JW/2026/0051",
      "jobWorker": "Anand Heat Treaters",
      "gstin": "29AABCA5678L1Z9",
      "product": "Chassis Frame",
      "sentQty": 80,
      "receivedQty": 60,
      "sentDate": "2026-06-04",
      "dueDate": "2026-06-14",
      "process": "Heat treatment",
      "status": "partial"
    },
    {
      "id": "jw-3",
      "challanNo": "JW/2026/0058",
      "jobWorker": "Laxmi Electroplating",
      "gstin": "29AADCL9012K1Z4",
      "product": "Fasteners M12",
      "sentQty": 2000,
      "receivedQty": 0,
      "sentDate": "2026-06-12",
      "dueDate": "2026-06-22",
      "process": "Zinc plating",
      "status": "sent"
    },
    {
      "id": "jw-4",
      "challanNo": "JW/2026/0062",
      "jobWorker": "Sri Ganesh Powder Coating",
      "gstin": "29AAGCS1234M1Z2",
      "product": "Storage Tank 500L",
      "sentQty": 25,
      "receivedQty": 25,
      "sentDate": "2026-05-15",
      "dueDate": "2026-05-25",
      "process": "Powder coating",
      "status": "received"
    },
    {
      "id": "jw-5",
      "challanNo": "JW/2026/0067",
      "jobWorker": "Precision CNC Works",
      "gstin": "29AAFCP3456J1Z7",
      "product": "Custom Flange",
      "sentQty": 150,
      "receivedQty": 90,
      "sentDate": "2026-06-10",
      "dueDate": "2026-06-20",
      "process": "CNC machining",
      "status": "partial"
    }
  ],
  "production-runs": [
    {
      "id": "pr-1",
      "date": "2026-06-03",
      "product": "Fabricated Chassis Frame",
      "plannedQty": 80,
      "producedQty": 76,
      "laborCost": 152000,
      "overheadCost": 98000,
      "components": [
        {
          "id": "pc-1",
          "material": "MS Sheet 2mm",
          "qtyPerUnit": 12,
          "unitCost": 68
        },
        {
          "id": "pc-2",
          "material": "MS Angle 50x50",
          "qtyPerUnit": 8,
          "unitCost": 72
        },
        {
          "id": "pc-3",
          "material": "Welding rod",
          "qtyPerUnit": 0.5,
          "unitCost": 240
        }
      ]
    },
    {
      "id": "pr-2",
      "date": "2026-06-08",
      "product": "Mounting Bracket (Tata spec)",
      "plannedQty": 1000,
      "producedQty": 1000,
      "laborCost": 64000,
      "overheadCost": 42000,
      "components": [
        {
          "id": "pc-4",
          "material": "MS Plate 6mm",
          "qtyPerUnit": 0.4,
          "unitCost": 70
        },
        {
          "id": "pc-5",
          "material": "Fasteners M12",
          "qtyPerUnit": 2,
          "unitCost": 4
        }
      ]
    },
    {
      "id": "pr-3",
      "date": "2026-06-14",
      "product": "GI Storage Tank 500L",
      "plannedQty": 30,
      "producedQty": 28,
      "laborCost": 84000,
      "overheadCost": 56000,
      "components": [
        {
          "id": "pc-6",
          "material": "GI Sheet 1.6mm",
          "qtyPerUnit": 22,
          "unitCost": 82
        },
        {
          "id": "pc-7",
          "material": "Flange & fittings",
          "qtyPerUnit": 1,
          "unitCost": 650
        }
      ]
    }
  ],
  "warehouse-locations": [
    {
      "id": "loc-1",
      "name": "Peenya Main Store"
    },
    {
      "id": "loc-2",
      "name": "Bommasandra Warehouse"
    },
    {
      "id": "loc-3",
      "name": "Finished Goods Yard"
    },
    {
      "id": "loc-4",
      "name": "Raw Material Shed"
    }
  ],
  "warehouse-balances": [
    {
      "id": "wb-1",
      "locId": "loc-1",
      "product": "MS Sheet 2mm",
      "qty": 45
    },
    {
      "id": "wb-2",
      "locId": "loc-4",
      "product": "MS Angle 50x50",
      "qty": 820
    },
    {
      "id": "wb-3",
      "locId": "loc-1",
      "product": "Welding Rod 3.15mm",
      "qty": 18
    },
    {
      "id": "wb-4",
      "locId": "loc-2",
      "product": "GI Pipe 25mm",
      "qty": 340
    },
    {
      "id": "wb-5",
      "locId": "loc-3",
      "product": "Fabricated Chassis Frame",
      "qty": 76
    },
    {
      "id": "wb-6",
      "locId": "loc-3",
      "product": "Mounting Bracket",
      "qty": 500
    }
  ],
  "warehouse-transfers": [
    {
      "id": "wt-1",
      "date": "2026-06-05",
      "fromId": "loc-4",
      "toId": "loc-1",
      "product": "MS Angle 50x50",
      "qty": 200
    },
    {
      "id": "wt-2",
      "date": "2026-06-09",
      "fromId": "loc-1",
      "toId": "loc-3",
      "product": "Fabricated Chassis Frame",
      "qty": 76
    },
    {
      "id": "wt-3",
      "date": "2026-06-12",
      "fromId": "loc-2",
      "toId": "loc-1",
      "product": "GI Pipe 25mm",
      "qty": 150
    },
    {
      "id": "wt-4",
      "date": "2026-06-15",
      "fromId": "loc-1",
      "toId": "loc-3",
      "product": "Mounting Bracket",
      "qty": 500
    }
  ],
  "stock-take-counts": [
    {
      "id": "stc-1",
      "sku": "MS-SHT-2MM",
      "product": "MS Sheet 2mm",
      "systemQty": 45,
      "countedQty": 43
    },
    {
      "id": "stc-2",
      "sku": "MS-ANG-50",
      "product": "MS Angle 50x50",
      "systemQty": 820,
      "countedQty": 820
    },
    {
      "id": "stc-3",
      "sku": "WELD-ROD-3",
      "product": "Welding Rod 3.15mm",
      "systemQty": 18,
      "countedQty": 21
    },
    {
      "id": "stc-4",
      "sku": "GI-PIPE-25",
      "product": "GI Pipe 25mm",
      "systemQty": 340,
      "countedQty": 335
    },
    {
      "id": "stc-5",
      "sku": "BRKT-TM-01",
      "product": "Mounting Bracket",
      "systemQty": 500,
      "countedQty": 498
    },
    {
      "id": "stc-6",
      "sku": "PAINT-20L",
      "product": "Industrial Paint (20L)",
      "systemQty": 6,
      "countedQty": 6
    }
  ],
  "dispatch-stops": [
    {
      "id": "ds-1",
      "date": "2026-06-21",
      "customer": "Tata Motors Ltd",
      "address": "Plant 2, Pantnagar Industrial Area",
      "area": "Whitefield",
      "weightKg": 1250,
      "status": "delivered"
    },
    {
      "id": "ds-2",
      "date": "2026-06-21",
      "customer": "Larsen & Toubro Ltd",
      "address": "EPC Yard, Hebbal",
      "area": "Hebbal",
      "weightKg": 2400,
      "status": "loaded"
    },
    {
      "id": "ds-3",
      "date": "2026-06-21",
      "customer": "BMTC Central Workshop",
      "address": "Shanthinagar Depot",
      "area": "Shanthinagar",
      "weightKg": 680,
      "status": "pending"
    },
    {
      "id": "ds-4",
      "date": "2026-06-22",
      "customer": "Gulf Steel Trading",
      "address": "ICD Whitefield (export)",
      "area": "Whitefield",
      "weightKg": 3200,
      "status": "pending"
    },
    {
      "id": "ds-5",
      "date": "2026-06-22",
      "customer": "Sri Krishna Engineering",
      "address": "Peenya 2nd Stage",
      "area": "Peenya",
      "weightKg": 420,
      "status": "pending"
    }
  ],
  "ops-sku-margin-prices": {
    "MS-SHT-2MM": {
      "sellPrice": 5400
    },
    "MS-ANG-50": {
      "sellPrice": 740
    },
    "GI-PIPE-25": {
      "sellPrice": 1180
    },
    "BRKT-TM-01": {
      "sellPrice": 195
    },
    "FAB-CHS-02": {
      "sellPrice": 23500
    }
  },
  "ops-landed-lines": [
    {
      "id": "ll-1",
      "item": "Imported CNC Tooling Set",
      "qty": 2,
      "unitCost": 185000,
      "weightKg": 340
    },
    {
      "id": "ll-2",
      "item": "Hydraulic Press Cylinder",
      "qty": 1,
      "unitCost": 420000,
      "weightKg": 280
    },
    {
      "id": "ll-3",
      "item": "Precision Bearings (carton)",
      "qty": 50,
      "unitCost": 3200,
      "weightKg": 120
    },
    {
      "id": "ll-4",
      "item": "Control Panel PLC Unit",
      "qty": 3,
      "unitCost": 96000,
      "weightKg": 60
    }
  ],
  "ops-landed-freight": 145000,
  "ops-landed-duty": 188000,
  "ops-landed-insurance": 42000,
  "ops-grn-log": [
    {
      "id": "grn-1",
      "date": "2026-06-02",
      "poRef": "PO-2026-0455",
      "vendor": "JSW Steel Ltd",
      "item": "MS Sheet 2mm",
      "orderedQty": 120,
      "receivedQty": 118,
      "orderedRate": 4200,
      "invoicedRate": 4280,
      "note": "Short receipt 2 sheets, rate revised"
    },
    {
      "id": "grn-2",
      "date": "2026-06-09",
      "poRef": "PO-2026-0470",
      "vendor": "Bharat Forge",
      "item": "Steel Forgings",
      "orderedQty": 200,
      "receivedQty": 200,
      "orderedRate": 320,
      "invoicedRate": 320,
      "note": "OK"
    },
    {
      "id": "grn-3",
      "date": "2026-06-12",
      "poRef": "PO-2026-0489",
      "vendor": "Sundaram Fasteners",
      "item": "Washers M12",
      "orderedQty": 5000,
      "receivedQty": 5000,
      "orderedRate": 1.2,
      "invoicedRate": 1.35,
      "note": "Rate higher than PO"
    },
    {
      "id": "grn-4",
      "date": "2026-06-15",
      "poRef": "PO-2026-0498",
      "vendor": "Ador Welding",
      "item": "Welding Rod 3.15mm",
      "orderedQty": 100,
      "receivedQty": 95,
      "orderedRate": 380,
      "invoicedRate": 380,
      "note": "5 boxes damaged in transit"
    }
  ],
  "ops-scrap-log": [
    {
      "id": "sc-1",
      "date": "2026-06-04",
      "product": "MS Sheet 2mm",
      "qty": 3,
      "unitCost": 4200,
      "reason": "Cutting error - wrong dimension"
    },
    {
      "id": "sc-2",
      "date": "2026-06-07",
      "product": "Welding Rod 3.15mm",
      "qty": 5,
      "unitCost": 380,
      "reason": "Moisture damage"
    },
    {
      "id": "sc-3",
      "date": "2026-06-10",
      "product": "Fabricated Chassis Frame",
      "qty": 4,
      "unitCost": 9200,
      "reason": "Failed QC - weld porosity"
    },
    {
      "id": "sc-4",
      "date": "2026-06-13",
      "product": "Mounting Bracket",
      "qty": 12,
      "unitCost": 78,
      "reason": "Plating defect"
    },
    {
      "id": "sc-5",
      "date": "2026-06-16",
      "product": "GI Pipe 25mm",
      "qty": 8,
      "unitCost": 920,
      "reason": "Bent during handling"
    }
  ],
  "ops-returns-register": [
    {
      "id": "rt-1",
      "date": "2026-06-05",
      "kind": "customer",
      "party": "BMTC Central Workshop",
      "product": "Mounting Bracket",
      "qty": 40,
      "unitValue": 145,
      "reason": "Dimension mismatch",
      "disposition": "restock",
      "status": "closed"
    },
    {
      "id": "rt-2",
      "date": "2026-06-08",
      "kind": "rtv",
      "party": "JSW Steel Ltd",
      "product": "MS Sheet 2mm",
      "qty": 2,
      "unitValue": 4200,
      "reason": "Surface rust",
      "disposition": "quarantine",
      "status": "open"
    },
    {
      "id": "rt-3",
      "date": "2026-06-11",
      "kind": "customer",
      "party": "Sri Krishna Engineering",
      "product": "GI Pipe 25mm",
      "qty": 15,
      "unitValue": 920,
      "reason": "Over-supplied",
      "disposition": "restock",
      "status": "closed"
    },
    {
      "id": "rt-4",
      "date": "2026-06-14",
      "kind": "rtv",
      "party": "Ador Welding",
      "product": "Welding Rod 3.15mm",
      "qty": 5,
      "unitValue": 380,
      "reason": "Damaged in transit",
      "disposition": "scrap",
      "status": "open"
    },
    {
      "id": "rt-5",
      "date": "2026-06-17",
      "kind": "customer",
      "party": "Tata Motors Ltd",
      "product": "Fabricated Chassis Frame",
      "qty": 3,
      "unitValue": 18500,
      "reason": "Paint defect",
      "disposition": "quarantine",
      "status": "open"
    }
  ],
  "ops-valuation-oldest-cost": {
    "MS-SHT-2MM": 3950,
    "MS-ANG-50": 540,
    "GI-PIPE-25": 870,
    "BRKT-TM-01": 132,
    "WELD-ROD-3": 350
  },
  "ops-ss-lead-time": 10,
  "ops-ss-lead-variance": 3,
  "ops-ss-service-level": 97,
  "ops-ss-review-days": 30,
  "ops-carry-capital-pct": 14,
  "ops-carry-storage-pct": 5,
  "ops-carry-obsolete-pct": 3,
  "ops-carry-insurance-pct": 1,
  "ops-stockout-margin-pct": 28,
  "ops-stockout-goodwill-pct": 12,
  "ops-cycle-freq-a": 30,
  "ops-cycle-freq-b": 90,
  "ops-cycle-freq-c": 180,
  "ops-cycle-last-counted": {
    "MS-SHT-2MM": "2026-06-15",
    "MS-ANG-50": "2026-05-28",
    "GI-PIPE-25": "2026-04-10",
    "BRKT-TM-01": "2026-06-12",
    "WELD-ROD-3": "2026-03-22"
  },
  "ops-minmax-lead-days": 8,
  "ops-minmax-max-cover": 30,
  "ops-minmax-safety-days": 5,
  "ops-wh-util-zones": [
    {
      "id": "wz-1",
      "name": "Raw Material Shed",
      "capacity": 5000,
      "used": 3800
    },
    {
      "id": "wz-2",
      "name": "Peenya Main Store",
      "capacity": 2000,
      "used": 1650
    },
    {
      "id": "wz-3",
      "name": "Finished Goods Yard",
      "capacity": 3000,
      "used": 2900
    },
    {
      "id": "wz-4",
      "name": "Bommasandra Warehouse",
      "capacity": 4000,
      "used": 1200
    },
    {
      "id": "wz-5",
      "name": "Quarantine Area",
      "capacity": 500,
      "used": 180
    }
  ],
  "auto-activity": [
    {
      "id": "act-1001",
      "ts": "2026-06-20T09:14:00.000Z",
      "tool": "Rule Builder",
      "kind": "create",
      "message": "Rule \"Large vendor payouts\" created"
    },
    {
      "id": "act-1002",
      "ts": "2026-06-19T15:42:00.000Z",
      "tool": "Reminder Scheduler",
      "kind": "create",
      "message": "Reminder scheduled for \"Sunrise Textiles Pvt Ltd\""
    },
    {
      "id": "act-1003",
      "ts": "2026-06-19T11:05:00.000Z",
      "tool": "Approval Chains",
      "kind": "run",
      "message": "Approval #a1b2c3d4 APPROVED"
    },
    {
      "id": "act-1004",
      "ts": "2026-06-18T18:30:00.000Z",
      "tool": "Bulk Runner",
      "kind": "run",
      "message": "Previewed \"Send reminder\" on 7 record(s)"
    },
    {
      "id": "act-1005",
      "ts": "2026-06-18T10:12:00.000Z",
      "tool": "Trigger Library",
      "kind": "create",
      "message": "Installed recipe \"Overdue invoice nudge\""
    },
    {
      "id": "act-1006",
      "ts": "2026-06-17T14:48:00.000Z",
      "tool": "Recurring Tasks",
      "kind": "create",
      "message": "Recurring task \"GSTR-3B filing\" (monthly)"
    },
    {
      "id": "act-1007",
      "ts": "2026-06-16T08:20:00.000Z",
      "tool": "Notification Rules",
      "kind": "create",
      "message": "Notify Priya Sharma on \"Low balance\""
    },
    {
      "id": "act-1008",
      "ts": "2026-06-15T17:55:00.000Z",
      "tool": "Approval Chains",
      "kind": "delete",
      "message": "Chain \"Old payouts\" removed"
    }
  ],
  "auto-rules": [
    {
      "id": "rule-201",
      "name": "Large vendor payouts",
      "subject": "transaction",
      "field": "amount",
      "op": ">",
      "value": "100000",
      "action": "escalate",
      "enabled": true
    },
    {
      "id": "rule-202",
      "name": "Overdue invoices",
      "subject": "invoice",
      "field": "daysOverdue",
      "op": ">",
      "value": "0",
      "action": "notify",
      "enabled": true
    },
    {
      "id": "rule-203",
      "name": "Payroll watch",
      "subject": "transaction",
      "field": "category",
      "op": "==",
      "value": "payroll",
      "action": "flag",
      "enabled": true
    },
    {
      "id": "rule-204",
      "name": "Tax outflows",
      "subject": "transaction",
      "field": "category",
      "op": "==",
      "value": "tax",
      "action": "tag",
      "enabled": false
    },
    {
      "id": "rule-205",
      "name": "Big invoices raised",
      "subject": "invoice",
      "field": "amount",
      "op": ">",
      "value": "200000",
      "action": "notify",
      "enabled": true
    },
    {
      "id": "rule-206",
      "name": "Pending receivables",
      "subject": "invoice",
      "field": "status",
      "op": "==",
      "value": "pending",
      "action": "notify",
      "enabled": true
    }
  ],
  "auto-reminders": [
    {
      "id": "rem-301",
      "label": "Sunrise Textiles Pvt Ltd — ₹1,85,000 (due 2026-06-25)",
      "source": "invoice",
      "refId": "inv-501",
      "baseDate": "2026-06-25",
      "offsetDays": -3,
      "channel": "whatsapp"
    },
    {
      "id": "rem-302",
      "label": "Bharat Engineering Works — ₹2,40,000 (due 2026-06-30)",
      "source": "invoice",
      "refId": "inv-502",
      "baseDate": "2026-06-30",
      "offsetDays": -2,
      "channel": "email"
    },
    {
      "id": "rem-303",
      "label": "File GSTR-3B for May",
      "source": "manual",
      "refId": "",
      "baseDate": "2026-06-20",
      "offsetDays": 0,
      "channel": "in-app"
    },
    {
      "id": "rem-304",
      "label": "GST payment Q1 — ₹1,20,000 (due 2026-07-20)",
      "source": "obligation",
      "refId": "obl-701",
      "baseDate": "2026-07-20",
      "offsetDays": -5,
      "channel": "whatsapp"
    },
    {
      "id": "rem-305",
      "label": "Krishna Traders — ₹65,000 (due 2026-07-05)",
      "source": "invoice",
      "refId": "inv-503",
      "baseDate": "2026-07-05",
      "offsetDays": -1,
      "channel": "whatsapp"
    },
    {
      "id": "rem-306",
      "label": "TDS deposit June",
      "source": "manual",
      "refId": "",
      "baseDate": "2026-07-07",
      "offsetDays": -2,
      "channel": "email"
    }
  ],
  "auto-approval-chains": [
    {
      "id": "chain-401",
      "name": "High-value payouts",
      "threshold": 100000,
      "steps": [
        {
          "id": "step-1",
          "approver": "Finance Lead",
          "mode": "any"
        },
        {
          "id": "step-2",
          "approver": "Director",
          "mode": "all"
        }
      ]
    },
    {
      "id": "chain-402",
      "name": "Vendor onboarding spend",
      "threshold": 50000,
      "steps": [
        {
          "id": "step-3",
          "approver": "Procurement Head",
          "mode": "any"
        }
      ]
    },
    {
      "id": "chain-403",
      "name": "Capex above 5 lakh",
      "threshold": 500000,
      "steps": [
        {
          "id": "step-4",
          "approver": "CFO",
          "mode": "any"
        },
        {
          "id": "step-5",
          "approver": "Board",
          "mode": "all"
        }
      ]
    },
    {
      "id": "chain-404",
      "name": "Petty cash batch",
      "threshold": 10000,
      "steps": [
        {
          "id": "step-6",
          "approver": "Office Admin",
          "mode": "any"
        }
      ]
    }
  ],
  "auto-tasks": [
    {
      "id": "task-501",
      "title": "Month-end close",
      "cadence": "monthly",
      "anchorDate": "2026-06-30",
      "owner": "Finance Team"
    },
    {
      "id": "task-502",
      "title": "GSTR-3B filing",
      "cadence": "monthly",
      "anchorDate": "2026-07-20",
      "owner": "CA — Verma & Associates"
    },
    {
      "id": "task-503",
      "title": "Salary run",
      "cadence": "monthly",
      "anchorDate": "2026-07-01",
      "owner": "HR / Payroll"
    },
    {
      "id": "task-504",
      "title": "Advance tax estimate",
      "cadence": "quarterly",
      "anchorDate": "2026-09-15",
      "owner": "CA — Verma & Associates"
    },
    {
      "id": "task-505",
      "title": "Bank reconciliation",
      "cadence": "weekly",
      "anchorDate": "2026-06-22",
      "owner": "Priya Sharma"
    },
    {
      "id": "task-506",
      "title": "Daily cash position review",
      "cadence": "daily",
      "anchorDate": "2026-06-21",
      "owner": "Owner"
    }
  ],
  "auto-webhooks": [
    {
      "id": "hook-601",
      "name": "Slack #finance alerts",
      "url": "https://hooks.slack.com/services/T01ABCD/B02EFGH/xY9zQwErTyUiOp",
      "event": "Invoice overdue",
      "active": true
    },
    {
      "id": "hook-602",
      "name": "Zapier payout sync",
      "url": "https://hooks.zapier.com/hooks/catch/8123456/abc123/",
      "event": "Large payout",
      "active": true
    },
    {
      "id": "hook-603",
      "name": "Tally bridge",
      "url": "https://bridge.acmemfg.in/webhooks/tally",
      "event": "New invoice created",
      "active": false
    },
    {
      "id": "hook-604",
      "name": "Ops dashboard",
      "url": "https://ops.acmemfg.in/api/events",
      "event": "Low balance",
      "active": true
    },
    {
      "id": "hook-605",
      "name": "CRM lead push",
      "url": "https://crm.acmemfg.in/hooks/payment-received",
      "event": "Payment received",
      "active": true
    }
  ],
  "auto-notifications": [
    {
      "id": "notif-701",
      "event": "Invoice overdue",
      "channel": "whatsapp",
      "recipient": "Priya Sharma (Finance)",
      "quietHours": true
    },
    {
      "id": "notif-702",
      "event": "Large payout",
      "channel": "email",
      "recipient": "Owner",
      "quietHours": false
    },
    {
      "id": "notif-703",
      "event": "Low balance",
      "channel": "whatsapp",
      "recipient": "Owner",
      "quietHours": false
    },
    {
      "id": "notif-704",
      "event": "GST due date",
      "channel": "email",
      "recipient": "CA — Verma & Associates",
      "quietHours": true
    },
    {
      "id": "notif-705",
      "event": "New vendor onboarded",
      "channel": "in-app",
      "recipient": "Procurement Head",
      "quietHours": false
    },
    {
      "id": "notif-706",
      "event": "Approval pending",
      "channel": "whatsapp",
      "recipient": "Finance Lead",
      "quietHours": false
    }
  ],
  "auto-numbering": [
    {
      "id": "num-801",
      "prefix": "INV-2026-",
      "pad": 4,
      "start": 1248,
      "resetYearly": true
    },
    {
      "id": "num-802",
      "prefix": "PO-",
      "pad": 5,
      "start": 320,
      "resetYearly": false
    },
    {
      "id": "num-803",
      "prefix": "CN-",
      "pad": 3,
      "start": 12,
      "resetYearly": true
    },
    {
      "id": "num-804",
      "prefix": "DN-",
      "pad": 3,
      "start": 8,
      "resetYearly": true
    },
    {
      "id": "num-805",
      "prefix": "QT-2026-",
      "pad": 4,
      "start": 540,
      "resetYearly": true
    }
  ],
  "auto-categorize": [
    {
      "id": "cat-901",
      "keyword": "salary",
      "category": "payroll"
    },
    {
      "id": "cat-902",
      "keyword": "gst",
      "category": "tax"
    },
    {
      "id": "cat-903",
      "keyword": "rent",
      "category": "expense"
    },
    {
      "id": "cat-904",
      "keyword": "emi",
      "category": "loan"
    },
    {
      "id": "cat-905",
      "keyword": "invoice",
      "category": "revenue"
    },
    {
      "id": "cat-906",
      "keyword": "neft",
      "category": "transfer"
    }
  ],
  "auto-escalation": [
    {
      "id": "esc-1001",
      "afterDays": 7,
      "assignee": "Collections — Priya Sharma"
    },
    {
      "id": "esc-1002",
      "afterDays": 15,
      "assignee": "Finance Lead — Rohan Gupta"
    },
    {
      "id": "esc-1003",
      "afterDays": 30,
      "assignee": "Director — Anita Rao"
    },
    {
      "id": "esc-1004",
      "afterDays": 45,
      "assignee": "Legal / Recovery"
    }
  ],
  "auto-sla": [
    {
      "id": "sla-1101",
      "stage": "Invoice approval",
      "hours": 24,
      "thenWhat": "escalate"
    },
    {
      "id": "sla-1102",
      "stage": "Payment release",
      "hours": 48,
      "thenWhat": "remind"
    },
    {
      "id": "sla-1103",
      "stage": "Vendor query response",
      "hours": 12,
      "thenWhat": "reassign"
    },
    {
      "id": "sla-1104",
      "stage": "Credit note approval",
      "hours": 36,
      "thenWhat": "escalate"
    },
    {
      "id": "sla-1105",
      "stage": "Refund processing",
      "hours": 72,
      "thenWhat": "remind"
    }
  ],
  "auto-journals": [
    {
      "id": "jrn-1201",
      "name": "Monthly office rent",
      "debit": "Rent Expense",
      "credit": "Bank — HDFC Current",
      "amount": 85000,
      "cadence": "monthly",
      "anchorDate": "2026-07-01"
    },
    {
      "id": "jrn-1202",
      "name": "Depreciation — plant",
      "debit": "Depreciation Expense",
      "credit": "Accumulated Depreciation",
      "amount": 42000,
      "cadence": "monthly",
      "anchorDate": "2026-06-30"
    },
    {
      "id": "jrn-1203",
      "name": "Quarterly audit fee accrual",
      "debit": "Professional Fees",
      "credit": "Accrued Liabilities",
      "amount": 60000,
      "cadence": "quarterly",
      "anchorDate": "2026-09-30"
    },
    {
      "id": "jrn-1204",
      "name": "Prepaid insurance amortisation",
      "debit": "Insurance Expense",
      "credit": "Prepaid Insurance",
      "amount": 15000,
      "cadence": "monthly",
      "anchorDate": "2026-07-05"
    },
    {
      "id": "jrn-1205",
      "name": "Loan interest accrual",
      "debit": "Interest Expense",
      "credit": "Interest Payable",
      "amount": 28500,
      "cadence": "monthly",
      "anchorDate": "2026-07-01"
    }
  ],
  "auto-routing": [
    {
      "id": "rt-1301",
      "keyword": "freight",
      "folder": "Logistics",
      "ledger": "Freight & Carriage"
    },
    {
      "id": "rt-1302",
      "keyword": "electricity",
      "folder": "Utilities",
      "ledger": "Power & Fuel"
    },
    {
      "id": "rt-1303",
      "keyword": "raw material",
      "folder": "Purchases",
      "ledger": "Raw Material Purchases"
    },
    {
      "id": "rt-1304",
      "keyword": "consultancy",
      "folder": "Professional",
      "ledger": "Legal & Professional"
    },
    {
      "id": "rt-1305",
      "keyword": "courier",
      "folder": "Admin",
      "ledger": "Postage & Courier"
    }
  ],
  "auto-validation": [
    "missing-invoice-number",
    "future-dated-invoice",
    "uncategorized-large-txn",
    "duplicate-invoice-amount"
  ],
  "auto-reports": [
    {
      "id": "rep-1401",
      "report": "Cash flow summary",
      "cadence": "weekly",
      "channel": "email",
      "recipient": "owner@acmemfg.in",
      "anchorDate": "2026-06-22"
    },
    {
      "id": "rep-1402",
      "report": "Receivables ageing",
      "cadence": "weekly",
      "channel": "whatsapp",
      "recipient": "+91 98450 12345",
      "anchorDate": "2026-06-23"
    },
    {
      "id": "rep-1403",
      "report": "P&L statement",
      "cadence": "monthly",
      "channel": "email",
      "recipient": "ca.verma@gmail.com",
      "anchorDate": "2026-07-01"
    },
    {
      "id": "rep-1404",
      "report": "GST liability",
      "cadence": "monthly",
      "channel": "email",
      "recipient": "owner@acmemfg.in",
      "anchorDate": "2026-07-10"
    },
    {
      "id": "rep-1405",
      "report": "Daily bank position",
      "cadence": "daily",
      "channel": "whatsapp",
      "recipient": "+91 99020 67890",
      "anchorDate": "2026-06-21"
    }
  ],
  "auto-discounts": [
    {
      "id": "disc-1501",
      "minAmount": 50000,
      "percent": 2,
      "label": "Bulk order — 2% off above ₹50k"
    },
    {
      "id": "disc-1502",
      "minAmount": 100000,
      "percent": 5,
      "label": "Wholesale tier — 5% above ₹1L"
    },
    {
      "id": "disc-1503",
      "minAmount": 250000,
      "percent": 7.5,
      "label": "Distributor slab"
    },
    {
      "id": "disc-1504",
      "minAmount": 25000,
      "percent": 1,
      "label": "Early-bird festive"
    },
    {
      "id": "disc-1505",
      "minAmount": 500000,
      "percent": 10,
      "label": "Annual contract volume"
    }
  ],
  "auto-cadences": [
    {
      "id": "cad-1601",
      "name": "Standard B2B chase",
      "steps": [
        {
          "id": "cs-1",
          "offsetDays": -3,
          "channel": "whatsapp",
          "note": "Friendly reminder, invoice due soon"
        },
        {
          "id": "cs-2",
          "offsetDays": 1,
          "channel": "email",
          "note": "Invoice now overdue"
        },
        {
          "id": "cs-3",
          "offsetDays": 7,
          "channel": "call",
          "note": "Phone follow-up with accounts payable"
        }
      ]
    },
    {
      "id": "cad-1602",
      "name": "Gentle SME nudge",
      "steps": [
        {
          "id": "cs-4",
          "offsetDays": 0,
          "channel": "whatsapp",
          "note": "Due today reminder"
        },
        {
          "id": "cs-5",
          "offsetDays": 5,
          "channel": "whatsapp",
          "note": "Second nudge"
        }
      ]
    },
    {
      "id": "cad-1603",
      "name": "Aggressive recovery",
      "steps": [
        {
          "id": "cs-6",
          "offsetDays": 1,
          "channel": "email",
          "note": "Overdue notice"
        },
        {
          "id": "cs-7",
          "offsetDays": 3,
          "channel": "call",
          "note": "Escalation call"
        },
        {
          "id": "cs-8",
          "offsetDays": 10,
          "channel": "email",
          "note": "Final notice before recovery"
        }
      ]
    },
    {
      "id": "cad-1604",
      "name": "Key account white-glove",
      "steps": [
        {
          "id": "cs-9",
          "offsetDays": -5,
          "channel": "call",
          "note": "Courtesy heads-up to relationship manager"
        },
        {
          "id": "cs-10",
          "offsetDays": 2,
          "channel": "email",
          "note": "Statement attached"
        }
      ]
    }
  ],
  "auto-segments": [
    {
      "id": "seg-1701",
      "name": "Big spenders",
      "subject": "transaction",
      "logic": "all",
      "conds": [
        {
          "id": "sc-1",
          "field": "amount",
          "op": ">",
          "value": "100000"
        },
        {
          "id": "sc-2",
          "field": "category",
          "op": "==",
          "value": "expense"
        }
      ]
    },
    {
      "id": "seg-1702",
      "name": "Overdue large invoices",
      "subject": "invoice",
      "logic": "all",
      "conds": [
        {
          "id": "sc-3",
          "field": "amount",
          "op": ">",
          "value": "150000"
        },
        {
          "id": "sc-4",
          "field": "status",
          "op": "==",
          "value": "overdue"
        }
      ]
    },
    {
      "id": "seg-1703",
      "name": "Sunrise group accounts",
      "subject": "invoice",
      "logic": "any",
      "conds": [
        {
          "id": "sc-5",
          "field": "customer",
          "op": "contains",
          "value": "sunrise"
        }
      ]
    },
    {
      "id": "seg-1704",
      "name": "Payroll outflows",
      "subject": "transaction",
      "logic": "all",
      "conds": [
        {
          "id": "sc-6",
          "field": "category",
          "op": "==",
          "value": "payroll"
        }
      ]
    }
  ],
  "auto-kpiwatch": [
    {
      "id": "kpi-1801",
      "metric": "cash-balance",
      "op": "<",
      "threshold": 500000,
      "notify": "Owner"
    },
    {
      "id": "kpi-1802",
      "metric": "overdue-ar",
      "op": ">",
      "threshold": 300000,
      "notify": "Finance Lead"
    },
    {
      "id": "kpi-1803",
      "metric": "open-ar",
      "op": ">",
      "threshold": 1000000,
      "notify": "Priya Sharma"
    },
    {
      "id": "kpi-1804",
      "metric": "obligations-due-30",
      "op": ">",
      "threshold": 250000,
      "notify": "CA — Verma & Associates"
    },
    {
      "id": "kpi-1805",
      "metric": "month-outflow",
      "op": ">",
      "threshold": 800000,
      "notify": "Director"
    }
  ],
  "auto-tier-policy": [
    {
      "id": "tier-1901",
      "tier": "platinum",
      "minOutstanding": 500000,
      "firstOffset": -7,
      "channel": "call"
    },
    {
      "id": "tier-1902",
      "tier": "gold",
      "minOutstanding": 200000,
      "firstOffset": -3,
      "channel": "whatsapp"
    },
    {
      "id": "tier-1903",
      "tier": "standard",
      "minOutstanding": 50000,
      "firstOffset": -1,
      "channel": "email"
    }
  ],
  "auto-status-rules": [
    {
      "id": "st-2001",
      "whenDaysOverdue": 1,
      "setStatus": "overdue",
      "onlyFrom": "pending"
    },
    {
      "id": "st-2002",
      "whenDaysOverdue": 7,
      "setStatus": "overdue",
      "onlyFrom": "pending"
    },
    {
      "id": "st-2003",
      "whenDaysOverdue": 15,
      "setStatus": "overdue",
      "onlyFrom": "pending"
    },
    {
      "id": "st-2004",
      "whenDaysOverdue": 30,
      "setStatus": "overdue",
      "onlyFrom": "pending"
    }
  ],
  "auto-credit-limit": [
    {
      "id": "cl-2101",
      "scope": "all",
      "customer": "",
      "limit": 500000,
      "thenWhat": "flag"
    },
    {
      "id": "cl-2102",
      "scope": "customer",
      "customer": "Sunrise Textiles Pvt Ltd",
      "limit": 800000,
      "thenWhat": "block"
    },
    {
      "id": "cl-2103",
      "scope": "customer",
      "customer": "Bharat Engineering Works",
      "limit": 300000,
      "thenWhat": "flag"
    },
    {
      "id": "cl-2104",
      "scope": "customer",
      "customer": "Krishna Traders",
      "limit": 150000,
      "thenWhat": "block"
    }
  ],
  "auto-paymatch": [
    {
      "id": "pm-2201",
      "tolerancePct": 2,
      "windowDays": 5
    },
    {
      "id": "pm-2202",
      "tolerancePct": 5,
      "windowDays": 10
    },
    {
      "id": "pm-2203",
      "tolerancePct": 1,
      "windowDays": 3
    },
    {
      "id": "pm-2204",
      "tolerancePct": 10,
      "windowDays": 15
    }
  ],
  "auto-lowbalance": [
    {
      "id": "lb-2301",
      "scope": "total",
      "floor": 500000
    },
    {
      "id": "lb-2302",
      "scope": "HDFC Current A/C",
      "floor": 200000
    },
    {
      "id": "lb-2303",
      "scope": "ICICI Current A/C",
      "floor": 100000
    },
    {
      "id": "lb-2304",
      "scope": "Kotak OD A/C",
      "floor": 50000
    }
  ],
  "auto-recurringinv": [
    {
      "id": "ri-2401",
      "customer": "Sunrise Textiles Pvt Ltd",
      "amount": 185000,
      "cadence": "monthly",
      "nextDate": "2026-07-01"
    },
    {
      "id": "ri-2402",
      "customer": "Bharat Engineering Works",
      "amount": 240000,
      "cadence": "quarterly",
      "nextDate": "2026-09-01"
    },
    {
      "id": "ri-2403",
      "customer": "Krishna Traders",
      "amount": 65000,
      "cadence": "monthly",
      "nextDate": "2026-07-05"
    },
    {
      "id": "ri-2404",
      "customer": "Deccan Logistics Pvt Ltd",
      "amount": 42000,
      "cadence": "weekly",
      "nextDate": "2026-06-28"
    },
    {
      "id": "ri-2405",
      "customer": "Meridian Retail LLP",
      "amount": 320000,
      "cadence": "monthly",
      "nextDate": "2026-07-10"
    }
  ],
  "auto-dupcheck": 7,
  "auto-reorder": [
    {
      "id": "ro-2501",
      "sku": "RM-COTTON-40S",
      "reorderLevel": 500,
      "reorderQty": 2000
    },
    {
      "id": "ro-2502",
      "sku": "FG-TSHIRT-M",
      "reorderLevel": 200,
      "reorderQty": 1000
    },
    {
      "id": "ro-2503",
      "sku": "PKG-CARTON-L",
      "reorderLevel": 150,
      "reorderQty": 800
    },
    {
      "id": "ro-2504",
      "sku": "RM-DYE-INDIGO",
      "reorderLevel": 50,
      "reorderQty": 300
    },
    {
      "id": "ro-2505",
      "sku": "SPARE-MOTOR-3HP",
      "reorderLevel": 5,
      "reorderQty": 20
    }
  ],
  "auto-expensepolicy": [
    {
      "id": "ep-2601",
      "category": "expense",
      "cap": 50000,
      "verdict": "flag"
    },
    {
      "id": "ep-2602",
      "category": "payroll",
      "cap": 500000,
      "verdict": "flag"
    },
    {
      "id": "ep-2603",
      "category": "tax",
      "cap": 200000,
      "verdict": "reject"
    },
    {
      "id": "ep-2604",
      "category": "loan",
      "cap": 300000,
      "verdict": "flag"
    },
    {
      "id": "ep-2605",
      "category": "transfer",
      "cap": 1000000,
      "verdict": "reject"
    }
  ],
  "auto-fraudscan": {
    "round": true,
    "dupvendor": true,
    "weekend": false
  },
  "auto-cashsweep": [
    {
      "id": "cs-2701",
      "fromId": "ICICI Current A/C",
      "toId": "HDFC Liquid Fund",
      "buffer": 200000
    },
    {
      "id": "cs-2702",
      "fromId": "Kotak OD A/C",
      "toId": "HDFC Current A/C",
      "buffer": 50000
    },
    {
      "id": "cs-2703",
      "fromId": "Axis Collection A/C",
      "toId": "ICICI Current A/C",
      "buffer": 100000
    },
    {
      "id": "cs-2704",
      "fromId": "HDFC Current A/C",
      "toId": "SBI Term Deposit",
      "buffer": 500000
    }
  ],
  "auto-triggerfilters": [
    {
      "id": "tf-2801",
      "name": "High-value vendor outflows",
      "contains": "vendor",
      "minAmount": 100000,
      "maxAmount": 5000000,
      "category": "expense"
    },
    {
      "id": "tf-2802",
      "name": "Payroll band",
      "contains": "salary",
      "minAmount": 20000,
      "maxAmount": 200000,
      "category": "payroll"
    },
    {
      "id": "tf-2803",
      "name": "Tax payments",
      "contains": "gst",
      "minAmount": 10000,
      "maxAmount": 1000000,
      "category": "tax"
    },
    {
      "id": "tf-2804",
      "name": "Any large transfer",
      "contains": "",
      "minAmount": 250000,
      "maxAmount": 10000000,
      "category": "any"
    },
    {
      "id": "tf-2805",
      "name": "Small revenue receipts",
      "contains": "invoice",
      "minAmount": 1000,
      "maxAmount": 50000,
      "category": "revenue"
    }
  ],
  "settings-permission-matrix": {
    "finance:view_cash": true,
    "finance:edit_txn": true,
    "finance:approve_pay": false,
    "finance:manage_invoices": true,
    "finance:view_reports": true,
    "finance:manage_team": false,
    "ca:view_cash": true,
    "ca:edit_txn": false,
    "ca:approve_pay": false,
    "ca:manage_invoices": false,
    "ca:view_reports": true,
    "ca:manage_team": false,
    "sales:view_cash": false,
    "sales:edit_txn": false,
    "sales:approve_pay": false,
    "sales:manage_invoices": true,
    "sales:view_reports": false,
    "sales:manage_team": false,
    "ops:view_cash": true,
    "ops:edit_txn": true,
    "ops:approve_pay": false,
    "ops:manage_invoices": false,
    "ops:view_reports": false,
    "ops:manage_team": false
  },
  "settings-approval-rules": [
    {
      "id": "ar-3001",
      "threshold": 50000,
      "approver": "finance",
      "note": "Routine vendor payouts"
    },
    {
      "id": "ar-3002",
      "threshold": 200000,
      "approver": "ca",
      "note": "Tax & statutory payments"
    },
    {
      "id": "ar-3003",
      "threshold": 500000,
      "approver": "finance",
      "note": "Capex and large purchases"
    },
    {
      "id": "ar-3004",
      "threshold": 1000000,
      "approver": "ops",
      "note": "Inter-company transfers"
    }
  ],
  "settings-books-lock": {
    "fyStartMonth": 3,
    "lockDate": "2026-03-31"
  },
  "settings-audit-log": [
    {
      "id": "aud-3101",
      "type": "login",
      "label": "Signed in as priya.sharma@acmemfg.in",
      "at": "2026-06-20T08:45:00.000Z",
      "meta": "Chrome on Windows · Bengaluru"
    },
    {
      "id": "aud-3102",
      "type": "permission",
      "label": "Updated Sales role permissions",
      "at": "2026-06-18T14:20:00.000Z",
      "meta": "By owner@acmemfg.in"
    },
    {
      "id": "aud-3103",
      "type": "lock",
      "label": "Locked books through 31 Mar 2026",
      "at": "2026-04-02T10:05:00.000Z",
      "meta": "FY 2025-26 close"
    },
    {
      "id": "aud-3104",
      "type": "policy",
      "label": "Added approval rule: over ₹5,00,000 → Finance",
      "at": "2026-05-12T16:30:00.000Z",
      "meta": "By owner@acmemfg.in"
    },
    {
      "id": "aud-3105",
      "type": "login",
      "label": "Signed in as ca.verma@gmail.com",
      "at": "2026-06-19T11:15:00.000Z",
      "meta": "Safari on macOS · advisor access"
    },
    {
      "id": "aud-3106",
      "type": "permission",
      "label": "Revoked access for ex-employee",
      "at": "2026-06-10T09:00:00.000Z",
      "meta": "rahul.k@acmemfg.in deactivated"
    }
  ],
  "set-invoice-defaults": {
    "prefix": "INV-2026-",
    "nextNumber": 1249,
    "termsDays": 30,
    "footerNote": "Thank you for your business. Please pay within terms to avoid late fees. Subject to Bengaluru jurisdiction."
  },
  "set-currency-locale": {
    "grouping": "indian",
    "decimals": 2,
    "symbolBefore": true
  },
  "set-document-branding": {
    "logoUrl": "https://acmemfg.in/assets/logo.png",
    "signatory": "Anita Rao, Director",
    "footer": "Acme Manufacturing Pvt Ltd · GSTIN 29ABCDE1234F1Z5 · Plot 14, Peenya Industrial Area, Bengaluru 560058 · accounts@acmemfg.in"
  },
  "set-reminder-cadence": {
    "enabled": true,
    "beforeDue": 3,
    "onDue": true,
    "afterDue": 7,
    "channel": "whatsapp"
  },
  "set-number-rounding": {
    "mode": "nearest",
    "nearest": 1,
    "displayUnit": "full"
  },
  "set-theme-density": {
    "theme": "dark",
    "density": "comfortable",
    "reduceMotion": false
  },
  "set-einvoice-defaults": {
    "eInvoiceEnabled": true,
    "ewayEnabled": true,
    "ewayThreshold": 50000,
    "defaultTransportMode": "road",
    "autoGenerateOnSave": true
  },
  "set-bank-accounts": [
    {
      "id": "bank-3201",
      "label": "Primary Current A/C",
      "bankName": "HDFC Bank",
      "accountLast4": "5678",
      "ifsc": "HDFC0001234"
    },
    {
      "id": "bank-3202",
      "label": "Collections A/C",
      "bankName": "ICICI Bank",
      "accountLast4": "9012",
      "ifsc": "ICIC0004567"
    },
    {
      "id": "bank-3203",
      "label": "Overdraft A/C",
      "bankName": "Kotak Mahindra Bank",
      "accountLast4": "3344",
      "ifsc": "KKBK0000890"
    },
    {
      "id": "bank-3204",
      "label": "Payroll A/C",
      "bankName": "Axis Bank",
      "accountLast4": "7788",
      "ifsc": "UTIB0002233"
    }
  ],
  "set-bank-primary": "bank-3201",
  "set-sender-identity": {
    "fromName": "Acme Manufacturing Pvt Ltd",
    "replyTo": "accounts@acmemfg.in",
    "smsSenderId": "ACMEMF",
    "ccSelf": true
  },
  "set-data-retention": {
    "keepYears": 8,
    "archiveAttachments": true,
    "warnBeforePurge": true
  },
  "set-workspace-defaults": {
    "landingView": "overview",
    "defaultRange": "90d",
    "exportFormat": "xlsx"
  },
  "set-late-fee-policy": {
    "enabled": true,
    "mode": "percent_month",
    "rate": 1.5,
    "flatAmount": 500,
    "graceDays": 7
  },
  "set-tax-code-defaults": {
    "defaultHsn": "61091000",
    "itemType": "goods",
    "tdsEnabled": true,
    "tdsSection": "194C",
    "tdsRate": 2
  },
  "set-locations": [
    {
      "id": "loc-3301",
      "name": "Head Office & Factory",
      "city": "Bengaluru",
      "gstin": "29ABCDE1234F1Z5"
    },
    {
      "id": "loc-3302",
      "name": "Mumbai Warehouse",
      "city": "Mumbai",
      "gstin": "27ABCDE1234F1Z3"
    },
    {
      "id": "loc-3303",
      "name": "Delhi Sales Office",
      "city": "New Delhi",
      "gstin": "07ABCDE1234F1Z9"
    },
    {
      "id": "loc-3304",
      "name": "Chennai Depot",
      "city": "Chennai",
      "gstin": "33ABCDE1234F1Z1"
    }
  ],
  "set-locations-primary": "loc-3301",
  "set-statement-template": {
    "frequency": "monthly",
    "showOpeningBalance": true,
    "showAgeing": true,
    "introLine": "Here is your account statement for the period. Please reconcile and contact us with any discrepancies.",
    "signOff": "Regards, Acme Manufacturing Pvt Ltd"
  },
  "ownerOnboardingDismissed": true,
  "priv-aa-consents": [
    {
      "id": "aa-1",
      "fip": "HDFC Bank",
      "aa": "Finvu",
      "purpose": "Cash-flow lending underwriting",
      "scope": "Bank statements (last 12 months)",
      "status": "active",
      "grantedOn": "2026-02-10",
      "expiresOn": "2026-08-08"
    },
    {
      "id": "aa-2",
      "fip": "ICICI Bank",
      "aa": "OneMoney",
      "purpose": "Working-capital limit review",
      "scope": "Current account txns (6 months)",
      "status": "active",
      "grantedOn": "2026-05-22",
      "expiresOn": "2026-07-05"
    },
    {
      "id": "aa-3",
      "fip": "State Bank of India",
      "aa": "Anumati",
      "purpose": "GST-linked invoice financing",
      "scope": "Bank statements (last 12 months)",
      "status": "active",
      "grantedOn": "2025-12-01",
      "expiresOn": "2026-06-30"
    },
    {
      "id": "aa-4",
      "fip": "Axis Bank",
      "aa": "CAMS Finserv",
      "purpose": "Term-loan eligibility check",
      "scope": "Savings + current (24 months)",
      "status": "revoked",
      "grantedOn": "2025-09-15",
      "expiresOn": "2026-09-15"
    },
    {
      "id": "aa-5",
      "fip": "Kotak Mahindra Bank",
      "aa": "Finvu",
      "purpose": "Overdraft renewal underwriting",
      "scope": "Current account txns (12 months)",
      "status": "expired",
      "grantedOn": "2025-03-20",
      "expiresOn": "2026-03-20"
    },
    {
      "id": "aa-6",
      "fip": "Yes Bank",
      "aa": "OneMoney",
      "purpose": "Vendor-payment financing",
      "scope": "Bank statements (last 6 months)",
      "status": "pending",
      "grantedOn": "2026-06-18",
      "expiresOn": "2026-12-15"
    }
  ],
  "priv-dpdp-log": [
    {
      "id": "dp-1",
      "subject": "Rohan Mehta",
      "purpose": "Order fulfilment & invoicing",
      "collectedOn": "2026-01-12",
      "channel": "Website signup form",
      "granted": true,
      "withdrawnOn": null
    },
    {
      "id": "dp-2",
      "subject": "Priya Nair",
      "purpose": "KYC & GST compliance",
      "collectedOn": "2026-02-03",
      "channel": "Invoice / KYC",
      "granted": true,
      "withdrawnOn": null
    },
    {
      "id": "dp-3",
      "subject": "Arjun Reddy",
      "purpose": "Marketing newsletter",
      "collectedOn": "2025-11-19",
      "channel": "WhatsApp / chat",
      "granted": false,
      "withdrawnOn": "2026-04-08"
    },
    {
      "id": "dp-4",
      "subject": "Sneha Iyer",
      "purpose": "Customer support & warranty",
      "collectedOn": "2026-03-27",
      "channel": "Phone call",
      "granted": true,
      "withdrawnOn": null
    },
    {
      "id": "dp-5",
      "subject": "Vikram Singh",
      "purpose": "Loyalty programme enrolment",
      "collectedOn": "2026-05-05",
      "channel": "In-store / paper",
      "granted": true,
      "withdrawnOn": null
    },
    {
      "id": "dp-6",
      "subject": "Ananya Ghosh",
      "purpose": "Promotional SMS campaign",
      "collectedOn": "2025-10-30",
      "channel": "Import / third party",
      "granted": false,
      "withdrawnOn": "2026-02-14"
    },
    {
      "id": "dp-7",
      "subject": "Karthik Subramaniam",
      "purpose": "Order fulfilment & invoicing",
      "collectedOn": "2026-06-01",
      "channel": "Website signup form",
      "granted": true,
      "withdrawnOn": null
    }
  ],
  "priv-dsr": [
    {
      "id": "dsr-1",
      "subject": "Rohan Mehta",
      "type": "access",
      "raisedOn": "2026-06-12",
      "status": "in_progress",
      "note": "Wants full order history copy"
    },
    {
      "id": "dsr-2",
      "subject": "Ananya Ghosh",
      "type": "erasure",
      "raisedOn": "2026-06-05",
      "status": "open",
      "note": "Delete after marketing opt-out"
    },
    {
      "id": "dsr-3",
      "subject": "Sneha Iyer",
      "type": "correction",
      "raisedOn": "2026-05-18",
      "status": "fulfilled",
      "note": "Updated billing address"
    },
    {
      "id": "dsr-4",
      "subject": "Vikram Singh",
      "type": "portability",
      "raisedOn": "2026-06-19",
      "status": "open",
      "note": "Export to JSON for new vendor"
    },
    {
      "id": "dsr-5",
      "subject": "Arjun Reddy",
      "type": "erasure",
      "raisedOn": "2026-04-22",
      "status": "rejected",
      "note": "Statutory retention applies (GST)"
    },
    {
      "id": "dsr-6",
      "subject": "Priya Nair",
      "type": "access",
      "raisedOn": "2026-03-10",
      "status": "fulfilled",
      "note": "KYC record copy provided"
    }
  ],
  "priv-shares": [
    {
      "id": "sh-1",
      "recipient": "Razorpay",
      "dataShared": "Name, phone, email, payment token",
      "purpose": "Payment processing",
      "dpaSigned": true,
      "sharedOn": "2025-08-14"
    },
    {
      "id": "sh-2",
      "recipient": "Zoho Books",
      "dataShared": "Invoice data, GSTIN, contact",
      "purpose": "Accounting & GST filing",
      "dpaSigned": true,
      "sharedOn": "2025-09-01"
    },
    {
      "id": "sh-3",
      "recipient": "Mailchimp",
      "dataShared": "Email, name",
      "purpose": "Newsletter / marketing",
      "dpaSigned": false,
      "sharedOn": "2026-01-20"
    },
    {
      "id": "sh-4",
      "recipient": "Delhivery",
      "dataShared": "Name, address, phone",
      "purpose": "Logistics & delivery",
      "dpaSigned": true,
      "sharedOn": "2025-11-05"
    },
    {
      "id": "sh-5",
      "recipient": "Sharma & Associates (CA)",
      "dataShared": "Books of account, PAN, GSTIN",
      "purpose": "Statutory audit & compliance",
      "dpaSigned": false,
      "sharedOn": "2026-02-28"
    },
    {
      "id": "sh-6",
      "recipient": "Freshdesk",
      "dataShared": "Name, email, support tickets",
      "purpose": "Customer support",
      "dpaSigned": true,
      "sharedOn": "2026-03-15"
    }
  ],
  "priv-breaches": [
    {
      "id": "br-1",
      "detectedOn": "2026-05-29",
      "description": "Misconfigured backup bucket briefly exposed customer email list",
      "records": 1840,
      "severity": "high",
      "dpbNotified": false,
      "subjectsNotified": false
    },
    {
      "id": "br-2",
      "detectedOn": "2026-04-11",
      "description": "Phishing email captured one staff login; reset within an hour",
      "records": 230,
      "severity": "medium",
      "dpbNotified": true,
      "subjectsNotified": false
    },
    {
      "id": "br-3",
      "detectedOn": "2026-02-17",
      "description": "Lost unencrypted USB drive with sample invoices",
      "records": 45,
      "severity": "low",
      "dpbNotified": false,
      "subjectsNotified": false
    },
    {
      "id": "br-4",
      "detectedOn": "2025-12-08",
      "description": "Vendor portal bug let users view others' order IDs",
      "records": 510,
      "severity": "medium",
      "dpbNotified": true,
      "subjectsNotified": true
    },
    {
      "id": "br-5",
      "detectedOn": "2026-06-15",
      "description": "Ransomware attempt on finance workstation, contained by EDR",
      "records": 0,
      "severity": "high",
      "dpbNotified": false,
      "subjectsNotified": false
    }
  ],
  "priv-hygiene": {
    "h1": true,
    "h2": true,
    "h3": true,
    "h4": false,
    "h5": true,
    "h6": true,
    "h7": false,
    "h8": true,
    "h9": false,
    "h10": true
  },
  "priv-perms": [
    {
      "id": "pm-1",
      "party": "Razorpay",
      "bank": true,
      "gst": false,
      "pan": true,
      "invoices": true,
      "payroll": false
    },
    {
      "id": "pm-2",
      "party": "Sharma & Associates (CA)",
      "bank": true,
      "gst": true,
      "pan": true,
      "invoices": true,
      "payroll": true
    },
    {
      "id": "pm-3",
      "party": "Zoho Books",
      "bank": false,
      "gst": true,
      "pan": false,
      "invoices": true,
      "payroll": false
    },
    {
      "id": "pm-4",
      "party": "Lendingkart (lender)",
      "bank": true,
      "gst": true,
      "pan": true,
      "invoices": false,
      "payroll": false
    },
    {
      "id": "pm-5",
      "party": "RazorpayX Payroll",
      "bank": true,
      "gst": false,
      "pan": true,
      "invoices": false,
      "payroll": true
    },
    {
      "id": "pm-6",
      "party": "Mailchimp",
      "bank": false,
      "gst": false,
      "pan": false,
      "invoices": false,
      "payroll": false
    }
  ],
  "priv-retention": [
    {
      "id": "r1",
      "category": "Books of account & invoices",
      "years": 8,
      "basis": "Income-tax Act / Companies Act"
    },
    {
      "id": "r2",
      "category": "GST records & returns",
      "years": 6,
      "basis": "CGST Act s.36"
    },
    {
      "id": "r3",
      "category": "Marketing contact lists",
      "years": 2,
      "basis": "Consent — DPDP minimisation"
    },
    {
      "id": "r4",
      "category": "Website analytics / logs",
      "years": 1,
      "basis": "Operational need"
    },
    {
      "id": "r5",
      "category": "Employee payroll & PF records",
      "years": 8,
      "basis": "EPF Act / Income-tax Act"
    },
    {
      "id": "r6",
      "category": "KYC documents (PAN/Aadhaar)",
      "years": 5,
      "basis": "PMLA / RBI KYC norms"
    }
  ],
  "priv-inventory": [
    {
      "id": "d1",
      "element": "Customer name & contact",
      "sensitivity": "medium",
      "location": "App database (Mumbai, India)",
      "purpose": "Order & support"
    },
    {
      "id": "d2",
      "element": "Bank transactions (AA)",
      "sensitivity": "high",
      "location": "Encrypted store (India)",
      "purpose": "Cash-flow & lending"
    },
    {
      "id": "d3",
      "element": "PAN / GSTIN",
      "sensitivity": "high",
      "location": "KYC vault (India)",
      "purpose": "Tax & compliance"
    },
    {
      "id": "d4",
      "element": "Employee payroll & salary",
      "sensitivity": "high",
      "location": "RazorpayX Payroll",
      "purpose": "Payroll processing"
    },
    {
      "id": "d5",
      "element": "Marketing email list",
      "sensitivity": "low",
      "location": "Mailchimp (US)",
      "purpose": "Newsletters"
    },
    {
      "id": "d6",
      "element": "Delivery addresses",
      "sensitivity": "medium",
      "location": "Delhivery API",
      "purpose": "Logistics"
    }
  ],
  "priv-policy-firm": {
    "name": "Acme Manufacturing Pvt Ltd",
    "email": "hello@acmemfg.in",
    "officer": "Priya Nair",
    "officerEmail": "privacy@acmemfg.in",
    "purposes": "order fulfilment, invoicing, GST compliance, customer support and cash-flow underwriting",
    "thirdParties": "Razorpay, Zoho Books, our CA, Delhivery and email providers",
    "retention": "as long as the purpose requires or a statute (Income-tax, GST, Companies Act) mandates"
  },
  "priv-cookie-cfg": {
    "necessary": true,
    "analytics": true,
    "marketing": false,
    "preferences": true,
    "bannerText": "We use cookies to run this site and, with your consent, to understand usage and personalise content. You can accept, reject or choose categories.",
    "rejectAll": true,
    "granular": true
  },
  "priv-dpa-checklist": {
    "dp1": true,
    "dp2": true,
    "dp3": true,
    "dp4": true,
    "dp5": true,
    "dp6": false,
    "dp7": true,
    "dp8": true,
    "dp9": false,
    "dp10": false,
    "dp11": true
  },
  "priv-grievance-officer": {
    "name": "Priya Nair",
    "email": "privacy@acmemfg.in",
    "phone": "+91 98450 12345"
  },
  "priv-grievances": [
    {
      "id": "gr-1",
      "complainant": "Arjun Reddy",
      "subject": "Still receiving SMS after opt-out",
      "raisedOn": "2026-06-10",
      "status": "in_progress",
      "resolution": ""
    },
    {
      "id": "gr-2",
      "complainant": "Sneha Iyer",
      "subject": "Incorrect name on invoice",
      "raisedOn": "2026-05-20",
      "status": "resolved",
      "resolution": "Reissued invoice with corrected name"
    },
    {
      "id": "gr-3",
      "complainant": "Rohan Mehta",
      "subject": "Delay in data access request",
      "raisedOn": "2026-04-30",
      "status": "open",
      "resolution": ""
    },
    {
      "id": "gr-4",
      "complainant": "Ananya Ghosh",
      "subject": "Wants full account deletion",
      "raisedOn": "2026-06-02",
      "status": "open",
      "resolution": ""
    },
    {
      "id": "gr-5",
      "complainant": "Vikram Singh",
      "subject": "Unclear privacy notice wording",
      "raisedOn": "2026-03-12",
      "status": "resolved",
      "resolution": "Clarified notice; pointed to updated policy"
    }
  ],
  "priv-classification": [
    {
      "id": "c1",
      "element": "Marketing brochure content",
      "tier": "public",
      "handling": "No restriction; may be shared freely"
    },
    {
      "id": "c2",
      "element": "Internal pricing sheet",
      "tier": "internal",
      "handling": "Staff only; access on need-to-know"
    },
    {
      "id": "c3",
      "element": "Customer contact list",
      "tier": "confidential",
      "handling": "Encrypted at rest; restricted access + DPA before sharing"
    },
    {
      "id": "c4",
      "element": "PAN / Aadhaar / bank statements",
      "tier": "sensitive",
      "handling": "Encrypted; India-resident store; strict logging (PAN/Aadhaar/bank/health)"
    },
    {
      "id": "c5",
      "element": "Supplier bank details",
      "tier": "confidential",
      "handling": "Encrypted at rest; restricted access + DPA before sharing"
    },
    {
      "id": "c6",
      "element": "Employee payroll records",
      "tier": "sensitive",
      "handling": "Encrypted; India-resident store; strict logging (PAN/Aadhaar/bank/health)"
    }
  ],
  "priv-training": [
    {
      "id": "tr-1",
      "employee": "Priya Nair",
      "role": "Finance",
      "trainedOn": "2026-01-15",
      "validMonths": 12
    },
    {
      "id": "tr-2",
      "employee": "Rohit Deshpande",
      "role": "Sales",
      "trainedOn": "2025-09-08",
      "validMonths": 12
    },
    {
      "id": "tr-3",
      "employee": "Meena Krishnan",
      "role": "Ops",
      "trainedOn": "2026-04-02",
      "validMonths": 12
    },
    {
      "id": "tr-4",
      "employee": "Sandeep Rao",
      "role": "Finance",
      "trainedOn": "2025-06-20",
      "validMonths": 6
    },
    {
      "id": "tr-5",
      "employee": "Fatima Sheikh",
      "role": "Customer support",
      "trainedOn": "2026-05-25",
      "validMonths": 12
    },
    {
      "id": "tr-6",
      "employee": "Anil Kapoor",
      "role": "Warehouse",
      "trainedOn": "2026-02-11",
      "validMonths": 24
    }
  ],
  "priv-penalty-gaps": {
    "p1": true,
    "p2": true,
    "p3": false,
    "p4": false,
    "p5": true
  },
  "priv-localization": {
    "l1": true,
    "l2": true,
    "l3": true,
    "l4": true,
    "l5": false,
    "l6": true,
    "l7": false,
    "l8": true
  },
  "priv-marketing-consent": [
    {
      "id": "mk-1",
      "contact": "rohan.mehta@gmail.com",
      "channel": "Email",
      "optedIn": true,
      "updatedOn": "2026-01-12"
    },
    {
      "id": "mk-2",
      "contact": "+91 99876 54321",
      "channel": "WhatsApp",
      "optedIn": true,
      "updatedOn": "2026-05-05"
    },
    {
      "id": "mk-3",
      "contact": "arjun.reddy@outlook.com",
      "channel": "Email",
      "optedIn": false,
      "updatedOn": "2026-04-08"
    },
    {
      "id": "mk-4",
      "contact": "+91 98200 11223",
      "channel": "SMS",
      "optedIn": false,
      "updatedOn": "2026-02-14"
    },
    {
      "id": "mk-5",
      "contact": "sneha.iyer@yahoo.in",
      "channel": "Email",
      "optedIn": true,
      "updatedOn": "2026-03-27"
    },
    {
      "id": "mk-6",
      "contact": "+91 90040 56789",
      "channel": "Push",
      "optedIn": true,
      "updatedOn": "2026-06-01"
    }
  ],
  "priv-ropa": [
    {
      "id": "ro-1",
      "activity": "Customer billing & invoicing",
      "categories": "Name, GSTIN, address, bank details",
      "subjects": "Customers",
      "lawfulBasis": "Contract",
      "recipients": "Zoho Books, Razorpay",
      "retention": "8 years"
    },
    {
      "id": "ro-2",
      "activity": "Marketing campaigns",
      "categories": "Name, email, phone",
      "subjects": "Customers, prospects",
      "lawfulBasis": "Consent",
      "recipients": "Mailchimp",
      "retention": "2 years"
    },
    {
      "id": "ro-3",
      "activity": "Payroll processing",
      "categories": "Name, PAN, bank account, salary",
      "subjects": "Employees",
      "lawfulBasis": "Legal obligation",
      "recipients": "RazorpayX Payroll",
      "retention": "8 years"
    },
    {
      "id": "ro-4",
      "activity": "GST return filing",
      "categories": "GSTIN, invoice data, tax amounts",
      "subjects": "Customers, vendors",
      "lawfulBasis": "Legal obligation",
      "recipients": "Sharma & Associates (CA)",
      "retention": "6 years"
    },
    {
      "id": "ro-5",
      "activity": "Cash-flow underwriting",
      "categories": "Bank statements, transactions",
      "subjects": "The firm",
      "lawfulBasis": "Legitimate use (s.7 DPDP)",
      "recipients": "Lendingkart, Finvu",
      "retention": "Per retention policy"
    }
  ],
  "priv-dataflow": [
    {
      "id": "fl-1",
      "source": "Billing app",
      "target": "Razorpay",
      "kind": "processor",
      "data": "Name, phone, card token",
      "encrypted": true
    },
    {
      "id": "fl-2",
      "source": "App database",
      "target": "Zoho Books",
      "kind": "processor",
      "data": "Invoice data, GSTIN",
      "encrypted": true
    },
    {
      "id": "fl-3",
      "source": "CRM",
      "target": "Mailchimp",
      "kind": "external",
      "data": "Email, name",
      "encrypted": true
    },
    {
      "id": "fl-4",
      "source": "Order system",
      "target": "Delhivery",
      "kind": "external",
      "data": "Name, address, phone",
      "encrypted": false
    },
    {
      "id": "fl-5",
      "source": "App database",
      "target": "Analytics warehouse",
      "kind": "internal",
      "data": "Anonymised usage events",
      "encrypted": true
    },
    {
      "id": "fl-6",
      "source": "Payroll module",
      "target": "RazorpayX Payroll",
      "kind": "processor",
      "data": "PAN, bank account, salary",
      "encrypted": true
    }
  ],
  "priv-dpia": [
    {
      "id": "dpia-1",
      "project": "AA-powered credit scoring",
      "score": 10,
      "max": 16,
      "level": "High risk — full DPIA required",
      "on": "2026-05-12"
    },
    {
      "id": "dpia-2",
      "project": "WhatsApp marketing automation",
      "score": 5,
      "max": 16,
      "level": "Medium risk — document mitigations",
      "on": "2026-04-03"
    },
    {
      "id": "dpia-3",
      "project": "Anonymous usage analytics",
      "score": 2,
      "max": 16,
      "level": "Low risk — proceed with care",
      "on": "2026-03-18"
    },
    {
      "id": "dpia-4",
      "project": "Customer loyalty programme",
      "score": 6,
      "max": 16,
      "level": "Medium risk — document mitigations",
      "on": "2026-02-22"
    }
  ],
  "priv-xborder": [
    {
      "id": "xb-1",
      "recipient": "AWS us-east-1",
      "country": "USA",
      "dataShared": "Encrypted backups, logs",
      "safeguard": "Standard contractual clauses",
      "loggedOn": "2026-01-09"
    },
    {
      "id": "xb-2",
      "recipient": "Mailchimp",
      "country": "USA",
      "dataShared": "Email, name",
      "safeguard": "Explicit consent",
      "loggedOn": "2026-01-20"
    },
    {
      "id": "xb-3",
      "recipient": "Google Analytics",
      "country": "USA",
      "dataShared": "Anonymised usage events",
      "safeguard": "None / under review",
      "loggedOn": "2026-03-05"
    },
    {
      "id": "xb-4",
      "recipient": "Acme Holdings (parent)",
      "country": "Singapore",
      "dataShared": "Consolidated financials",
      "safeguard": "Intra-group agreement",
      "loggedOn": "2025-12-14"
    },
    {
      "id": "xb-5",
      "recipient": "Freshdesk",
      "country": "Germany",
      "dataShared": "Support tickets, email",
      "safeguard": "Standard contractual clauses",
      "loggedOn": "2026-03-15"
    }
  ],
  "priv-vendor-risk": [
    {
      "id": "vr-1",
      "name": "Razorpay",
      "checks": {
        "v1": true,
        "v2": true,
        "v3": true,
        "v4": true,
        "v5": true,
        "v6": true
      }
    },
    {
      "id": "vr-2",
      "name": "Zoho Books",
      "checks": {
        "v1": true,
        "v2": true,
        "v3": true,
        "v4": true,
        "v5": true,
        "v6": false
      }
    },
    {
      "id": "vr-3",
      "name": "Mailchimp",
      "checks": {
        "v1": false,
        "v2": false,
        "v3": true,
        "v4": true,
        "v5": true,
        "v6": false
      }
    },
    {
      "id": "vr-4",
      "name": "Delhivery",
      "checks": {
        "v1": true,
        "v2": true,
        "v3": false,
        "v4": true,
        "v5": false,
        "v6": true
      }
    },
    {
      "id": "vr-5",
      "name": "Freshdesk",
      "checks": {
        "v1": true,
        "v2": false,
        "v3": true,
        "v4": true,
        "v5": true,
        "v6": false
      }
    }
  ],
  "priv-withdraw-tasks": [
    {
      "id": "wt-1",
      "entryId": "dp-3",
      "recipient": "Mailchimp",
      "done": true
    },
    {
      "id": "wt-2",
      "entryId": "dp-3",
      "recipient": "Razorpay",
      "done": false
    },
    {
      "id": "wt-3",
      "entryId": "dp-6",
      "recipient": "Mailchimp",
      "done": true
    },
    {
      "id": "wt-4",
      "entryId": "dp-6",
      "recipient": "Freshdesk",
      "done": false
    },
    {
      "id": "wt-5",
      "entryId": "dp-6",
      "recipient": "Delhivery",
      "done": false
    }
  ],
  "priv-purge": [
    {
      "id": "pg-1",
      "category": "Marketing contact lists",
      "lastDataDate": "2024-03-15",
      "years": 2,
      "purgedOn": null
    },
    {
      "id": "pg-2",
      "category": "Website analytics / logs",
      "lastDataDate": "2025-01-10",
      "years": 1,
      "purgedOn": null
    },
    {
      "id": "pg-3",
      "category": "GST records & returns",
      "lastDataDate": "2025-12-31",
      "years": 6,
      "purgedOn": null
    },
    {
      "id": "pg-4",
      "category": "Books of account & invoices",
      "lastDataDate": "2018-04-01",
      "years": 8,
      "purgedOn": "2026-05-02"
    },
    {
      "id": "pg-5",
      "category": "KYC documents (PAN/Aadhaar)",
      "lastDataDate": "2024-06-20",
      "years": 5,
      "purgedOn": null
    }
  ],
  "sec-vendor-banks": [
    {
      "id": "vb-1",
      "vendor": "Sundaram Steel Traders",
      "account": "XXXXXXXX4521",
      "ifsc": "HDFC0000123",
      "recordedAt": "2025-10-12T09:30:00.000Z"
    },
    {
      "id": "vb-2",
      "vendor": "Patel Packaging Co",
      "account": "XXXXXXXX8890",
      "ifsc": "ICIC0000456",
      "recordedAt": "2025-11-03T11:15:00.000Z",
      "lastChangedAt": "2026-06-09T14:20:00.000Z"
    },
    {
      "id": "vb-3",
      "vendor": "Bharat Logistics",
      "account": "XXXXXXXX2017",
      "ifsc": "SBIN0000789",
      "recordedAt": "2026-01-22T08:45:00.000Z"
    },
    {
      "id": "vb-4",
      "vendor": "Krishna Electricals",
      "account": "XXXXXXXX6634",
      "ifsc": "AXIS0000321",
      "recordedAt": "2025-12-15T16:00:00.000Z"
    },
    {
      "id": "vb-5",
      "vendor": "Deccan Chemicals Pvt Ltd",
      "account": "XXXXXXXX1199",
      "ifsc": "KKBK0000654",
      "recordedAt": "2026-02-28T10:10:00.000Z",
      "lastChangedAt": "2026-05-30T09:05:00.000Z"
    }
  ],
  "sec-monitoring-rules": [
    {
      "id": "mr-1",
      "name": "Large cash-out",
      "field": "amount",
      "operator": "gt",
      "value": "200000",
      "enabled": true
    },
    {
      "id": "mr-2",
      "name": "Cash keyword",
      "field": "description",
      "operator": "contains",
      "value": "cash",
      "enabled": true
    },
    {
      "id": "mr-3",
      "name": "Consultancy watch",
      "field": "counterparty",
      "operator": "contains",
      "value": "consult",
      "enabled": false
    },
    {
      "id": "mr-4",
      "name": "Micro-payment noise",
      "field": "amount",
      "operator": "lt",
      "value": "500",
      "enabled": true
    },
    {
      "id": "mr-5",
      "name": "Gift / entertainment",
      "field": "description",
      "operator": "contains",
      "value": "gift",
      "enabled": true
    }
  ],
  "sec-access-log": [
    {
      "id": "ac-1",
      "person": "Priya Nair (CA)",
      "role": "Finance manager",
      "scope": "Payments, Reports",
      "lastReviewed": "2026-05-10",
      "status": "active"
    },
    {
      "id": "ac-2",
      "person": "Rohit Deshpande",
      "role": "Sales lead",
      "scope": "Invoices, Customers",
      "lastReviewed": "2026-04-01",
      "status": "active"
    },
    {
      "id": "ac-3",
      "person": "Sandeep Rao",
      "role": "Accounts assistant",
      "scope": "Invoices",
      "lastReviewed": "2026-01-15",
      "status": "active"
    },
    {
      "id": "ac-4",
      "person": "Meena Krishnan",
      "role": "Operations",
      "scope": "Orders, Inventory",
      "lastReviewed": "2025-12-20",
      "status": "active"
    },
    {
      "id": "ac-5",
      "person": "Former intern (Aakash)",
      "role": "Data entry",
      "scope": "All modules",
      "lastReviewed": "2025-09-30",
      "status": "suspended"
    },
    {
      "id": "ac-6",
      "person": "Vikram Singh",
      "role": "Owner",
      "scope": "All modules",
      "lastReviewed": "2026-06-01",
      "status": "active"
    }
  ],
  "sec-hygiene": {
    "maker-checker": true,
    "vendor-verify": true,
    "access-review": false,
    "recon": true,
    "unique-pw": true,
    "device-lock": false,
    "backups": true,
    "least-priv": true,
    "incident-plan": false
  },
  "sec-approval-limit": 200000,
  "sec-expense-policy": {
    "perTxnCap": 50000,
    "flagWeekend": true,
    "keywords": "alcohol, bar, gift, cash, entertainment"
  },
  "sec-sod-map": [
    {
      "id": "sod-1",
      "payee": "Sundaram Steel Traders",
      "creator": "Sandeep Rao",
      "approver": "Priya Nair"
    },
    {
      "id": "sod-2",
      "payee": "Patel Packaging Co",
      "creator": "Sandeep Rao",
      "approver": "Vikram Singh"
    },
    {
      "id": "sod-3",
      "payee": "Bharat Logistics",
      "creator": "Meena Krishnan",
      "approver": "Meena Krishnan"
    },
    {
      "id": "sod-4",
      "payee": "Krishna Electricals",
      "creator": "Sandeep Rao",
      "approver": "Priya Nair"
    },
    {
      "id": "sod-5",
      "payee": "Deccan Chemicals Pvt Ltd",
      "creator": "Rohit Deshpande",
      "approver": "Vikram Singh"
    }
  ],
  "sec-vendor-gstins": [
    {
      "id": "vg-1",
      "vendor": "Sundaram Steel Traders",
      "gstin": "29AABCS1234E1Z5"
    },
    {
      "id": "vg-2",
      "vendor": "Patel Packaging Co",
      "gstin": "27AAPFU0939F1ZV"
    },
    {
      "id": "vg-3",
      "vendor": "Bharat Logistics",
      "gstin": "06AADCB2345K1Z9"
    },
    {
      "id": "vg-4",
      "vendor": "Ghost Supplies Inc",
      "gstin": "99XXABC1234Z"
    },
    {
      "id": "vg-5",
      "vendor": "Shell Trading Co",
      "gstin": "29AABCS1234E1Z5"
    },
    {
      "id": "vg-6",
      "vendor": "Krishna Electricals",
      "gstin": "29AAFCK5678L1ZB"
    }
  ],
  "sec-ip-allowlist": [
    {
      "id": "ip-1",
      "label": "Head office (Bengaluru)",
      "kind": "ip",
      "value": "203.0.113.0/24",
      "addedAt": "2025-10-01",
      "trusted": true
    },
    {
      "id": "ip-2",
      "label": "Priya's laptop",
      "kind": "device",
      "value": "MacBook-Pro-Finance",
      "addedAt": "2025-10-05",
      "trusted": true
    },
    {
      "id": "ip-3",
      "label": "Warehouse desktop",
      "kind": "device",
      "value": "WIN-OPS-04",
      "addedAt": "2026-01-12",
      "trusted": true
    },
    {
      "id": "ip-4",
      "label": "Owner home VPN",
      "kind": "ip",
      "value": "198.51.100.42",
      "addedAt": "2026-02-20",
      "trusted": true
    },
    {
      "id": "ip-5",
      "label": "Old branch router",
      "kind": "ip",
      "value": "192.0.2.10",
      "addedAt": "2025-08-15",
      "trusted": false
    }
  ],
  "sec-export-audit": [
    {
      "id": "ex-1",
      "at": "2026-06-15T10:30:00.000Z",
      "who": "Priya Nair",
      "what": "Transactions",
      "rows": 1240,
      "reason": "CA audit pack Q1 FY26",
      "containsPii": true
    },
    {
      "id": "ex-2",
      "at": "2026-06-02T14:05:00.000Z",
      "who": "Rohit Deshpande",
      "what": "Customers",
      "rows": 860,
      "reason": "Sales campaign segmentation",
      "containsPii": true
    },
    {
      "id": "ex-3",
      "at": "2026-05-20T09:15:00.000Z",
      "who": "Sandeep Rao",
      "what": "Invoices",
      "rows": 410,
      "reason": "GST reconciliation",
      "containsPii": false
    },
    {
      "id": "ex-4",
      "at": "2026-04-28T16:40:00.000Z",
      "who": "Vikram Singh",
      "what": "Full backup",
      "rows": 5200,
      "reason": "Quarterly offsite backup",
      "containsPii": true
    },
    {
      "id": "ex-5",
      "at": "2026-03-10T11:00:00.000Z",
      "who": "Meena Krishnan",
      "what": "Vendors",
      "rows": 95,
      "reason": "Vendor master cleanup",
      "containsPii": false
    }
  ],
  "sec-key-rotation": [
    {
      "id": "kr-1",
      "name": "Razorpay API key",
      "lastRotated": "2026-03-01",
      "intervalDays": 90
    },
    {
      "id": "kr-2",
      "name": "ICICI bank token",
      "lastRotated": "2025-12-15",
      "intervalDays": 90
    },
    {
      "id": "kr-3",
      "name": "Zoho Books OAuth secret",
      "lastRotated": "2026-05-20",
      "intervalDays": 180
    },
    {
      "id": "kr-4",
      "name": "Admin DB password",
      "lastRotated": "2025-09-10",
      "intervalDays": 120
    },
    {
      "id": "kr-5",
      "name": "Shared accounting login",
      "lastRotated": "2026-06-05",
      "intervalDays": 60
    }
  ],
  "sec-cash-threshold": 200000,
  "sec-action-log": [
    {
      "id": "al-1",
      "at": "2026-06-09T14:20:00.000Z",
      "actor": "Vikram Singh",
      "action": "Edited vendor bank details",
      "detail": "Patel Packaging Co — account updated"
    },
    {
      "id": "al-2",
      "at": "2026-06-01T09:00:00.000Z",
      "actor": "Vikram Singh",
      "action": "Changed approval limit",
      "detail": "raised to ₹2,00,000"
    },
    {
      "id": "al-3",
      "at": "2026-05-15T11:30:00.000Z",
      "actor": "Priya Nair",
      "action": "Exported data",
      "detail": "Transactions for CA audit"
    },
    {
      "id": "al-4",
      "at": "2026-05-02T08:10:00.000Z",
      "actor": "Vikram Singh",
      "action": "Revoked access",
      "detail": "Former intern Aakash"
    },
    {
      "id": "al-5",
      "at": "2026-04-18T15:45:00.000Z",
      "actor": "Priya Nair",
      "action": "Rotated key / password",
      "detail": "Razorpay API key"
    },
    {
      "id": "al-6",
      "at": "2026-03-22T10:05:00.000Z",
      "actor": "Vikram Singh",
      "action": "Granted access",
      "detail": "Meena Krishnan — Orders module"
    }
  ],
  "sec-staff-banks": [
    {
      "id": "sb-1",
      "name": "Priya Nair",
      "account": "XXXXXXXX3401"
    },
    {
      "id": "sb-2",
      "name": "Rohit Deshpande",
      "account": "XXXXXXXX7762"
    },
    {
      "id": "sb-3",
      "name": "Sandeep Rao",
      "account": "XXXXXXXX1058"
    },
    {
      "id": "sb-4",
      "name": "Meena Krishnan",
      "account": "XXXXXXXX9923"
    },
    {
      "id": "sb-5",
      "name": "Fatima Sheikh",
      "account": "XXXXXXXX4487"
    }
  ],
  "sec-control-csa": {
    "dual": "yes",
    "bankverify": "yes",
    "recon": "partial",
    "access": "no",
    "segregation": "yes",
    "backups": "partial",
    "mfa": "yes",
    "petty": "no"
  },
  "glb-fx-rates": {
    "USD": 86.5,
    "EUR": 93.2,
    "GBP": 109.4,
    "AED": 23.55,
    "SGD": 64.1,
    "AUD": 56.8,
    "JPY": 0.575
  },
  "glb-firc-brc": [
    {
      "id": "firc-1",
      "ref": "EXP-2026-014",
      "ccy": "USD",
      "amount": 18500,
      "remitDate": "2026-05-12",
      "exportDate": "2026-03-02",
      "firc": true,
      "brcReceived": true
    },
    {
      "id": "firc-2",
      "ref": "EXP-2026-021",
      "ccy": "EUR",
      "amount": 9400,
      "remitDate": "2026-06-08",
      "exportDate": "2026-04-18",
      "firc": true,
      "brcReceived": false
    },
    {
      "id": "firc-3",
      "ref": "EXP-2026-027",
      "ccy": "USD",
      "amount": 26200,
      "remitDate": "",
      "exportDate": "2026-05-09",
      "firc": true,
      "brcReceived": false
    },
    {
      "id": "firc-4",
      "ref": "EXP-2025-198",
      "ccy": "GBP",
      "amount": 7300,
      "remitDate": "",
      "exportDate": "2025-09-15",
      "firc": false,
      "brcReceived": false
    },
    {
      "id": "firc-5",
      "ref": "EXP-2026-031",
      "ccy": "AED",
      "amount": 41000,
      "remitDate": "2026-06-15",
      "exportDate": "2026-05-28",
      "firc": true,
      "brcReceived": false
    },
    {
      "id": "firc-6",
      "ref": "EXP-2026-009",
      "ccy": "USD",
      "amount": 12750,
      "remitDate": "2026-04-22",
      "exportDate": "2026-02-11",
      "firc": true,
      "brcReceived": true
    }
  ],
  "glb-lc": [
    {
      "id": "lc-1",
      "lcNo": "LC-2026-0412",
      "bank": "HDFC Bank",
      "amount": 52000,
      "ccy": "USD",
      "expiry": "2026-08-15",
      "docs": {
        "Commercial Invoice": true,
        "Bill of Lading / AWB": true,
        "Packing List": true,
        "Certificate of Origin": false,
        "Insurance Certificate": false,
        "Inspection Certificate": false,
        "Bill of Exchange / Draft": false
      }
    },
    {
      "id": "lc-2",
      "lcNo": "LC-2026-0388",
      "bank": "ICICI Bank",
      "amount": 34500,
      "ccy": "EUR",
      "expiry": "2026-07-30",
      "docs": {
        "Commercial Invoice": true,
        "Bill of Lading / AWB": true,
        "Packing List": true,
        "Certificate of Origin": true,
        "Insurance Certificate": true,
        "Inspection Certificate": true,
        "Bill of Exchange / Draft": true
      }
    },
    {
      "id": "lc-3",
      "lcNo": "LC-2026-0501",
      "bank": "State Bank of India",
      "amount": 78000,
      "ccy": "USD",
      "expiry": "2026-09-22",
      "docs": {
        "Commercial Invoice": true,
        "Bill of Lading / AWB": false,
        "Packing List": false,
        "Certificate of Origin": false,
        "Insurance Certificate": false,
        "Inspection Certificate": false,
        "Bill of Exchange / Draft": false
      }
    },
    {
      "id": "lc-4",
      "lcNo": "LC-2026-0349",
      "bank": "Axis Bank",
      "amount": 21000,
      "ccy": "GBP",
      "expiry": "2026-07-10",
      "docs": {
        "Commercial Invoice": true,
        "Bill of Lading / AWB": true,
        "Packing List": true,
        "Certificate of Origin": true,
        "Insurance Certificate": false,
        "Inspection Certificate": false,
        "Bill of Exchange / Draft": true
      }
    }
  ],
  "glb-pay-rails": [
    {
      "id": "swift",
      "name": "Bank SWIFT wire (HDFC)",
      "flatFee": "1500",
      "markupPct": "2.5"
    },
    {
      "id": "fintech",
      "name": "Wise Business",
      "flatFee": "400",
      "markupPct": "0.5"
    },
    {
      "id": "rail-3",
      "name": "Payoneer",
      "flatFee": "650",
      "markupPct": "1.2"
    },
    {
      "id": "rail-4",
      "name": "Razorpay X (intl)",
      "flatFee": "900",
      "markupPct": "1.8"
    }
  ],
  "glb-fcy-balances": [
    {
      "id": "fcy-1",
      "bank": "HDFC EEFC USD",
      "ccy": "USD",
      "balance": 24500
    },
    {
      "id": "fcy-2",
      "bank": "ICICI EEFC EUR",
      "ccy": "EUR",
      "balance": 11200
    },
    {
      "id": "fcy-3",
      "bank": "Axis Nostro GBP",
      "ccy": "GBP",
      "balance": 6800
    },
    {
      "id": "fcy-4",
      "bank": "SBI AED account",
      "ccy": "AED",
      "balance": 38000
    },
    {
      "id": "fcy-5",
      "bank": "Wise multi-currency USD",
      "ccy": "USD",
      "balance": 9300
    }
  ],
  "glb-eefc": [
    {
      "id": "eefc-1",
      "ref": "EXP-2026-014",
      "ccy": "USD",
      "amount": 18500,
      "date": "2026-05-12",
      "converted": true
    },
    {
      "id": "eefc-2",
      "ref": "EXP-2026-021",
      "ccy": "EUR",
      "amount": 9400,
      "date": "2026-06-08",
      "converted": false
    },
    {
      "id": "eefc-3",
      "ref": "EXP-2026-031",
      "ccy": "AED",
      "amount": 41000,
      "date": "2026-06-15",
      "converted": false
    },
    {
      "id": "eefc-4",
      "ref": "EXP-2026-009",
      "ccy": "USD",
      "amount": 12750,
      "date": "2026-04-22",
      "converted": true
    },
    {
      "id": "eefc-5",
      "ref": "EXP-2026-027",
      "ccy": "USD",
      "amount": 26200,
      "date": "2026-06-10",
      "converted": false
    }
  ],
  "glb-export-oblig": [
    {
      "id": "eo-1",
      "scheme": "EPCG",
      "lic": "0530012345",
      "obligation": 480000,
      "fulfilled": 312000,
      "ccy": "USD",
      "expiry": "2028-03-31"
    },
    {
      "id": "eo-2",
      "scheme": "AA",
      "lic": "0310098765",
      "obligation": 150000,
      "fulfilled": 150000,
      "ccy": "USD",
      "expiry": "2026-09-30"
    },
    {
      "id": "eo-3",
      "scheme": "AA",
      "lic": "0310076543",
      "obligation": 95000,
      "fulfilled": 41000,
      "ccy": "EUR",
      "expiry": "2026-12-31"
    },
    {
      "id": "eo-4",
      "scheme": "EPCG",
      "lic": "0530054321",
      "obligation": 260000,
      "fulfilled": 58000,
      "ccy": "USD",
      "expiry": "2029-06-30"
    }
  ],
  "glb-customer-country": {
    "Western Foods LLC": "USA",
    "Bavaria Handels GmbH": "Germany",
    "Crown Imports Ltd": "United Kingdom",
    "Al Futtaim Trading": "UAE",
    "Pacific Rim Pte Ltd": "Singapore",
    "Outback Distributors": "Australia"
  },
  "glb-iec-adcode": [
    {
      "id": "reg-1",
      "type": "IEC",
      "code": "ABCDE1234F",
      "issuer": "DGFT",
      "renewal": "2027-04-30"
    },
    {
      "id": "reg-2",
      "type": "AD Code",
      "code": "0410123450000123",
      "issuer": "HDFC Bank",
      "renewal": "2026-12-31"
    },
    {
      "id": "reg-3",
      "type": "Port reg.",
      "code": "INBLR4-AIR",
      "issuer": "ICEGATE",
      "renewal": "2026-11-15"
    },
    {
      "id": "reg-4",
      "type": "RCMC",
      "code": "EEPC/2025/4456",
      "issuer": "EEPC India",
      "renewal": "2026-03-31"
    },
    {
      "id": "reg-5",
      "type": "LUT",
      "code": "AD2904250012345",
      "issuer": "GSTN",
      "renewal": "2027-03-31"
    }
  ],
  "glb-softex": [
    {
      "id": "sftx-1",
      "invoice": "SW-2026-101",
      "client": "Western Foods LLC",
      "ccy": "USD",
      "amount": 14000,
      "invoiceDate": "2026-05-02",
      "filed": true
    },
    {
      "id": "sftx-2",
      "invoice": "SW-2026-108",
      "client": "Pacific Rim Pte Ltd",
      "ccy": "SGD",
      "amount": 22000,
      "invoiceDate": "2026-05-20",
      "filed": false
    },
    {
      "id": "sftx-3",
      "invoice": "SW-2026-115",
      "client": "Crown Imports Ltd",
      "ccy": "GBP",
      "amount": 9800,
      "invoiceDate": "2026-06-04",
      "filed": false
    },
    {
      "id": "sftx-4",
      "invoice": "SW-2026-097",
      "client": "Bavaria Handels GmbH",
      "ccy": "EUR",
      "amount": 17500,
      "invoiceDate": "2026-04-15",
      "filed": true
    }
  ],
  "glb-lut-no": "AD290425001234X",
  "glb-lut-fy": "2026-27",
  "glb-fema-cal": [
    {
      "id": "fema-1",
      "form": "FLA Return",
      "about": "Annual Foreign Liabilities & Assets return to RBI",
      "dueDate": "2026-07-15",
      "done": false
    },
    {
      "id": "fema-2",
      "form": "Softex (monthly)",
      "about": "File SOFTEX forms for May software exports",
      "dueDate": "2026-06-30",
      "done": false
    },
    {
      "id": "fema-3",
      "form": "APR",
      "about": "Annual Performance Report for overseas JV/WOS",
      "dueDate": "2026-12-31",
      "done": false
    },
    {
      "id": "fema-4",
      "form": "eBRC closure",
      "about": "Close eBRC against EXP-2025-198 before realisation deadline",
      "dueDate": "2026-06-15",
      "done": true
    },
    {
      "id": "fema-5",
      "form": "ECB-2 Return",
      "about": "Monthly ECB return for external borrowing",
      "dueDate": "2026-07-07",
      "done": false
    }
  ],
  "glb-odi-fdi": [
    {
      "id": "flow-1",
      "kind": "fdi",
      "entity": "Greenfield Ventures (Mauritius)",
      "ccy": "USD",
      "amount": 250000,
      "eventDate": "2026-02-10",
      "reported": true
    },
    {
      "id": "flow-2",
      "kind": "odi",
      "entity": "Acme Mfg USA Inc",
      "ccy": "USD",
      "amount": 120000,
      "eventDate": "2026-04-22",
      "reported": false
    },
    {
      "id": "flow-3",
      "kind": "odi",
      "entity": "Acme Trading FZE (Dubai)",
      "ccy": "AED",
      "amount": 300000,
      "eventDate": "2026-05-30",
      "reported": false
    },
    {
      "id": "flow-4",
      "kind": "fdi",
      "entity": "Lighthouse Capital LP",
      "ccy": "EUR",
      "amount": 180000,
      "eventDate": "2025-11-18",
      "reported": true
    }
  ],
  "glb-country-risk": [
    {
      "id": "risk-1",
      "country": "USA",
      "payment": 9,
      "political": 9,
      "fx": 8,
      "legal": 9
    },
    {
      "id": "risk-2",
      "country": "Germany",
      "payment": 9,
      "political": 9,
      "fx": 7,
      "legal": 9
    },
    {
      "id": "risk-3",
      "country": "UAE",
      "payment": 7,
      "political": 7,
      "fx": 8,
      "legal": 6
    },
    {
      "id": "risk-4",
      "country": "Nigeria",
      "payment": 3,
      "political": 4,
      "fx": 3,
      "legal": 4
    },
    {
      "id": "risk-5",
      "country": "Singapore",
      "payment": 9,
      "political": 8,
      "fx": 8,
      "legal": 9
    },
    {
      "id": "risk-6",
      "country": "Brazil",
      "payment": 5,
      "political": 5,
      "fx": 4,
      "legal": 5
    }
  ],
  "glb-mc-pnl": [
    {
      "id": "mc-1",
      "label": "Export sales — USA",
      "kind": "revenue",
      "ccy": "USD",
      "amount": "68000"
    },
    {
      "id": "mc-2",
      "label": "Export sales — EU",
      "kind": "revenue",
      "ccy": "EUR",
      "amount": "42000"
    },
    {
      "id": "mc-3",
      "label": "Domestic sales",
      "kind": "revenue",
      "ccy": "INR",
      "amount": "5400000"
    },
    {
      "id": "mc-4",
      "label": "Imported raw material",
      "kind": "cost",
      "ccy": "USD",
      "amount": "31000"
    },
    {
      "id": "mc-5",
      "label": "Freight & logistics",
      "kind": "cost",
      "ccy": "INR",
      "amount": "820000"
    },
    {
      "id": "mc-6",
      "label": "Overseas marketing",
      "kind": "cost",
      "ccy": "EUR",
      "amount": "9500"
    }
  ],
  "glb-wht-recovery": [
    {
      "id": "wht-1",
      "payer": "Western Foods LLC",
      "country": "USA",
      "ccy": "USD",
      "gross": 18500,
      "whtPct": 10,
      "fxRate": 86.5,
      "claimed": false
    },
    {
      "id": "wht-2",
      "payer": "Pacific Rim Pte Ltd",
      "country": "Singapore",
      "ccy": "SGD",
      "gross": 22000,
      "whtPct": 8,
      "fxRate": 64.1,
      "claimed": true
    },
    {
      "id": "wht-3",
      "payer": "Bavaria Handels GmbH",
      "country": "Germany",
      "ccy": "EUR",
      "gross": 14000,
      "whtPct": 10,
      "fxRate": 93.2,
      "claimed": false
    },
    {
      "id": "wht-4",
      "payer": "Crown Imports Ltd",
      "country": "United Kingdom",
      "ccy": "GBP",
      "gross": 9800,
      "whtPct": 15,
      "fxRate": 109.4,
      "claimed": false
    }
  ],
  "glb-edpms-aging": [
    {
      "id": "ship-1",
      "ref": "SB-2026-3401",
      "ccy": "USD",
      "amount": 18500,
      "exportDate": "2026-03-02",
      "realised": true
    },
    {
      "id": "ship-2",
      "ref": "SB-2026-3588",
      "ccy": "EUR",
      "amount": 9400,
      "exportDate": "2026-04-18",
      "realised": false
    },
    {
      "id": "ship-3",
      "ref": "SB-2026-3712",
      "ccy": "USD",
      "amount": 26200,
      "exportDate": "2026-05-09",
      "realised": false
    },
    {
      "id": "ship-4",
      "ref": "SB-2025-2890",
      "ccy": "GBP",
      "amount": 7300,
      "exportDate": "2025-09-15",
      "realised": false
    },
    {
      "id": "ship-5",
      "ref": "SB-2026-3120",
      "ccy": "USD",
      "amount": 12750,
      "exportDate": "2026-02-11",
      "realised": true
    },
    {
      "id": "ship-6",
      "ref": "SB-2026-3801",
      "ccy": "AED",
      "amount": 41000,
      "exportDate": "2026-05-28",
      "realised": false
    }
  ],
  "mkt-imported-settlements": [
    {
      "id": "imp-1",
      "channel": "Amazon",
      "settlementId": "AMZ-SETL-20260601",
      "gross": 482000,
      "fees": 98500,
      "net": 383500,
      "date": "2026-06-01"
    },
    {
      "id": "imp-2",
      "channel": "Amazon",
      "settlementId": "AMZ-SETL-20260615",
      "gross": 511000,
      "fees": 104200,
      "net": 406800,
      "date": "2026-06-15"
    },
    {
      "id": "imp-3",
      "channel": "Flipkart",
      "settlementId": "FK-SETL-20260605",
      "gross": 318000,
      "fees": 71500,
      "net": 246500,
      "date": "2026-06-05"
    },
    {
      "id": "imp-4",
      "channel": "Flipkart",
      "settlementId": "FK-SETL-20260612",
      "gross": 294000,
      "fees": 66200,
      "net": 227800,
      "date": "2026-06-12"
    },
    {
      "id": "imp-5",
      "channel": "Meesho",
      "settlementId": "MSH-SETL-20260608",
      "gross": 142000,
      "fees": 23800,
      "net": 118200,
      "date": "2026-06-08"
    },
    {
      "id": "imp-6",
      "channel": "ONDC",
      "settlementId": "ONDC-SETL-20260610",
      "gross": 86000,
      "fees": 9400,
      "net": 76600,
      "date": "2026-06-10"
    },
    {
      "id": "imp-7",
      "channel": "D2C / Shopify",
      "settlementId": "SHOP-PO-20260614",
      "gross": 215000,
      "fees": 12600,
      "net": 202400,
      "date": "2026-06-14"
    }
  ],
  "mkt-settlement-lines": [
    {
      "id": "sl-1",
      "orderId": "403-1234567-0011223",
      "orderValue": 1200,
      "fees": 180,
      "refunds": 0,
      "tcs": 12
    },
    {
      "id": "sl-2",
      "orderId": "403-7654321-0099887",
      "orderValue": 2499,
      "fees": 410,
      "refunds": 0,
      "tcs": 25
    },
    {
      "id": "sl-3",
      "orderId": "407-0001111-0044556",
      "orderValue": 899,
      "fees": 142,
      "refunds": 899,
      "tcs": 0
    },
    {
      "id": "sl-4",
      "orderId": "405-2233445-0066778",
      "orderValue": 3450,
      "fees": 560,
      "refunds": 0,
      "tcs": 35
    },
    {
      "id": "sl-5",
      "orderId": "408-9988776-0012345",
      "orderValue": 1799,
      "fees": 295,
      "refunds": 0,
      "tcs": 18
    },
    {
      "id": "sl-6",
      "orderId": "402-5566778-0098765",
      "orderValue": 599,
      "fees": 98,
      "refunds": 0,
      "tcs": 6
    }
  ],
  "mkt-rto-rows": [
    {
      "id": "rto-1",
      "sku": "TSHIRT-BLK-M",
      "channel": "Meesho",
      "kind": "rto",
      "orderValue": 499,
      "cogs": 210,
      "fwdFreight": 60,
      "revFreight": 60,
      "count": 14
    },
    {
      "id": "rto-2",
      "sku": "KURTA-RED-L",
      "channel": "Flipkart",
      "kind": "return",
      "orderValue": 1199,
      "cogs": 540,
      "fwdFreight": 70,
      "revFreight": 70,
      "count": 8
    },
    {
      "id": "rto-3",
      "sku": "SHOE-RUN-9",
      "channel": "Amazon",
      "kind": "rto",
      "orderValue": 2299,
      "cogs": 1100,
      "fwdFreight": 90,
      "revFreight": 90,
      "count": 5
    },
    {
      "id": "rto-4",
      "sku": "WATCH-STL-BLK",
      "channel": "Amazon",
      "kind": "return",
      "orderValue": 3499,
      "cogs": 1650,
      "fwdFreight": 80,
      "revFreight": 80,
      "count": 3
    },
    {
      "id": "rto-5",
      "sku": "BAG-TOTE-TAN",
      "channel": "Meesho",
      "kind": "rto",
      "orderValue": 799,
      "cogs": 360,
      "fwdFreight": 55,
      "revFreight": 55,
      "count": 11
    }
  ],
  "mkt-channel-sales": [
    {
      "id": "cs-1",
      "channel": "Amazon",
      "orders": 1240,
      "grossSales": 993000,
      "fees": 202700,
      "returns": 84500
    },
    {
      "id": "cs-2",
      "channel": "Flipkart",
      "orders": 860,
      "grossSales": 612000,
      "fees": 137700,
      "returns": 61200
    },
    {
      "id": "cs-3",
      "channel": "Meesho",
      "orders": 1520,
      "grossSales": 284000,
      "fees": 47600,
      "returns": 39800
    },
    {
      "id": "cs-4",
      "channel": "ONDC",
      "orders": 310,
      "grossSales": 172000,
      "fees": 18800,
      "returns": 8600
    },
    {
      "id": "cs-5",
      "channel": "D2C / Shopify",
      "orders": 540,
      "grossSales": 430000,
      "fees": 25200,
      "returns": 12900
    }
  ],
  "mkt-payout-cfg": [
    {
      "id": "pc-1",
      "channel": "Amazon",
      "cycleDays": 14,
      "lastPayout": "2026-06-15",
      "pendingAmount": 406800
    },
    {
      "id": "pc-2",
      "channel": "Flipkart",
      "cycleDays": 10,
      "lastPayout": "2026-06-12",
      "pendingAmount": 227800
    },
    {
      "id": "pc-3",
      "channel": "Meesho",
      "cycleDays": 15,
      "lastPayout": "2026-06-08",
      "pendingAmount": 118200
    },
    {
      "id": "pc-4",
      "channel": "ONDC",
      "cycleDays": 7,
      "lastPayout": "2026-06-16",
      "pendingAmount": 76600
    },
    {
      "id": "pc-5",
      "channel": "D2C / Shopify",
      "cycleDays": 3,
      "lastPayout": "2026-06-18",
      "pendingAmount": 202400
    }
  ],
  "mkt-tcs52": [
    {
      "id": "tcs-1",
      "operator": "Amazon",
      "netTaxableSales": 993000,
      "tcsCollected": 9930,
      "month": "2026-05",
      "reconciled": true
    },
    {
      "id": "tcs-2",
      "operator": "Flipkart",
      "netTaxableSales": 612000,
      "tcsCollected": 6120,
      "month": "2026-05",
      "reconciled": false
    },
    {
      "id": "tcs-3",
      "operator": "Meesho",
      "netTaxableSales": 284000,
      "tcsCollected": 2840,
      "month": "2026-05",
      "reconciled": false
    },
    {
      "id": "tcs-4",
      "operator": "Amazon",
      "netTaxableSales": 1042000,
      "tcsCollected": 10420,
      "month": "2026-04",
      "reconciled": true
    },
    {
      "id": "tcs-5",
      "operator": "ONDC",
      "netTaxableSales": 172000,
      "tcsCollected": 1720,
      "month": "2026-05",
      "reconciled": false
    }
  ],
  "mkt-sku-rows": [
    {
      "id": "sku-1",
      "sku": "TSHIRT-BLK-M",
      "channel": "Amazon",
      "price": 499,
      "cogs": 210,
      "feesPct": 22,
      "adPerUnit": 35,
      "shipping": 65,
      "returnPct": 12,
      "unitsSold": 820
    },
    {
      "id": "sku-2",
      "sku": "KURTA-RED-L",
      "channel": "Flipkart",
      "price": 1199,
      "cogs": 540,
      "feesPct": 20,
      "adPerUnit": 60,
      "shipping": 75,
      "returnPct": 9,
      "unitsSold": 410
    },
    {
      "id": "sku-3",
      "sku": "SHOE-RUN-9",
      "channel": "Amazon",
      "price": 2299,
      "cogs": 1100,
      "feesPct": 18,
      "adPerUnit": 120,
      "shipping": 90,
      "returnPct": 7,
      "unitsSold": 260
    },
    {
      "id": "sku-4",
      "sku": "WATCH-STL-BLK",
      "channel": "Amazon",
      "price": 3499,
      "cogs": 1650,
      "feesPct": 16,
      "adPerUnit": 180,
      "shipping": 80,
      "returnPct": 5,
      "unitsSold": 145
    },
    {
      "id": "sku-5",
      "sku": "BAG-TOTE-TAN",
      "channel": "Meesho",
      "price": 799,
      "cogs": 360,
      "feesPct": 14,
      "adPerUnit": 20,
      "shipping": 55,
      "returnPct": 15,
      "unitsSold": 690
    },
    {
      "id": "sku-6",
      "sku": "EARBUDS-TWS-X",
      "channel": "Flipkart",
      "price": 1499,
      "cogs": 950,
      "feesPct": 19,
      "adPerUnit": 110,
      "shipping": 70,
      "returnPct": 11,
      "unitsSold": 530
    }
  ],
  "mkt-ondc-checklist": [
    "Register GSTIN & PAN on the ONDC seller app",
    "Complete bank account & IFSC verification",
    "Upload product catalog with HSN & GST rates",
    "Set up serviceable pincodes & logistics partner"
  ],
  "mkt-inventory-sync": [
    {
      "id": "inv-1",
      "sku": "TSHIRT-BLK-M",
      "warehouse": 420,
      "amazon": 150,
      "flipkart": 120,
      "meesho": 90,
      "ondc": 40
    },
    {
      "id": "inv-2",
      "sku": "KURTA-RED-L",
      "warehouse": 210,
      "amazon": 80,
      "flipkart": 70,
      "meesho": 30,
      "ondc": 20
    },
    {
      "id": "inv-3",
      "sku": "SHOE-RUN-9",
      "warehouse": 95,
      "amazon": 40,
      "flipkart": 25,
      "meesho": 0,
      "ondc": 10
    },
    {
      "id": "inv-4",
      "sku": "WATCH-STL-BLK",
      "warehouse": 60,
      "amazon": 30,
      "flipkart": 15,
      "meesho": 0,
      "ondc": 5
    },
    {
      "id": "inv-5",
      "sku": "BAG-TOTE-TAN",
      "warehouse": 340,
      "amazon": 90,
      "flipkart": 60,
      "meesho": 110,
      "ondc": 30
    }
  ],
  "mkt-ppc-rows": [
    {
      "id": "ppc-1",
      "campaign": "Auto - Apparel SP",
      "weight": 30
    },
    {
      "id": "ppc-2",
      "campaign": "Manual - Branded Keywords",
      "weight": 25
    },
    {
      "id": "ppc-3",
      "campaign": "Footwear - SD Retargeting",
      "weight": 20
    },
    {
      "id": "ppc-4",
      "campaign": "Top of Search - Watches",
      "weight": 15
    },
    {
      "id": "ppc-5",
      "campaign": "Meesho Boost - Bags",
      "weight": 10
    }
  ],
  "mkt-review-rows": [
    {
      "id": "rev-1",
      "sku": "TSHIRT-BLK-M",
      "channel": "Amazon",
      "rating": 4.3,
      "reviews": 1240
    },
    {
      "id": "rev-2",
      "sku": "KURTA-RED-L",
      "channel": "Flipkart",
      "rating": 4.1,
      "reviews": 680
    },
    {
      "id": "rev-3",
      "sku": "SHOE-RUN-9",
      "channel": "Amazon",
      "rating": 3.8,
      "reviews": 410
    },
    {
      "id": "rev-4",
      "sku": "WATCH-STL-BLK",
      "channel": "Amazon",
      "rating": 4.6,
      "reviews": 295
    },
    {
      "id": "rev-5",
      "sku": "BAG-TOTE-TAN",
      "channel": "Meesho",
      "rating": 3.5,
      "reviews": 920
    },
    {
      "id": "rev-6",
      "sku": "EARBUDS-TWS-X",
      "channel": "Flipkart",
      "rating": 4,
      "reviews": 1510
    }
  ],
  "mkt-gstr8-rows": [
    {
      "id": "g8-1",
      "operator": "Amazon",
      "month": "2026-05",
      "tcsAsPerBooks": 9930,
      "tcsInGstr8": 9930
    },
    {
      "id": "g8-2",
      "operator": "Flipkart",
      "month": "2026-05",
      "tcsAsPerBooks": 6120,
      "tcsInGstr8": 5980
    },
    {
      "id": "g8-3",
      "operator": "Meesho",
      "month": "2026-05",
      "tcsAsPerBooks": 2840,
      "tcsInGstr8": 2840
    },
    {
      "id": "g8-4",
      "operator": "Amazon",
      "month": "2026-04",
      "tcsAsPerBooks": 10420,
      "tcsInGstr8": 10180
    },
    {
      "id": "g8-5",
      "operator": "ONDC",
      "month": "2026-05",
      "tcsAsPerBooks": 1720,
      "tcsInGstr8": 1720
    }
  ],
  "mkt-refund-rows": [
    {
      "id": "ref-1",
      "sku": "TSHIRT-BLK-M",
      "kind": "refund",
      "orderValue": 499,
      "refundAmt": 499,
      "replacementCogs": 0,
      "count": 22
    },
    {
      "id": "ref-2",
      "sku": "KURTA-RED-L",
      "kind": "replacement",
      "orderValue": 1199,
      "refundAmt": 0,
      "replacementCogs": 540,
      "count": 9
    },
    {
      "id": "ref-3",
      "sku": "SHOE-RUN-9",
      "kind": "returnless",
      "orderValue": 2299,
      "refundAmt": 2299,
      "replacementCogs": 0,
      "count": 4
    },
    {
      "id": "ref-4",
      "sku": "BAG-TOTE-TAN",
      "kind": "refund",
      "orderValue": 799,
      "refundAmt": 799,
      "replacementCogs": 0,
      "count": 17
    },
    {
      "id": "ref-5",
      "sku": "EARBUDS-TWS-X",
      "kind": "replacement",
      "orderValue": 1499,
      "refundAmt": 0,
      "replacementCogs": 950,
      "count": 12
    }
  ],
  "mkt-listing-quality": [
    "Title within 200 chars with primary keyword",
    "At least 5 high-resolution images (1000px+)",
    "All 5 bullet points filled with benefits",
    "A+ / Enhanced Brand Content added",
    "Backend search terms populated"
  ],
  "mkt-buybox-rows": [
    {
      "id": "bb-1",
      "sku": "TSHIRT-BLK-M",
      "channel": "Amazon",
      "impressions": 48200,
      "buyBoxWins": 41300,
      "yourPrice": 499,
      "lowestPrice": 489
    },
    {
      "id": "bb-2",
      "sku": "SHOE-RUN-9",
      "channel": "Amazon",
      "impressions": 22100,
      "buyBoxWins": 12400,
      "yourPrice": 2299,
      "lowestPrice": 2199
    },
    {
      "id": "bb-3",
      "sku": "WATCH-STL-BLK",
      "channel": "Amazon",
      "impressions": 15600,
      "buyBoxWins": 14900,
      "yourPrice": 3499,
      "lowestPrice": 3499
    },
    {
      "id": "bb-4",
      "sku": "EARBUDS-TWS-X",
      "channel": "Flipkart",
      "impressions": 31800,
      "buyBoxWins": 19200,
      "yourPrice": 1499,
      "lowestPrice": 1399
    },
    {
      "id": "bb-5",
      "sku": "KURTA-RED-L",
      "channel": "Flipkart",
      "impressions": 18400,
      "buyBoxWins": 16100,
      "yourPrice": 1199,
      "lowestPrice": 1149
    }
  ],
  "mkt-reserve-rows": [
    {
      "id": "res-1",
      "channel": "Amazon",
      "amount": 84500,
      "heldOn": "2026-06-10",
      "releaseDays": 7
    },
    {
      "id": "res-2",
      "channel": "Flipkart",
      "amount": 52000,
      "heldOn": "2026-06-12",
      "releaseDays": 10
    },
    {
      "id": "res-3",
      "channel": "Meesho",
      "amount": 21000,
      "heldOn": "2026-06-08",
      "releaseDays": 15
    },
    {
      "id": "res-4",
      "channel": "Amazon",
      "amount": 67800,
      "heldOn": "2026-06-15",
      "releaseDays": 7
    }
  ],
  "mkt-chargeback-rows": [
    {
      "id": "cb-1",
      "orderId": "403-1234567-0011223",
      "channel": "Amazon",
      "reason": "Item not received",
      "amount": 2499,
      "raisedOn": "2026-05-20",
      "status": "won"
    },
    {
      "id": "cb-2",
      "orderId": "405-2233445-0066778",
      "channel": "Amazon",
      "reason": "Unauthorized transaction",
      "amount": 3450,
      "raisedOn": "2026-06-02",
      "status": "open"
    },
    {
      "id": "cb-3",
      "orderId": "FK-OD-998877",
      "channel": "Flipkart",
      "reason": "Product not as described",
      "amount": 1199,
      "raisedOn": "2026-05-28",
      "status": "lost"
    },
    {
      "id": "cb-4",
      "orderId": "407-0001111-0044556",
      "channel": "Amazon",
      "reason": "Duplicate charge",
      "amount": 899,
      "raisedOn": "2026-06-10",
      "status": "open"
    },
    {
      "id": "cb-5",
      "orderId": "MSH-ORD-554433",
      "channel": "Meesho",
      "reason": "Quality issue",
      "amount": 799,
      "raisedOn": "2026-06-05",
      "status": "won"
    }
  ],
  "mkt-festival-name": "Big Billion Days",
  "mkt-festival-date": "2026-09-23",
  "mkt-festival-tasks": [
    {
      "id": "ft--21",
      "label": "Confirm stock cover for projected event volume",
      "dueOffset": -21,
      "done": true
    },
    {
      "id": "ft--14",
      "label": "Send FBA/warehouse inbound (account for inbound SLA)",
      "dueOffset": -14,
      "done": true
    },
    {
      "id": "ft--10",
      "label": "Set event prices with margin floor after deeper discounts",
      "dueOffset": -10,
      "done": false
    },
    {
      "id": "ft--7a",
      "label": "Lock ad budget & lightning-deal slots",
      "dueOffset": -7,
      "done": false
    },
    {
      "id": "ft--7b",
      "label": "Arrange working capital for the payout gap",
      "dueOffset": -7,
      "done": false
    },
    {
      "id": "ft--3",
      "label": "Brief logistics partner on RTO / pickup surge",
      "dueOffset": -3,
      "done": false
    },
    {
      "id": "ft-7",
      "label": "Reconcile event payouts & event fees after sale",
      "dueOffset": 7,
      "done": false
    }
  ],
  "mkt-holding-rows": [
    {
      "id": "hold-1",
      "channel": "Amazon",
      "monthlyGmv": 1500000,
      "payoutDays": 14
    },
    {
      "id": "hold-2",
      "channel": "Flipkart",
      "monthlyGmv": 920000,
      "payoutDays": 10
    },
    {
      "id": "hold-3",
      "channel": "Meesho",
      "monthlyGmv": 430000,
      "payoutDays": 15
    },
    {
      "id": "hold-4",
      "channel": "ONDC",
      "monthlyGmv": 260000,
      "payoutDays": 7
    }
  ],
  "mkt-promo-roi": [
    {
      "id": "promo-1",
      "name": "Summer Flat 10% Coupon",
      "spend": 42000,
      "baselineUnits": 600,
      "promoUnits": 920,
      "marginPerUnit": 140
    },
    {
      "id": "promo-2",
      "name": "Buy 2 Get 1 - Tees",
      "spend": 28000,
      "baselineUnits": 400,
      "promoUnits": 510,
      "marginPerUnit": 95
    },
    {
      "id": "promo-3",
      "name": "Lightning Deal - Watches",
      "spend": 65000,
      "baselineUnits": 120,
      "promoUnits": 340,
      "marginPerUnit": 420
    },
    {
      "id": "promo-4",
      "name": "Meesho Mega Blockbuster",
      "spend": 15000,
      "baselineUnits": 700,
      "promoUnits": 760,
      "marginPerUnit": 55
    }
  ],
  "mkt-conversion-rows": [
    {
      "id": "conv-1",
      "listing": "TSHIRT-BLK-M",
      "sessions": 18200,
      "orders": 1240
    },
    {
      "id": "conv-2",
      "listing": "KURTA-RED-L",
      "sessions": 9400,
      "orders": 410
    },
    {
      "id": "conv-3",
      "listing": "SHOE-RUN-9",
      "sessions": 12100,
      "orders": 260
    },
    {
      "id": "conv-4",
      "listing": "WATCH-STL-BLK",
      "sessions": 6800,
      "orders": 145
    },
    {
      "id": "conv-5",
      "listing": "EARBUDS-TWS-X",
      "sessions": 21500,
      "orders": 530
    }
  ],
  "mkt-return-rate-rows": [
    {
      "id": "ret-1",
      "sku": "TSHIRT-BLK-M",
      "delivered": 820,
      "returned": 98
    },
    {
      "id": "ret-2",
      "sku": "KURTA-RED-L",
      "delivered": 410,
      "returned": 37
    },
    {
      "id": "ret-3",
      "sku": "SHOE-RUN-9",
      "delivered": 260,
      "returned": 18
    },
    {
      "id": "ret-4",
      "sku": "WATCH-STL-BLK",
      "delivered": 145,
      "returned": 7
    },
    {
      "id": "ret-5",
      "sku": "BAG-TOTE-TAN",
      "delivered": 690,
      "returned": 104
    },
    {
      "id": "ret-6",
      "sku": "EARBUDS-TWS-X",
      "delivered": 530,
      "returned": 58
    }
  ],
  "mkt-fee-recon-rows": [
    {
      "id": "fr-1",
      "order": "403-1234567-0011223",
      "expected": 180,
      "charged": 180
    },
    {
      "id": "fr-2",
      "order": "403-7654321-0099887",
      "expected": 410,
      "charged": 455
    },
    {
      "id": "fr-3",
      "order": "407-0001111-0044556",
      "expected": 142,
      "charged": 142
    },
    {
      "id": "fr-4",
      "order": "405-2233445-0066778",
      "expected": 560,
      "charged": 612
    },
    {
      "id": "fr-5",
      "order": "408-9988776-0012345",
      "expected": 295,
      "charged": 280
    },
    {
      "id": "fr-6",
      "order": "402-5566778-0098765",
      "expected": 98,
      "charged": 98
    }
  ],
  "mkt-cod-remit-rows": [
    {
      "id": "cod-1",
      "partner": "Delhivery",
      "orders": 480,
      "collected": 384000,
      "remitted": 360000,
      "expectedOn": "2026-06-22"
    },
    {
      "id": "cod-2",
      "partner": "Blue Dart",
      "orders": 210,
      "collected": 252000,
      "remitted": 252000,
      "expectedOn": "2026-06-18"
    },
    {
      "id": "cod-3",
      "partner": "Ecom Express",
      "orders": 350,
      "collected": 245000,
      "remitted": 210000,
      "expectedOn": "2026-06-24"
    },
    {
      "id": "cod-4",
      "partner": "Shadowfax",
      "orders": 160,
      "collected": 96000,
      "remitted": 88000,
      "expectedOn": "2026-06-25"
    }
  ],
  "mkt-gateway-rows": [
    {
      "id": "gw-1",
      "gateway": "Razorpay",
      "method": "UPI",
      "gross": 320000,
      "feePct": 0,
      "fixedFee": 0,
      "gstOnFee": true
    },
    {
      "id": "gw-2",
      "gateway": "Razorpay",
      "method": "Credit Card",
      "gross": 180000,
      "feePct": 2,
      "fixedFee": 0,
      "gstOnFee": true
    },
    {
      "id": "gw-3",
      "gateway": "PayU",
      "method": "Net Banking",
      "gross": 95000,
      "feePct": 1.8,
      "fixedFee": 3,
      "gstOnFee": true
    },
    {
      "id": "gw-4",
      "gateway": "Cashfree",
      "method": "Wallet",
      "gross": 42000,
      "feePct": 1.5,
      "fixedFee": 0,
      "gstOnFee": true
    },
    {
      "id": "gw-5",
      "gateway": "Stripe",
      "method": "Intl Card",
      "gross": 68000,
      "feePct": 3.5,
      "fixedFee": 5,
      "gstOnFee": true
    }
  ],
  "mkt-neg-balance-rows": [
    {
      "id": "neg-1",
      "channel": "Amazon",
      "reason": "Reimbursement reversal",
      "amount": 18500,
      "recovered": 12000,
      "raisedOn": "2026-05-15"
    },
    {
      "id": "neg-2",
      "channel": "Flipkart",
      "reason": "Excess SPF claim clawback",
      "amount": 9400,
      "recovered": 0,
      "raisedOn": "2026-06-02"
    },
    {
      "id": "neg-3",
      "channel": "Meesho",
      "reason": "Penalty - late dispatch",
      "amount": 4200,
      "recovered": 4200,
      "raisedOn": "2026-05-28"
    },
    {
      "id": "neg-4",
      "channel": "Amazon",
      "reason": "Storage fee adjustment",
      "amount": 6800,
      "recovered": 3400,
      "raisedOn": "2026-06-10"
    }
  ],
  "supplier-scorecards": [
    {
      "id": "sc-1",
      "name": "Sundaram Steel & Alloys",
      "qualityPct": 98,
      "otifPct": 95,
      "priceIndex": 96,
      "responsiveness": 5
    },
    {
      "id": "sc-2",
      "name": "Bharat Polymers Pvt Ltd",
      "qualityPct": 92,
      "otifPct": 88,
      "priceIndex": 104,
      "responsiveness": 4
    },
    {
      "id": "sc-3",
      "name": "Karnataka Fasteners Co",
      "qualityPct": 86,
      "otifPct": 79,
      "priceIndex": 110,
      "responsiveness": 3
    },
    {
      "id": "sc-4",
      "name": "Deccan Castings Ltd",
      "qualityPct": 74,
      "otifPct": 68,
      "priceIndex": 118,
      "responsiveness": 2
    },
    {
      "id": "sc-5",
      "name": "Mysore Electricals",
      "qualityPct": 95,
      "otifPct": 91,
      "priceIndex": 99,
      "responsiveness": 4
    },
    {
      "id": "sc-6",
      "name": "Coimbatore Precision Tools",
      "qualityPct": 81,
      "otifPct": 72,
      "priceIndex": 113,
      "responsiveness": 3
    }
  ],
  "supplier-reorder-points": [
    {
      "id": "rp-1",
      "item": "MS Sheet 2mm (SKU-MS2)",
      "avgDailyUse": 120,
      "leadTimeDays": 12,
      "safetyStock": 400,
      "onHand": 650
    },
    {
      "id": "rp-2",
      "item": "Hex Bolt M10 (SKU-HB10)",
      "avgDailyUse": 850,
      "leadTimeDays": 7,
      "safetyStock": 2000,
      "onHand": 1800
    },
    {
      "id": "rp-3",
      "item": "Industrial Grease 5kg (SKU-GR5)",
      "avgDailyUse": 8,
      "leadTimeDays": 5,
      "safetyStock": 20,
      "onHand": 75
    },
    {
      "id": "rp-4",
      "item": "Copper Wire 1.5sqmm (SKU-CW15)",
      "avgDailyUse": 45,
      "leadTimeDays": 15,
      "safetyStock": 300,
      "onHand": 280
    },
    {
      "id": "rp-5",
      "item": "PVC Granules (SKU-PVC)",
      "avgDailyUse": 200,
      "leadTimeDays": 10,
      "safetyStock": 600,
      "onHand": 3200
    },
    {
      "id": "rp-6",
      "item": "Bearing 6204 (SKU-BR04)",
      "avgDailyUse": 30,
      "leadTimeDays": 9,
      "safetyStock": 100,
      "onHand": 90
    }
  ],
  "supplier-rate-contracts": [
    {
      "id": "rc-1",
      "supplier": "Sundaram Steel & Alloys",
      "item": "MS Sheet 2mm",
      "rate": 68500,
      "uom": "tonne",
      "validFrom": "2025-10-01",
      "validTo": "2026-09-30"
    },
    {
      "id": "rc-2",
      "supplier": "Bharat Polymers Pvt Ltd",
      "item": "PVC Granules",
      "rate": 92,
      "uom": "kg",
      "validFrom": "2025-04-01",
      "validTo": "2026-07-15"
    },
    {
      "id": "rc-3",
      "supplier": "Karnataka Fasteners Co",
      "item": "Hex Bolt M10",
      "rate": 4.2,
      "uom": "unit",
      "validFrom": "2025-01-01",
      "validTo": "2025-12-31"
    },
    {
      "id": "rc-4",
      "supplier": "Mysore Electricals",
      "item": "Copper Wire 1.5sqmm",
      "rate": 78,
      "uom": "metre",
      "validFrom": "2026-01-01",
      "validTo": "2026-06-30"
    },
    {
      "id": "rc-5",
      "supplier": "Deccan Castings Ltd",
      "item": "Gear Blank GB-22",
      "rate": 1250,
      "uom": "unit",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30"
    },
    {
      "id": "rc-6",
      "supplier": "Coimbatore Precision Tools",
      "item": "Carbide Insert",
      "rate": 340,
      "uom": "box",
      "validFrom": "2025-11-01",
      "validTo": "2026-10-31"
    }
  ],
  "supplier-msme-batch": [
    {
      "id": "ms-1",
      "supplier": "Karnataka Fasteners Co",
      "udyam": "UDYAM-KR-03-0012345",
      "category": "small",
      "outstanding": 285000,
      "invoiceDate": "2026-04-25"
    },
    {
      "id": "ms-2",
      "supplier": "Sri Lakshmi Engineering",
      "udyam": "UDYAM-KR-03-0098765",
      "category": "micro",
      "outstanding": 142000,
      "invoiceDate": "2026-05-30"
    },
    {
      "id": "ms-3",
      "supplier": "Sundaram Steel & Alloys",
      "udyam": "",
      "category": "not-msme",
      "outstanding": 0,
      "invoiceDate": "2026-06-01"
    },
    {
      "id": "ms-4",
      "supplier": "Deccan Castings Ltd",
      "udyam": "UDYAM-MH-26-0044556",
      "category": "medium",
      "outstanding": 510000,
      "invoiceDate": "2026-05-10"
    },
    {
      "id": "ms-5",
      "supplier": "Mysore Electricals",
      "udyam": "UDYAM-KR-03-0077881",
      "category": "small",
      "outstanding": 96000,
      "invoiceDate": "2026-06-12"
    },
    {
      "id": "ms-6",
      "supplier": "Hubli Rubber Works",
      "udyam": "",
      "category": "pending",
      "outstanding": 38000,
      "invoiceDate": "2026-06-15"
    }
  ],
  "sup-terms-optimizer": [
    {
      "id": "to-1",
      "supplier": "Sundaram Steel & Alloys",
      "invoiceAmount": 825000,
      "discountPct": 2,
      "discountDays": 10,
      "netDays": 45
    },
    {
      "id": "to-2",
      "supplier": "Bharat Polymers Pvt Ltd",
      "invoiceAmount": 340000,
      "discountPct": 1.5,
      "discountDays": 7,
      "netDays": 30
    },
    {
      "id": "to-3",
      "supplier": "Mysore Electricals",
      "invoiceAmount": 215000,
      "discountPct": 1,
      "discountDays": 15,
      "netDays": 60
    },
    {
      "id": "to-4",
      "supplier": "Deccan Castings Ltd",
      "invoiceAmount": 510000,
      "discountPct": 2.5,
      "discountDays": 10,
      "netDays": 40
    },
    {
      "id": "to-5",
      "supplier": "Coimbatore Precision Tools",
      "invoiceAmount": 128000,
      "discountPct": 0.5,
      "discountDays": 5,
      "netDays": 30
    }
  ],
  "sup-terms-coc": 14,
  "sup-price-trend": [
    {
      "id": "pt-1",
      "supplier": "Sundaram Steel & Alloys",
      "item": "MS Sheet 2mm",
      "price": 64000,
      "date": "2025-08-15"
    },
    {
      "id": "pt-2",
      "supplier": "Sundaram Steel & Alloys",
      "item": "MS Sheet 2mm",
      "price": 66200,
      "date": "2025-12-10"
    },
    {
      "id": "pt-3",
      "supplier": "Sundaram Steel & Alloys",
      "item": "MS Sheet 2mm",
      "price": 68500,
      "date": "2026-04-05"
    },
    {
      "id": "pt-4",
      "supplier": "Bharat Polymers Pvt Ltd",
      "item": "PVC Granules",
      "price": 96,
      "date": "2025-09-01"
    },
    {
      "id": "pt-5",
      "supplier": "Bharat Polymers Pvt Ltd",
      "item": "PVC Granules",
      "price": 94,
      "date": "2026-01-20"
    },
    {
      "id": "pt-6",
      "supplier": "Bharat Polymers Pvt Ltd",
      "item": "PVC Granules",
      "price": 92,
      "date": "2026-05-18"
    },
    {
      "id": "pt-7",
      "supplier": "Mysore Electricals",
      "item": "Copper Wire 1.5sqmm",
      "price": 71,
      "date": "2025-10-12"
    },
    {
      "id": "pt-8",
      "supplier": "Mysore Electricals",
      "item": "Copper Wire 1.5sqmm",
      "price": 78,
      "date": "2026-03-22"
    }
  ],
  "sup-leadtime-variance": [
    {
      "id": "lt-1",
      "supplier": "Sundaram Steel & Alloys",
      "promisedDays": 12,
      "actualDays": 11,
      "po": "PO-2026-0012"
    },
    {
      "id": "lt-2",
      "supplier": "Sundaram Steel & Alloys",
      "promisedDays": 12,
      "actualDays": 13,
      "po": "PO-2026-0019"
    },
    {
      "id": "lt-3",
      "supplier": "Karnataka Fasteners Co",
      "promisedDays": 7,
      "actualDays": 14,
      "po": "PO-2026-0021"
    },
    {
      "id": "lt-4",
      "supplier": "Karnataka Fasteners Co",
      "promisedDays": 7,
      "actualDays": 9,
      "po": "PO-2026-0027"
    },
    {
      "id": "lt-5",
      "supplier": "Deccan Castings Ltd",
      "promisedDays": 20,
      "actualDays": 31,
      "po": "PO-2026-0030"
    },
    {
      "id": "lt-6",
      "supplier": "Mysore Electricals",
      "promisedDays": 15,
      "actualDays": 15,
      "po": "PO-2026-0033"
    },
    {
      "id": "lt-7",
      "supplier": "Mysore Electricals",
      "promisedDays": 15,
      "actualDays": 16,
      "po": "PO-2026-0041"
    }
  ],
  "sup-alt-shortlist": [
    {
      "id": "as-1",
      "item": "MS Sheet 2mm",
      "supplier": "Sundaram Steel & Alloys",
      "price": 68500,
      "leadDays": 12,
      "minOrderQty": 5,
      "approved": true
    },
    {
      "id": "as-2",
      "item": "MS Sheet 2mm",
      "supplier": "Jindal Stockist Bengaluru",
      "price": 70200,
      "leadDays": 6,
      "minOrderQty": 2,
      "approved": true
    },
    {
      "id": "as-3",
      "item": "MS Sheet 2mm",
      "supplier": "Hosur Metals",
      "price": 67800,
      "leadDays": 18,
      "minOrderQty": 10,
      "approved": false
    },
    {
      "id": "as-4",
      "item": "Hex Bolt M10",
      "supplier": "Karnataka Fasteners Co",
      "price": 4.2,
      "leadDays": 7,
      "minOrderQty": 5000,
      "approved": true
    },
    {
      "id": "as-5",
      "item": "Copper Wire 1.5sqmm",
      "supplier": "Mysore Electricals",
      "price": 78,
      "leadDays": 15,
      "minOrderQty": 500,
      "approved": true
    },
    {
      "id": "as-6",
      "item": "Copper Wire 1.5sqmm",
      "supplier": "Polycab Distributor",
      "price": 81,
      "leadDays": 5,
      "minOrderQty": 200,
      "approved": false
    }
  ],
  "sup-concentration": [
    {
      "id": "cn-1",
      "supplier": "Sundaram Steel & Alloys",
      "annualSpend": 9800000
    },
    {
      "id": "cn-2",
      "supplier": "Bharat Polymers Pvt Ltd",
      "annualSpend": 4200000
    },
    {
      "id": "cn-3",
      "supplier": "Mysore Electricals",
      "annualSpend": 3100000
    },
    {
      "id": "cn-4",
      "supplier": "Karnataka Fasteners Co",
      "annualSpend": 1850000
    },
    {
      "id": "cn-5",
      "supplier": "Deccan Castings Ltd",
      "annualSpend": 1400000
    },
    {
      "id": "cn-6",
      "supplier": "Coimbatore Precision Tools",
      "annualSpend": 720000
    }
  ],
  "sup-grn-match": [
    {
      "id": "gm-1",
      "po": "PO-2026-0012",
      "supplier": "Sundaram Steel & Alloys",
      "poQty": 10,
      "grnQty": 10,
      "invQty": 10,
      "poRate": 68500,
      "invRate": 68500,
      "rejectedQty": 0
    },
    {
      "id": "gm-2",
      "po": "PO-2026-0021",
      "supplier": "Karnataka Fasteners Co",
      "poQty": 5000,
      "grnQty": 5000,
      "invQty": 5200,
      "poRate": 4.2,
      "invRate": 4.2,
      "rejectedQty": 120
    },
    {
      "id": "gm-3",
      "po": "PO-2026-0030",
      "supplier": "Deccan Castings Ltd",
      "poQty": 200,
      "grnQty": 195,
      "invQty": 195,
      "poRate": 1250,
      "invRate": 1320,
      "rejectedQty": 8
    },
    {
      "id": "gm-4",
      "po": "PO-2026-0033",
      "supplier": "Mysore Electricals",
      "poQty": 800,
      "grnQty": 800,
      "invQty": 800,
      "poRate": 78,
      "invRate": 78,
      "rejectedQty": 0
    },
    {
      "id": "gm-5",
      "po": "PO-2026-0041",
      "supplier": "Bharat Polymers Pvt Ltd",
      "poQty": 3000,
      "grnQty": 2980,
      "invQty": 3000,
      "poRate": 92,
      "invRate": 95,
      "rejectedQty": 15
    }
  ],
  "sup-grn-tolerance": 2,
  "sup-nego-supplier": "Sundaram Steel & Alloys",
  "sup-nego-spend": "9800000",
  "sup-nego-current": "68500",
  "sup-nego-target": "64000",
  "sup-nego-walk": "66500",
  "sup-nego-checklist": [
    {
      "id": "c1",
      "label": "Benchmarked price vs 2+ alternate quotes",
      "done": true
    },
    {
      "id": "c2",
      "label": "Pulled 12-month spend & volume history",
      "done": true
    },
    {
      "id": "c3",
      "label": "Listed quality/delivery issues as leverage",
      "done": true
    },
    {
      "id": "c4",
      "label": "Defined target, walk-away & BATNA",
      "done": false
    },
    {
      "id": "c5",
      "label": "Prepared volume-commitment or early-pay trade-offs",
      "done": false
    }
  ],
  "sup-pay-priority": [
    {
      "id": "pp-1",
      "supplier": "Sri Lakshmi Engineering",
      "amount": 142000,
      "dueDate": "2026-06-23",
      "isMsme": true,
      "discountPct": 0
    },
    {
      "id": "pp-2",
      "supplier": "Sundaram Steel & Alloys",
      "amount": 825000,
      "dueDate": "2026-07-05",
      "isMsme": false,
      "discountPct": 2
    },
    {
      "id": "pp-3",
      "supplier": "Karnataka Fasteners Co",
      "amount": 285000,
      "dueDate": "2026-06-18",
      "isMsme": true,
      "discountPct": 0
    },
    {
      "id": "pp-4",
      "supplier": "Bharat Polymers Pvt Ltd",
      "amount": 340000,
      "dueDate": "2026-06-28",
      "isMsme": false,
      "discountPct": 1.5
    },
    {
      "id": "pp-5",
      "supplier": "Deccan Castings Ltd",
      "amount": 510000,
      "dueDate": "2026-07-12",
      "isMsme": false,
      "discountPct": 0
    },
    {
      "id": "pp-6",
      "supplier": "Mysore Electricals",
      "amount": 96000,
      "dueDate": "2026-06-25",
      "isMsme": false,
      "discountPct": 1
    }
  ],
  "sup-gst2b-match": [
    {
      "id": "g2-1",
      "supplier": "Sundaram Steel & Alloys",
      "gstin": "29AABCS1234M1Z7",
      "bookItc": 148500,
      "gstr2bItc": 148500
    },
    {
      "id": "g2-2",
      "supplier": "Bharat Polymers Pvt Ltd",
      "gstin": "29AAACB5678N1Z3",
      "bookItc": 61200,
      "gstr2bItc": 48900
    },
    {
      "id": "g2-3",
      "supplier": "Karnataka Fasteners Co",
      "gstin": "29AADCK9012P1Z9",
      "bookItc": 33300,
      "gstr2bItc": 33300
    },
    {
      "id": "g2-4",
      "supplier": "Mysore Electricals",
      "gstin": "29AAFCM3456Q1Z5",
      "bookItc": 38700,
      "gstr2bItc": 40100
    },
    {
      "id": "g2-5",
      "supplier": "Deccan Castings Ltd",
      "gstin": "27AAGCD7890R1Z1",
      "bookItc": 91800,
      "gstr2bItc": 72000
    }
  ],
  "sup-gst2b-tolerance": 1,
  "sup-quality-ppm": [
    {
      "id": "qp-1",
      "supplier": "Sundaram Steel & Alloys",
      "received": 12000,
      "rejected": 18,
      "period": "2026-04"
    },
    {
      "id": "qp-2",
      "supplier": "Karnataka Fasteners Co",
      "received": 50000,
      "rejected": 620,
      "period": "2026-04"
    },
    {
      "id": "qp-3",
      "supplier": "Deccan Castings Ltd",
      "received": 2400,
      "rejected": 96,
      "period": "2026-05"
    },
    {
      "id": "qp-4",
      "supplier": "Mysore Electricals",
      "received": 9600,
      "rejected": 24,
      "period": "2026-05"
    },
    {
      "id": "qp-5",
      "supplier": "Bharat Polymers Pvt Ltd",
      "received": 30000,
      "rejected": 150,
      "period": "2026-05"
    },
    {
      "id": "qp-6",
      "supplier": "Coimbatore Precision Tools",
      "received": 4500,
      "rejected": 81,
      "period": "2026-06"
    }
  ],
  "sup-quality-target-ppm": 5000,
  "sup-credit-util": [
    {
      "id": "cu-1",
      "supplier": "Sundaram Steel & Alloys",
      "grantedDays": 45,
      "avgPayDays": 30,
      "monthlyPurchase": 820000
    },
    {
      "id": "cu-2",
      "supplier": "Bharat Polymers Pvt Ltd",
      "grantedDays": 30,
      "avgPayDays": 28,
      "monthlyPurchase": 350000
    },
    {
      "id": "cu-3",
      "supplier": "Mysore Electricals",
      "grantedDays": 60,
      "avgPayDays": 41,
      "monthlyPurchase": 260000
    },
    {
      "id": "cu-4",
      "supplier": "Deccan Castings Ltd",
      "grantedDays": 40,
      "avgPayDays": 52,
      "monthlyPurchase": 145000
    },
    {
      "id": "cu-5",
      "supplier": "Karnataka Fasteners Co",
      "grantedDays": 30,
      "avgPayDays": 15,
      "monthlyPurchase": 155000
    }
  ],
  "sup-landed-cost": [
    {
      "id": "lc-1",
      "supplier": "Sundaram Steel & Alloys",
      "item": "MS Sheet 2mm",
      "qty": 10,
      "unitPrice": 68500,
      "freight": 12000,
      "dutyPct": 0,
      "insurance": 3000
    },
    {
      "id": "lc-2",
      "supplier": "Hosur Metals",
      "item": "MS Sheet 2mm",
      "qty": 10,
      "unitPrice": 67800,
      "freight": 28000,
      "dutyPct": 0,
      "insurance": 4500
    },
    {
      "id": "lc-3",
      "supplier": "Jindal Stockist Bengaluru",
      "item": "MS Sheet 2mm",
      "qty": 10,
      "unitPrice": 70200,
      "freight": 6000,
      "dutyPct": 0,
      "insurance": 2500
    },
    {
      "id": "lc-4",
      "supplier": "Shenzhen Components Co",
      "item": "Bearing 6204",
      "qty": 5000,
      "unitPrice": 38,
      "freight": 45000,
      "dutyPct": 7.5,
      "insurance": 9000
    },
    {
      "id": "lc-5",
      "supplier": "Rajkot Bearings",
      "item": "Bearing 6204",
      "qty": 5000,
      "unitPrice": 46,
      "freight": 8000,
      "dutyPct": 0,
      "insurance": 2000
    }
  ],
  "sup-contract-calendar": [
    {
      "id": "ct-1",
      "supplier": "Sundaram Steel & Alloys",
      "title": "Annual Steel Supply RC",
      "annualValue": 9800000,
      "noticeDays": 60,
      "expiry": "2026-09-30"
    },
    {
      "id": "ct-2",
      "supplier": "Mysore Electricals",
      "title": "Copper Wire Rate Contract",
      "annualValue": 3100000,
      "noticeDays": 30,
      "expiry": "2026-06-30"
    },
    {
      "id": "ct-3",
      "supplier": "Bharat Polymers Pvt Ltd",
      "title": "PVC Granules SOW",
      "annualValue": 4200000,
      "noticeDays": 45,
      "expiry": "2026-07-15"
    },
    {
      "id": "ct-4",
      "supplier": "Deccan Castings Ltd",
      "title": "Castings Annual Agreement",
      "annualValue": 1400000,
      "noticeDays": 30,
      "expiry": "2027-06-30"
    },
    {
      "id": "ct-5",
      "supplier": "Tally Solutions",
      "title": "ERP AMC",
      "annualValue": 180000,
      "noticeDays": 30,
      "expiry": "2026-12-31"
    },
    {
      "id": "ct-6",
      "supplier": "Bengaluru Logistics LLP",
      "title": "Freight Service Contract",
      "annualValue": 960000,
      "noticeDays": 90,
      "expiry": "2026-08-31"
    }
  ],
  "sup-terms-benchmark": [
    {
      "id": "tb-1",
      "supplier": "Sundaram Steel & Alloys",
      "category": "Raw Material",
      "creditDays": 45,
      "annualSpend": 9800000
    },
    {
      "id": "tb-2",
      "supplier": "Hosur Metals",
      "category": "Raw Material",
      "creditDays": 30,
      "annualSpend": 2200000
    },
    {
      "id": "tb-3",
      "supplier": "Jindal Stockist Bengaluru",
      "category": "Raw Material",
      "creditDays": 60,
      "annualSpend": 1800000
    },
    {
      "id": "tb-4",
      "supplier": "Karnataka Fasteners Co",
      "category": "Consumables",
      "creditDays": 30,
      "annualSpend": 1850000
    },
    {
      "id": "tb-5",
      "supplier": "Coimbatore Precision Tools",
      "category": "Consumables",
      "creditDays": 45,
      "annualSpend": 720000
    },
    {
      "id": "tb-6",
      "supplier": "Bengaluru Logistics LLP",
      "category": "Services",
      "creditDays": 15,
      "annualSpend": 960000
    }
  ],
  "sup-risk-diversification": [
    {
      "id": "rd-1",
      "supplier": "Sundaram Steel & Alloys",
      "region": "Karnataka",
      "spend": 9800000,
      "singleSource": false
    },
    {
      "id": "rd-2",
      "supplier": "Bharat Polymers Pvt Ltd",
      "region": "Karnataka",
      "spend": 4200000,
      "singleSource": true
    },
    {
      "id": "rd-3",
      "supplier": "Mysore Electricals",
      "region": "Karnataka",
      "spend": 3100000,
      "singleSource": false
    },
    {
      "id": "rd-4",
      "supplier": "Deccan Castings Ltd",
      "region": "Maharashtra",
      "spend": 1400000,
      "singleSource": false
    },
    {
      "id": "rd-5",
      "supplier": "Shenzhen Components Co",
      "region": "China",
      "spend": 2600000,
      "singleSource": true
    },
    {
      "id": "rd-6",
      "supplier": "Coimbatore Precision Tools",
      "region": "Tamil Nadu",
      "spend": 720000,
      "singleSource": false
    }
  ],
  "sup-eoq-check": [
    {
      "id": "eo-1",
      "item": "MS Sheet 2mm",
      "annualDemand": 36000,
      "orderCost": 1500,
      "unitCost": 68.5,
      "holdingPct": 22,
      "moq": 500
    },
    {
      "id": "eo-2",
      "item": "Hex Bolt M10",
      "annualDemand": 300000,
      "orderCost": 800,
      "unitCost": 4.2,
      "holdingPct": 18,
      "moq": 5000
    },
    {
      "id": "eo-3",
      "item": "Copper Wire 1.5sqmm",
      "annualDemand": 16000,
      "orderCost": 1200,
      "unitCost": 78,
      "holdingPct": 20,
      "moq": 2000
    },
    {
      "id": "eo-4",
      "item": "Bearing 6204",
      "annualDemand": 11000,
      "orderCost": 2000,
      "unitCost": 46,
      "holdingPct": 25,
      "moq": 200
    },
    {
      "id": "eo-5",
      "item": "PVC Granules",
      "annualDemand": 72000,
      "orderCost": 1000,
      "unitCost": 92,
      "holdingPct": 20,
      "moq": 3000
    }
  ],
  "sup-vendor-advances": [
    {
      "id": "va-1",
      "vendor": "Deccan Castings Ltd",
      "reference": "PO-2026-0030",
      "advancePaid": 200000,
      "adjusted": 120000,
      "paidDate": "2026-03-12"
    },
    {
      "id": "va-2",
      "vendor": "Shenzhen Components Co",
      "reference": "PO-2026-0035",
      "advancePaid": 950000,
      "adjusted": 0,
      "paidDate": "2026-02-01"
    },
    {
      "id": "va-3",
      "vendor": "Coimbatore Precision Tools",
      "reference": "PO-2026-0040",
      "advancePaid": 64000,
      "adjusted": 64000,
      "paidDate": "2026-05-20"
    },
    {
      "id": "va-4",
      "vendor": "Bengaluru Logistics LLP",
      "reference": "ADV-FR-118",
      "advancePaid": 150000,
      "adjusted": 90000,
      "paidDate": "2026-04-08"
    },
    {
      "id": "va-5",
      "vendor": "Hubli Rubber Works",
      "reference": "PO-2026-0044",
      "advancePaid": 38000,
      "adjusted": 0,
      "paidDate": "2026-06-02"
    }
  ],
  "sup-recurring-bills": [
    {
      "id": "rb-1",
      "name": "Factory Rent - Peenya Unit",
      "amount": 285000,
      "cadence": "monthly",
      "dueDay": 5
    },
    {
      "id": "rb-2",
      "name": "BESCOM Electricity",
      "amount": 168000,
      "cadence": "monthly",
      "dueDay": 12
    },
    {
      "id": "rb-3",
      "name": "Tally ERP AMC",
      "amount": 180000,
      "cadence": "annual",
      "dueDay": 1
    },
    {
      "id": "rb-4",
      "name": "GST Filing Retainer (CA)",
      "amount": 45000,
      "cadence": "quarterly",
      "dueDay": 20
    },
    {
      "id": "rb-5",
      "name": "Internet & Leased Line",
      "amount": 22000,
      "cadence": "monthly",
      "dueDay": 8
    },
    {
      "id": "rb-6",
      "name": "Group Health Insurance",
      "amount": 360000,
      "cadence": "annual",
      "dueDay": 15
    }
  ],
  "sup-dup-invoice": [
    {
      "id": "di-1",
      "vendor": "Sundaram Steel & Alloys",
      "invoiceNo": "SSA/26-27/0145",
      "amount": 825000,
      "date": "2026-05-28"
    },
    {
      "id": "di-2",
      "vendor": "Bharat Polymers Pvt Ltd",
      "invoiceNo": "BP-2026-0331",
      "amount": 340000,
      "date": "2026-06-01"
    },
    {
      "id": "di-3",
      "vendor": "Sundaram Steel & Alloys",
      "invoiceNo": "SSA/26-27/0145",
      "amount": 825000,
      "date": "2026-06-10"
    },
    {
      "id": "di-4",
      "vendor": "Mysore Electricals",
      "invoiceNo": "ME/INV/2289",
      "amount": 96000,
      "date": "2026-06-12"
    },
    {
      "id": "di-5",
      "vendor": "Karnataka Fasteners Co",
      "invoiceNo": "KFC-5512",
      "amount": 285000,
      "date": "2026-06-14"
    },
    {
      "id": "di-6",
      "vendor": "Bharat Polymers Pvt Ltd",
      "invoiceNo": "BP-2026-0331",
      "amount": 348000,
      "date": "2026-06-18"
    }
  ],
  "sup-carrying-cost": [
    {
      "id": "cc-1",
      "item": "MS Sheet 2mm",
      "avgInventoryValue": 1850000,
      "capitalPct": 14,
      "storagePct": 4,
      "obsolescencePct": 3
    },
    {
      "id": "cc-2",
      "item": "PVC Granules",
      "avgInventoryValue": 980000,
      "capitalPct": 14,
      "storagePct": 5,
      "obsolescencePct": 6
    },
    {
      "id": "cc-3",
      "item": "Copper Wire 1.5sqmm",
      "avgInventoryValue": 620000,
      "capitalPct": 14,
      "storagePct": 3,
      "obsolescencePct": 2
    },
    {
      "id": "cc-4",
      "item": "Bearing 6204",
      "avgInventoryValue": 410000,
      "capitalPct": 14,
      "storagePct": 4,
      "obsolescencePct": 4
    },
    {
      "id": "cc-5",
      "item": "Slow-moving Spares",
      "avgInventoryValue": 270000,
      "capitalPct": 14,
      "storagePct": 6,
      "obsolescencePct": 12
    }
  ],
  "sup-tds-bills": [
    {
      "id": "tb1",
      "vendor": "Bengaluru Logistics LLP",
      "section": "194C-co",
      "amount": 80000,
      "ytdPaid": 240000,
      "hasPan": true
    },
    {
      "id": "tb2",
      "vendor": "Acme CA Associates",
      "section": "194J",
      "amount": 60000,
      "ytdPaid": 90000,
      "hasPan": true
    },
    {
      "id": "tb3",
      "vendor": "Peenya Estate Rentals",
      "section": "194I-rent",
      "amount": 285000,
      "ytdPaid": 1140000,
      "hasPan": true
    },
    {
      "id": "tb4",
      "vendor": "Sundaram Steel & Alloys",
      "section": "194Q",
      "amount": 825000,
      "ytdPaid": 5200000,
      "hasPan": true
    },
    {
      "id": "tb5",
      "vendor": "FreelanceTech Services",
      "section": "194J-tech",
      "amount": 45000,
      "ytdPaid": 15000,
      "hasPan": false
    },
    {
      "id": "tb6",
      "vendor": "Star Sales Agents",
      "section": "194H",
      "amount": 28000,
      "ytdPaid": 60000,
      "hasPan": true
    }
  ],
  "vendor-purchase-orders": [
    {
      "id": "po-1",
      "poNumber": "PO-2026-0012",
      "vendor": "Sundaram Steel & Alloys",
      "date": "2026-05-10",
      "expectedDelivery": "2026-05-24",
      "status": "received",
      "lines": [
        {
          "id": "pl-1a",
          "desc": "MS Sheet 2mm",
          "qty": 10,
          "rate": 68500
        }
      ],
      "notes": "Quarterly bulk order"
    },
    {
      "id": "po-2",
      "poNumber": "PO-2026-0019",
      "vendor": "Bharat Polymers Pvt Ltd",
      "date": "2026-05-22",
      "expectedDelivery": "2026-06-05",
      "status": "closed",
      "lines": [
        {
          "id": "pl-2a",
          "desc": "PVC Granules",
          "qty": 3000,
          "rate": 92
        },
        {
          "id": "pl-2b",
          "desc": "Masterbatch Black",
          "qty": 200,
          "rate": 180
        }
      ],
      "notes": ""
    },
    {
      "id": "po-3",
      "poNumber": "PO-2026-0030",
      "vendor": "Deccan Castings Ltd",
      "date": "2026-06-01",
      "expectedDelivery": "2026-06-21",
      "status": "sent",
      "lines": [
        {
          "id": "pl-3a",
          "desc": "Gear Blank GB-22",
          "qty": 200,
          "rate": 1250
        }
      ],
      "notes": "50% advance paid"
    },
    {
      "id": "po-4",
      "poNumber": "PO-2026-0033",
      "vendor": "Mysore Electricals",
      "date": "2026-06-08",
      "expectedDelivery": "2026-06-23",
      "status": "sent",
      "lines": [
        {
          "id": "pl-4a",
          "desc": "Copper Wire 1.5sqmm",
          "qty": 800,
          "rate": 78
        }
      ],
      "notes": ""
    },
    {
      "id": "po-5",
      "poNumber": "PO-2026-0041",
      "vendor": "Karnataka Fasteners Co",
      "date": "2026-06-14",
      "expectedDelivery": "2026-06-21",
      "status": "draft",
      "lines": [
        {
          "id": "pl-5a",
          "desc": "Hex Bolt M10",
          "qty": 5000,
          "rate": 4.2
        },
        {
          "id": "pl-5b",
          "desc": "Spring Washer M10",
          "qty": 5000,
          "rate": 0.9
        }
      ],
      "notes": "Awaiting approval"
    },
    {
      "id": "po-6",
      "poNumber": "PO-2026-0009",
      "vendor": "Coimbatore Precision Tools",
      "date": "2026-04-18",
      "expectedDelivery": "2026-05-02",
      "status": "cancelled",
      "lines": [
        {
          "id": "pl-6a",
          "desc": "Carbide Insert",
          "qty": 50,
          "rate": 340
        }
      ],
      "notes": "Cancelled - found cheaper source"
    }
  ],
  "vendor-three-way-match": [
    {
      "id": "vm-1",
      "ref": "PO-2026-0012",
      "vendor": "Sundaram Steel & Alloys",
      "poQty": 10,
      "poRate": 68500,
      "grnQty": 10,
      "invQty": 10,
      "invRate": 68500,
      "tolerancePct": 2
    },
    {
      "id": "vm-2",
      "ref": "PO-2026-0019",
      "vendor": "Bharat Polymers Pvt Ltd",
      "poQty": 3000,
      "poRate": 92,
      "grnQty": 2980,
      "invQty": 3000,
      "invRate": 95,
      "tolerancePct": 2
    },
    {
      "id": "vm-3",
      "ref": "PO-2026-0030",
      "vendor": "Deccan Castings Ltd",
      "poQty": 200,
      "poRate": 1250,
      "grnQty": 195,
      "invQty": 195,
      "invRate": 1320,
      "tolerancePct": 3
    },
    {
      "id": "vm-4",
      "ref": "PO-2026-0033",
      "vendor": "Mysore Electricals",
      "poQty": 800,
      "poRate": 78,
      "grnQty": 800,
      "invQty": 800,
      "invRate": 78,
      "tolerancePct": 2
    },
    {
      "id": "vm-5",
      "ref": "PO-2026-0041",
      "vendor": "Karnataka Fasteners Co",
      "poQty": 5000,
      "poRate": 4.2,
      "grnQty": 5000,
      "invQty": 5200,
      "invRate": 4.2,
      "tolerancePct": 2
    }
  ],
  "vendor-tds-ledger": [
    {
      "id": "vt-1",
      "vendor": "Bengaluru Logistics LLP",
      "section": "194C",
      "grossAmount": 80000,
      "rate": 2,
      "date": "2026-05-07",
      "deposited": true
    },
    {
      "id": "vt-2",
      "vendor": "Acme CA Associates",
      "section": "194J",
      "grossAmount": 60000,
      "rate": 10,
      "date": "2026-05-15",
      "deposited": true
    },
    {
      "id": "vt-3",
      "vendor": "Peenya Estate Rentals",
      "section": "194I-land",
      "grossAmount": 285000,
      "rate": 10,
      "date": "2026-06-01",
      "deposited": false
    },
    {
      "id": "vt-4",
      "vendor": "Sundaram Steel & Alloys",
      "section": "194Q",
      "grossAmount": 825000,
      "rate": 0.1,
      "date": "2026-05-28",
      "deposited": false
    },
    {
      "id": "vt-5",
      "vendor": "Star Sales Agents",
      "section": "194H",
      "grossAmount": 28000,
      "rate": 5,
      "date": "2026-06-10",
      "deposited": false
    }
  ],
  "vendor-early-pay-offers": [
    {
      "id": "ep-1",
      "vendor": "Sundaram Steel & Alloys",
      "invoiceAmount": 825000,
      "discountPct": 2,
      "discountDays": 10,
      "netDays": 45
    },
    {
      "id": "ep-2",
      "vendor": "Bharat Polymers Pvt Ltd",
      "invoiceAmount": 340000,
      "discountPct": 1.5,
      "discountDays": 7,
      "netDays": 30
    },
    {
      "id": "ep-3",
      "vendor": "Mysore Electricals",
      "invoiceAmount": 215000,
      "discountPct": 1,
      "discountDays": 15,
      "netDays": 60
    },
    {
      "id": "ep-4",
      "vendor": "Deccan Castings Ltd",
      "invoiceAmount": 510000,
      "discountPct": 2.5,
      "discountDays": 10,
      "netDays": 40
    },
    {
      "id": "ep-5",
      "vendor": "Coimbatore Precision Tools",
      "invoiceAmount": 128000,
      "discountPct": 0.5,
      "discountDays": 5,
      "netDays": 30
    }
  ],
  "ven-pay-run-selected": [
    "di-1",
    "di-4",
    "di-5"
  ],
  "ven-dup-dismissed": [
    "di-6"
  ],
  "ven-requisitions": [
    {
      "id": "rq-1",
      "reqNo": "REQ-2026-0021",
      "requester": "Ramesh (Production)",
      "item": "Hex Bolt M10",
      "qty": 5000,
      "estCost": 4.2,
      "needBy": "2026-06-28",
      "justification": "Assembly line stock running low",
      "status": "approved"
    },
    {
      "id": "rq-2",
      "reqNo": "REQ-2026-0022",
      "requester": "Anita (QA)",
      "item": "Vernier Caliper Digital",
      "qty": 4,
      "estCost": 3500,
      "needBy": "2026-07-05",
      "justification": "Replace worn-out gauges",
      "status": "pending"
    },
    {
      "id": "rq-3",
      "reqNo": "REQ-2026-0023",
      "requester": "Suresh (Maintenance)",
      "item": "Industrial Grease 5kg",
      "qty": 12,
      "estCost": 1800,
      "needBy": "2026-06-25",
      "justification": "Scheduled preventive maintenance",
      "status": "converted"
    },
    {
      "id": "rq-4",
      "reqNo": "REQ-2026-0024",
      "requester": "Priya (Admin)",
      "item": "Office Printer Toner",
      "qty": 6,
      "estCost": 2200,
      "needBy": "2026-07-10",
      "justification": "Admin office consumables",
      "status": "rejected"
    },
    {
      "id": "rq-5",
      "reqNo": "REQ-2026-0025",
      "requester": "Ramesh (Production)",
      "item": "Copper Wire 1.5sqmm",
      "qty": 500,
      "estCost": 78,
      "needBy": "2026-07-02",
      "justification": "New order batch requirement",
      "status": "pending"
    }
  ],
  "ven-performance-reviews": [
    {
      "id": "pr-1",
      "vendor": "Sundaram Steel & Alloys",
      "period": "Q1 FY26-27",
      "onTime": 5,
      "quality": 5,
      "price": 4,
      "support": 5,
      "notes": "Consistently reliable, prompt on queries"
    },
    {
      "id": "pr-2",
      "vendor": "Bharat Polymers Pvt Ltd",
      "period": "Q1 FY26-27",
      "onTime": 4,
      "quality": 4,
      "price": 3,
      "support": 4,
      "notes": "Good quality, prices creeping up"
    },
    {
      "id": "pr-3",
      "vendor": "Karnataka Fasteners Co",
      "period": "Q1 FY26-27",
      "onTime": 3,
      "quality": 3,
      "price": 4,
      "support": 3,
      "notes": "Lead times erratic, quality acceptable"
    },
    {
      "id": "pr-4",
      "vendor": "Deccan Castings Ltd",
      "period": "Q1 FY26-27",
      "onTime": 2,
      "quality": 3,
      "price": 2,
      "support": 2,
      "notes": "Frequent delays, overbilling noted - on watchlist"
    },
    {
      "id": "pr-5",
      "vendor": "Mysore Electricals",
      "period": "Q1 FY26-27",
      "onTime": 4,
      "quality": 5,
      "price": 4,
      "support": 4,
      "notes": "Strong all-round performer"
    }
  ],
  "ven-rfq-item": "Bearing 6204",
  "ven-rfq-qty": "5000",
  "ven-rfq-quotes": [
    {
      "id": "qt-1",
      "vendor": "Rajkot Bearings",
      "unitPrice": 46,
      "leadDays": 8,
      "paymentTermDays": 30
    },
    {
      "id": "qt-2",
      "vendor": "Shenzhen Components Co",
      "unitPrice": 38,
      "leadDays": 35,
      "paymentTermDays": 0
    },
    {
      "id": "qt-3",
      "vendor": "SKF Authorised Dealer",
      "unitPrice": 58,
      "leadDays": 5,
      "paymentTermDays": 45
    },
    {
      "id": "qt-4",
      "vendor": "Pune Bearing House",
      "unitPrice": 49,
      "leadDays": 12,
      "paymentTermDays": 30
    },
    {
      "id": "qt-5",
      "vendor": "NBC Bearings Distributor",
      "unitPrice": 52,
      "leadDays": 7,
      "paymentTermDays": 60
    }
  ],
  "ven-advances": [
    {
      "id": "ad-1",
      "vendor": "Deccan Castings Ltd",
      "amount": 200000,
      "date": "2026-03-12",
      "purpose": "50% advance on PO-2026-0030 castings",
      "adjusted": 120000
    },
    {
      "id": "ad-2",
      "vendor": "Shenzhen Components Co",
      "amount": 950000,
      "date": "2026-02-01",
      "purpose": "Import advance against PI-2026-0035",
      "adjusted": 0
    },
    {
      "id": "ad-3",
      "vendor": "Coimbatore Precision Tools",
      "amount": 64000,
      "date": "2026-05-20",
      "purpose": "Tooling advance",
      "adjusted": 64000
    },
    {
      "id": "ad-4",
      "vendor": "Bengaluru Logistics LLP",
      "amount": 150000,
      "date": "2026-04-08",
      "purpose": "Freight retainer advance",
      "adjusted": 90000
    },
    {
      "id": "ad-5",
      "vendor": "Hubli Rubber Works",
      "amount": 38000,
      "date": "2026-06-02",
      "purpose": "Mould development advance",
      "adjusted": 0
    }
  ],
  "ven-debit-notes": [
    {
      "id": "dn-1",
      "dnNo": "DN-2026-0011",
      "vendor": "Bharat Polymers Pvt Ltd",
      "reason": "rate-diff",
      "amount": 8940,
      "date": "2026-06-03",
      "status": "open"
    },
    {
      "id": "dn-2",
      "dnNo": "DN-2026-0012",
      "vendor": "Karnataka Fasteners Co",
      "reason": "shortage",
      "amount": 5040,
      "date": "2026-06-05",
      "status": "adjusted"
    },
    {
      "id": "dn-3",
      "dnNo": "DN-2026-0013",
      "vendor": "Deccan Castings Ltd",
      "reason": "damage",
      "amount": 10560,
      "date": "2026-06-08",
      "status": "open"
    },
    {
      "id": "dn-4",
      "dnNo": "DN-2026-0014",
      "vendor": "Sundaram Steel & Alloys",
      "reason": "return",
      "amount": 68500,
      "date": "2026-05-30",
      "status": "adjusted"
    },
    {
      "id": "dn-5",
      "dnNo": "DN-2026-0015",
      "vendor": "Mysore Electricals",
      "reason": "discount",
      "amount": 4800,
      "date": "2026-06-12",
      "status": "open"
    }
  ],
  "ven-blanket-pos": [
    {
      "id": "bp-1",
      "vendor": "Sundaram Steel & Alloys",
      "totalValue": 9800000,
      "validTill": "2026-09-30",
      "releases": [
        {
          "id": "br-1a",
          "date": "2026-04-15",
          "amount": 2400000,
          "note": "Q1 drawdown"
        },
        {
          "id": "br-1b",
          "date": "2026-05-20",
          "amount": 2100000,
          "note": "Q2 part 1"
        }
      ]
    },
    {
      "id": "bp-2",
      "vendor": "Bharat Polymers Pvt Ltd",
      "totalValue": 4200000,
      "validTill": "2026-07-15",
      "releases": [
        {
          "id": "br-2a",
          "date": "2026-04-30",
          "amount": 1100000,
          "note": "April release"
        },
        {
          "id": "br-2b",
          "date": "2026-06-01",
          "amount": 980000,
          "note": "June release"
        }
      ]
    },
    {
      "id": "bp-3",
      "vendor": "Mysore Electricals",
      "totalValue": 3100000,
      "validTill": "2026-12-31",
      "releases": [
        {
          "id": "br-3a",
          "date": "2026-05-10",
          "amount": 620000,
          "note": "First call-off"
        }
      ]
    },
    {
      "id": "bp-4",
      "vendor": "Karnataka Fasteners Co",
      "totalValue": 1850000,
      "validTill": "2026-10-31",
      "releases": [
        {
          "id": "br-4a",
          "date": "2026-06-14",
          "amount": 425000,
          "note": "Initial release"
        }
      ]
    }
  ],
  "ven-concentration-threshold": 30,
  "ven-msme-dues": [
    {
      "id": "md-1",
      "vendor": "Karnataka Fasteners Co",
      "amount": "285000",
      "acceptedOn": "2026-04-25"
    },
    {
      "id": "md-2",
      "vendor": "Sri Lakshmi Engineering",
      "amount": "142000",
      "acceptedOn": "2026-05-30"
    },
    {
      "id": "md-3",
      "vendor": "Mysore Electricals",
      "amount": "96000",
      "acceptedOn": "2026-05-12"
    },
    {
      "id": "md-4",
      "vendor": "Hubli Rubber Works",
      "amount": "38000",
      "acceptedOn": "2026-06-02"
    },
    {
      "id": "md-5",
      "vendor": "Tumkur Sheet Metal",
      "amount": "67000",
      "acceptedOn": "2026-05-08"
    }
  ],
  "ven-msme-bank-rate": 6.5,
  "ven-savings-entries": [
    {
      "id": "se-1",
      "vendor": "Sundaram Steel & Alloys",
      "type": "negotiation",
      "baseline": 70200,
      "final": 68500,
      "date": "2026-04-01",
      "note": "Annual RC renegotiation"
    },
    {
      "id": "se-2",
      "vendor": "Bharat Polymers Pvt Ltd",
      "type": "early-pay",
      "baseline": 340000,
      "final": 334900,
      "date": "2026-05-15",
      "note": "1.5/7 net 30 discount captured"
    },
    {
      "id": "se-3",
      "vendor": "Multiple",
      "type": "consolidation",
      "baseline": 1200000,
      "final": 1080000,
      "date": "2026-03-20",
      "note": "Consolidated fasteners to single vendor"
    },
    {
      "id": "se-4",
      "vendor": "Coimbatore Precision Tools",
      "type": "avoided",
      "baseline": 170000,
      "final": 128000,
      "date": "2026-04-18",
      "note": "Switched to cheaper qualified source"
    },
    {
      "id": "se-5",
      "vendor": "Mysore Electricals",
      "type": "rebate",
      "baseline": 3100000,
      "final": 3038000,
      "date": "2026-06-01",
      "note": "Volume rebate 2% on slab crossed"
    }
  ],
  "ven-f16a-certs": [
    {
      "id": "f16-1",
      "vendor": "Bengaluru Logistics LLP",
      "pan": "AABFB1234L",
      "quarter": "Q4",
      "fy": "2025-26",
      "tdsAmount": 1600,
      "status": "issued"
    },
    {
      "id": "f16-2",
      "vendor": "Acme CA Associates",
      "pan": "AAFCA5678M",
      "quarter": "Q4",
      "fy": "2025-26",
      "tdsAmount": 6000,
      "status": "downloaded"
    },
    {
      "id": "f16-3",
      "vendor": "Peenya Estate Rentals",
      "pan": "AAGPP9012N",
      "quarter": "Q1",
      "fy": "2026-27",
      "tdsAmount": 28500,
      "status": "pending"
    },
    {
      "id": "f16-4",
      "vendor": "Star Sales Agents",
      "pan": "BKLPS3456Q",
      "quarter": "Q1",
      "fy": "2026-27",
      "tdsAmount": 1400,
      "status": "pending"
    },
    {
      "id": "f16-5",
      "vendor": "Sundaram Steel & Alloys",
      "pan": "AABCS1234M",
      "quarter": "Q1",
      "fy": "2026-27",
      "tdsAmount": 825,
      "status": "downloaded"
    }
  ],
  "ven-rebate-deals": [
    {
      "id": "rbt-1",
      "vendor": "Mysore Electricals",
      "threshold": 3000000,
      "ratePct": 2,
      "ytdPurchase": 3100000
    },
    {
      "id": "rbt-2",
      "vendor": "Sundaram Steel & Alloys",
      "threshold": 10000000,
      "ratePct": 1.5,
      "ytdPurchase": 9800000
    },
    {
      "id": "rbt-3",
      "vendor": "Bharat Polymers Pvt Ltd",
      "threshold": 5000000,
      "ratePct": 2.5,
      "ytdPurchase": 4200000
    },
    {
      "id": "rbt-4",
      "vendor": "Karnataka Fasteners Co",
      "threshold": 2000000,
      "ratePct": 3,
      "ytdPurchase": 1850000
    },
    {
      "id": "rbt-5",
      "vendor": "Coimbatore Precision Tools",
      "threshold": 1000000,
      "ratePct": 2,
      "ytdPurchase": 720000
    }
  ],
  "ven-watchlist-flags": [
    {
      "id": "wf-1",
      "vendor": "Deccan Castings Ltd",
      "level": "hold",
      "reason": "Repeated delivery delays and overbilling on PO-2026-0030",
      "date": "2026-06-08"
    },
    {
      "id": "wf-2",
      "vendor": "Shenzhen Components Co",
      "level": "watch",
      "reason": "Single-source import dependency, long lead times",
      "date": "2026-05-15"
    },
    {
      "id": "wf-3",
      "vendor": "FreelanceTech Services",
      "level": "watch",
      "reason": "No PAN on file - 20% TDS applied",
      "date": "2026-06-10"
    },
    {
      "id": "wf-4",
      "vendor": "Quickfix Traders",
      "level": "blacklist",
      "reason": "Supplied counterfeit components, GST never reflected in 2B",
      "date": "2026-02-28"
    },
    {
      "id": "wf-5",
      "vendor": "Hubli Rubber Works",
      "level": "watch",
      "reason": "MSME advance unadjusted, mould delayed",
      "date": "2026-06-15"
    }
  ],
  "ven-bill-register": [
    {
      "id": "ber-1",
      "vendor": "Sundaram Steel & Alloys",
      "invoiceNo": "SSA/26-27/0145",
      "amount": 825000,
      "date": "2026-05-28"
    },
    {
      "id": "ber-2",
      "vendor": "Bharat Polymers Pvt Ltd",
      "invoiceNo": "BP-2026-0331",
      "amount": 340000,
      "date": "2026-06-01"
    },
    {
      "id": "ber-3",
      "vendor": "Mysore Electricals",
      "invoiceNo": "ME/INV/2289",
      "amount": 96000,
      "date": "2026-06-12"
    },
    {
      "id": "ber-4",
      "vendor": "Karnataka Fasteners Co",
      "invoiceNo": "KFC-5512",
      "amount": 285000,
      "date": "2026-06-14"
    },
    {
      "id": "ber-5",
      "vendor": "Deccan Castings Ltd",
      "invoiceNo": "DC-2026-0088",
      "amount": 510000,
      "date": "2026-06-05"
    },
    {
      "id": "ber-6",
      "vendor": "Bengaluru Logistics LLP",
      "invoiceNo": "BLL-FR-0712",
      "amount": 80000,
      "date": "2026-06-09"
    }
  ],
  "ven-approval-sla": [
    {
      "id": "ap-1",
      "item": "PO-2026-0012 Steel order",
      "approver": "Owner",
      "requested": "2026-05-09",
      "decided": "2026-05-10",
      "outcome": "approved"
    },
    {
      "id": "ap-2",
      "item": "REQ-2026-0022 Calipers",
      "approver": "Owner",
      "requested": "2026-06-15",
      "decided": "2026-06-18",
      "outcome": "approved"
    },
    {
      "id": "ap-3",
      "item": "PO-2026-0009 Carbide Inserts",
      "approver": "Finance Head",
      "requested": "2026-04-17",
      "decided": "2026-04-18",
      "outcome": "rejected"
    },
    {
      "id": "ap-4",
      "item": "REQ-2026-0024 Toner",
      "approver": "Owner",
      "requested": "2026-06-12",
      "decided": "2026-06-16",
      "outcome": "rejected"
    },
    {
      "id": "ap-5",
      "item": "PO-2026-0030 Castings advance",
      "approver": "Owner",
      "requested": "2026-05-31",
      "decided": "2026-06-01",
      "outcome": "approved"
    }
  ],
  "bank-pending-debits": [
    {
      "id": "pd-1",
      "label": "PDC to Sundaram Steel Suppliers",
      "amount": 480000,
      "date": "2026-06-24"
    },
    {
      "id": "pd-2",
      "label": "GST payment (May 2026)",
      "amount": 312500,
      "date": "2026-06-20"
    },
    {
      "id": "pd-3",
      "label": "Salary disbursement - June",
      "amount": 1850000,
      "date": "2026-06-30"
    },
    {
      "id": "pd-4",
      "label": "Standing instruction - office rent",
      "amount": 225000,
      "date": "2026-06-25"
    },
    {
      "id": "pd-5",
      "label": "EMI - HDFC term loan",
      "amount": 168400,
      "date": "2026-06-27"
    },
    {
      "id": "pd-6",
      "label": "PDC to Kaveri Logistics",
      "amount": 96000,
      "date": "2026-07-02"
    }
  ],
  "bank-virtual-accounts": [
    {
      "id": "va-1",
      "customer": "Bharat Heavy Castings Pvt Ltd",
      "vaNumber": "VA2049817631",
      "expected": 850000,
      "received": 850000
    },
    {
      "id": "va-2",
      "customer": "Coromandel Engineering Co",
      "vaNumber": "VA3318074502",
      "expected": 420000,
      "received": 420000
    },
    {
      "id": "va-3",
      "customer": "Nilkamal Distributors",
      "vaNumber": "VA5572910384",
      "expected": 275000,
      "received": 0
    },
    {
      "id": "va-4",
      "customer": "Sri Venkateswara Traders",
      "vaNumber": "VA6640183927",
      "expected": 610000,
      "received": 305000
    },
    {
      "id": "va-5",
      "customer": "Deccan Auto Components",
      "vaNumber": "VA7791026458",
      "expected": 190000,
      "received": 190000
    },
    {
      "id": "va-6",
      "customer": "Malabar Industrial Supplies",
      "vaNumber": "VA8810467239",
      "expected": 540000,
      "received": 0
    }
  ],
  "bank-cheques": [
    {
      "id": "chq-1",
      "number": "000451",
      "party": "Sundaram Steel Suppliers",
      "amount": 480000,
      "type": "issued",
      "date": "2026-06-18",
      "status": "presented"
    },
    {
      "id": "chq-2",
      "number": "000452",
      "party": "Kaveri Logistics",
      "amount": 96000,
      "type": "issued",
      "date": "2026-06-15",
      "status": "cleared"
    },
    {
      "id": "chq-3",
      "number": "778201",
      "party": "Bharat Heavy Castings Pvt Ltd",
      "amount": 850000,
      "type": "received",
      "date": "2026-06-12",
      "status": "cleared"
    },
    {
      "id": "chq-4",
      "number": "000453",
      "party": "Tata Power Supply Co",
      "amount": 134500,
      "type": "issued",
      "date": "2026-06-20",
      "status": "issued"
    },
    {
      "id": "chq-5",
      "number": "445190",
      "party": "Sri Venkateswara Traders",
      "amount": 305000,
      "type": "received",
      "date": "2026-06-10",
      "status": "bounced"
    },
    {
      "id": "chq-6",
      "number": "000448",
      "party": "Office Lease - Brigade Estates",
      "amount": 225000,
      "type": "issued",
      "date": "2026-05-30",
      "status": "cancelled"
    }
  ],
  "bank-charge-disputes": [
    {
      "id": "dsp-1",
      "charge": "NEFT processing charges (bulk run)",
      "amount": 4720,
      "raisedOn": "2026-05-22",
      "status": "recovered"
    },
    {
      "id": "dsp-2",
      "charge": "Min-balance penalty - Current A/C",
      "amount": 1180,
      "raisedOn": "2026-06-02",
      "status": "open"
    },
    {
      "id": "dsp-3",
      "charge": "Cash handling charge",
      "amount": 2360,
      "raisedOn": "2026-04-18",
      "status": "rejected"
    },
    {
      "id": "dsp-4",
      "charge": "SMS alert charges (annual)",
      "amount": 708,
      "raisedOn": "2026-06-09",
      "status": "open"
    },
    {
      "id": "dsp-5",
      "charge": "Duplicate AMC debit on debit card",
      "amount": 590,
      "raisedOn": "2026-03-30",
      "status": "recovered"
    }
  ],
  "bank-positive-pay": [
    {
      "id": "pp-1",
      "number": "000451",
      "payee": "Sundaram Steel Suppliers",
      "amount": 480000,
      "date": "2026-06-18",
      "confirmed": true
    },
    {
      "id": "pp-2",
      "number": "000453",
      "payee": "Tata Power Supply Co",
      "amount": 134500,
      "date": "2026-06-20",
      "confirmed": false
    },
    {
      "id": "pp-3",
      "number": "000454",
      "payee": "Deccan Auto Components",
      "amount": 720000,
      "date": "2026-06-21",
      "confirmed": true
    },
    {
      "id": "pp-4",
      "number": "000455",
      "payee": "Malabar Industrial Supplies",
      "amount": 540000,
      "date": "2026-06-22",
      "confirmed": false
    },
    {
      "id": "pp-5",
      "number": "000456",
      "payee": "Brigade Estates LLP",
      "amount": 225000,
      "date": "2026-06-25",
      "confirmed": true
    }
  ],
  "bank-positive-pay-threshold": 500000,
  "bank-nach-mandates": [
    {
      "id": "nm-1",
      "ref": "HDFC0001234567890",
      "party": "Bajaj Finance - equipment loan",
      "amount": 168400,
      "frequency": "monthly",
      "nextDebit": "2026-06-27",
      "status": "active"
    },
    {
      "id": "nm-2",
      "ref": "ICIC0007654321098",
      "party": "TechSoft SaaS subscription",
      "amount": 24999,
      "frequency": "monthly",
      "nextDebit": "2026-07-01",
      "status": "active"
    },
    {
      "id": "nm-3",
      "ref": "SBIN0000456712345",
      "party": "Group health insurance premium",
      "amount": 142000,
      "frequency": "quarterly",
      "nextDebit": "2026-09-01",
      "status": "active"
    },
    {
      "id": "nm-4",
      "ref": "AXIS0009988776655",
      "party": "Annual ERP license",
      "amount": 360000,
      "frequency": "yearly",
      "nextDebit": "2027-01-15",
      "status": "paused"
    },
    {
      "id": "nm-5",
      "ref": "KKBK0001122334455",
      "party": "Generator AMC vendor",
      "amount": 18500,
      "frequency": "monthly",
      "nextDebit": "2026-06-28",
      "status": "cancelled"
    }
  ],
  "bank-bg-lc": [
    {
      "id": "bg-1",
      "type": "BG",
      "beneficiary": "Bharat Heavy Electricals Ltd (tender EMD)",
      "amount": 2500000,
      "expiry": "2026-12-31"
    },
    {
      "id": "bg-2",
      "type": "LC",
      "beneficiary": "Hindalco Industries - raw material",
      "amount": 1800000,
      "expiry": "2026-09-15"
    },
    {
      "id": "bg-3",
      "type": "BG",
      "beneficiary": "Karnataka Industrial Areas Board (lease)",
      "amount": 600000,
      "expiry": "2027-03-31"
    },
    {
      "id": "bg-4",
      "type": "LC",
      "beneficiary": "Jindal Steel & Power - import",
      "amount": 3200000,
      "expiry": "2026-08-20"
    },
    {
      "id": "bg-5",
      "type": "BG",
      "beneficiary": "BSNL performance guarantee",
      "amount": 450000,
      "expiry": "2026-11-10"
    }
  ],
  "bank-bg-lc-limit": 12000000,
  "bank-beneficiaries": [
    {
      "id": "ben-1",
      "name": "Sundaram Steel Suppliers",
      "account": "50100234567891",
      "ifsc": "HDFC0000123",
      "verified": true
    },
    {
      "id": "ben-2",
      "name": "Kaveri Logistics",
      "account": "62890011223344",
      "ifsc": "ICIC0001456",
      "verified": true
    },
    {
      "id": "ben-3",
      "name": "Deccan Auto Components",
      "account": "37011223344556",
      "ifsc": "SBIN0004567",
      "verified": true
    },
    {
      "id": "ben-4",
      "name": "Malabar Industrial Supplies",
      "account": "91201005678901",
      "ifsc": "AXIS0009988",
      "verified": false
    },
    {
      "id": "ben-5",
      "name": "Tata Power Supply Co",
      "account": "10456789012345",
      "ifsc": "KKBK0001122",
      "verified": true
    },
    {
      "id": "ben-6",
      "name": "Brigade Estates LLP",
      "account": "20034567891234",
      "ifsc": "YESB0000456",
      "verified": false
    }
  ],
  "bank-mab": [
    {
      "id": "mab-1",
      "name": "Current A/C - HDFC (main)",
      "required": 100000,
      "maintained": 4250000
    },
    {
      "id": "mab-2",
      "name": "Current A/C - ICICI (collections)",
      "required": 50000,
      "maintained": 38000
    },
    {
      "id": "mab-3",
      "name": "Current A/C - SBI (payroll)",
      "required": 75000,
      "maintained": 1860000
    },
    {
      "id": "mab-4",
      "name": "Current A/C - Axis (forex)",
      "required": 100000,
      "maintained": 92000
    },
    {
      "id": "mab-5",
      "name": "OD account - Kotak",
      "required": 25000,
      "maintained": 410000
    }
  ],
  "bank-mab-penalty": 60,
  "bank-fx-deals": [
    {
      "id": "fx-1",
      "ccy": "USD",
      "foreign": 25000,
      "inrReceived": 2087500,
      "refRate": 83.65,
      "date": "2026-05-12"
    },
    {
      "id": "fx-2",
      "ccy": "EUR",
      "foreign": 18000,
      "inrReceived": 1638000,
      "refRate": 91.2,
      "date": "2026-05-28"
    },
    {
      "id": "fx-3",
      "ccy": "USD",
      "foreign": 40000,
      "inrReceived": 3340000,
      "refRate": 83.7,
      "date": "2026-06-04"
    },
    {
      "id": "fx-4",
      "ccy": "GBP",
      "foreign": 12000,
      "inrReceived": 1272000,
      "refRate": 106.4,
      "date": "2026-06-11"
    },
    {
      "id": "fx-5",
      "ccy": "AED",
      "foreign": 90000,
      "inrReceived": 2043000,
      "refRate": 22.75,
      "date": "2026-06-16"
    }
  ],
  "bank-netting-parties": [
    {
      "id": "np-1",
      "name": "Bharat Heavy Castings Pvt Ltd",
      "receivable": 850000,
      "payable": 120000
    },
    {
      "id": "np-2",
      "name": "Deccan Auto Components",
      "receivable": 190000,
      "payable": 720000
    },
    {
      "id": "np-3",
      "name": "Coromandel Engineering Co",
      "receivable": 420000,
      "payable": 65000
    },
    {
      "id": "np-4",
      "name": "Malabar Industrial Supplies",
      "receivable": 0,
      "payable": 540000
    },
    {
      "id": "np-5",
      "name": "Sri Venkateswara Traders",
      "receivable": 610000,
      "payable": 305000
    }
  ],
  "bank-interest-certs": [
    {
      "id": "ic-1",
      "bank": "HDFC Bank",
      "type": "fd",
      "fy": "2025-26",
      "amount": 184000,
      "received": true
    },
    {
      "id": "ic-2",
      "bank": "ICICI Bank",
      "type": "loan",
      "fy": "2025-26",
      "amount": 412000,
      "received": false
    },
    {
      "id": "ic-3",
      "bank": "State Bank of India",
      "type": "savings",
      "fy": "2025-26",
      "amount": 28500,
      "received": true
    },
    {
      "id": "ic-4",
      "bank": "Kotak Mahindra Bank",
      "type": "od",
      "fy": "2025-26",
      "amount": 156000,
      "received": false
    },
    {
      "id": "ic-5",
      "bank": "Axis Bank",
      "type": "fd",
      "fy": "2024-25",
      "amount": 97000,
      "received": true
    }
  ],
  "bank-acopen-checklist": {
    "pan-card": true,
    "gst-certificate": true,
    "certificate-of-incorporation": true,
    "board-resolution": true,
    "address-proof": false,
    "director-kyc": false
  },
  "bank-clearing-tat": [
    {
      "id": "cl-1",
      "instrument": "local-cheque",
      "ref": "778201",
      "amount": 850000,
      "depositDate": "2026-06-12"
    },
    {
      "id": "cl-2",
      "instrument": "outstation-cheque",
      "ref": "445190",
      "amount": 305000,
      "depositDate": "2026-06-10"
    },
    {
      "id": "cl-3",
      "instrument": "neft-inward",
      "ref": "HDFCN26061734521",
      "amount": 420000,
      "depositDate": "2026-06-17"
    },
    {
      "id": "cl-4",
      "instrument": "atm-deposit",
      "ref": "ATM-BLR-00982",
      "amount": 75000,
      "depositDate": "2026-06-19"
    },
    {
      "id": "cl-5",
      "instrument": "local-cheque",
      "ref": "112045",
      "amount": 190000,
      "depositDate": "2026-06-20"
    }
  ],
  "bank-od-renewals": [
    {
      "id": "od-1",
      "bank": "Kotak Mahindra Bank",
      "type": "cc",
      "limit": 10000000,
      "renewalDate": "2026-09-30"
    },
    {
      "id": "od-2",
      "bank": "HDFC Bank",
      "type": "od",
      "limit": 5000000,
      "renewalDate": "2026-07-15"
    },
    {
      "id": "od-3",
      "bank": "ICICI Bank",
      "type": "cc",
      "limit": 7500000,
      "renewalDate": "2026-12-01"
    },
    {
      "id": "od-4",
      "bank": "Axis Bank",
      "type": "od",
      "limit": 3000000,
      "renewalDate": "2026-08-22"
    }
  ],
  "bank-scorecard": [
    {
      "id": "bs-1",
      "bank": "HDFC Bank",
      "rate": 8.6,
      "fee": 25000,
      "service": 8,
      "utilization": 62
    },
    {
      "id": "bs-2",
      "bank": "ICICI Bank",
      "rate": 9.1,
      "fee": 18000,
      "service": 7,
      "utilization": 48
    },
    {
      "id": "bs-3",
      "bank": "Kotak Mahindra Bank",
      "rate": 8.9,
      "fee": 32000,
      "service": 9,
      "utilization": 71
    },
    {
      "id": "bs-4",
      "bank": "State Bank of India",
      "rate": 8.4,
      "fee": 12000,
      "service": 6,
      "utilization": 35
    },
    {
      "id": "bs-5",
      "bank": "Axis Bank",
      "rate": 9.4,
      "fee": 22000,
      "service": 7,
      "utilization": 55
    }
  ],
  "pay-mandates": [
    {
      "id": "pm-1",
      "customer": "Nilkamal Distributors",
      "cap": 300000,
      "frequency": "monthly",
      "nextDebit": "2026-07-05",
      "rail": "upi-autopay",
      "status": "active"
    },
    {
      "id": "pm-2",
      "customer": "Coromandel Engineering Co",
      "cap": 500000,
      "frequency": "quarterly",
      "nextDebit": "2026-09-01",
      "rail": "enach",
      "status": "active"
    },
    {
      "id": "pm-3",
      "customer": "Sri Venkateswara Traders",
      "cap": 150000,
      "frequency": "monthly",
      "nextDebit": "2026-07-02",
      "rail": "card-si",
      "status": "paused"
    },
    {
      "id": "pm-4",
      "customer": "Deccan Auto Components",
      "cap": 250000,
      "frequency": "as-presented",
      "nextDebit": "2026-06-30",
      "rail": "enach",
      "status": "active"
    },
    {
      "id": "pm-5",
      "customer": "Malabar Industrial Supplies",
      "cap": 200000,
      "frequency": "yearly",
      "nextDebit": "2027-01-10",
      "rail": "upi-autopay",
      "status": "revoked"
    }
  ],
  "pay-refunds": [
    {
      "id": "rf-1",
      "customer": "Nilkamal Distributors",
      "orderRef": "ORD-20451",
      "amount": 12500,
      "reason": "Short delivery - 2 units missing",
      "requested": "2026-06-14",
      "status": "processed"
    },
    {
      "id": "rf-2",
      "customer": "Sri Venkateswara Traders",
      "orderRef": "ORD-20488",
      "amount": 8400,
      "reason": "Damaged goods on arrival",
      "requested": "2026-06-17",
      "status": "pending"
    },
    {
      "id": "rf-3",
      "customer": "Deccan Auto Components",
      "orderRef": "ORD-20502",
      "amount": 31000,
      "reason": "Duplicate payment",
      "requested": "2026-06-10",
      "status": "processed"
    },
    {
      "id": "rf-4",
      "customer": "Coromandel Engineering Co",
      "orderRef": "ORD-20519",
      "amount": 5600,
      "reason": "Order cancelled before dispatch",
      "requested": "2026-06-19",
      "status": "rejected"
    },
    {
      "id": "rf-5",
      "customer": "Bharat Heavy Castings Pvt Ltd",
      "orderRef": "ORD-20533",
      "amount": 47800,
      "reason": "Price correction post-invoice",
      "requested": "2026-06-20",
      "status": "pending"
    }
  ],
  "pay-settlements": [
    {
      "id": "bt-1",
      "date": "2026-06-15",
      "gross": 1240000,
      "mdrPct": 1.8,
      "payoutReceived": 1217680
    },
    {
      "id": "bt-2",
      "date": "2026-06-16",
      "gross": 985000,
      "mdrPct": 1.8,
      "payoutReceived": 967270
    },
    {
      "id": "bt-3",
      "date": "2026-06-17",
      "gross": 1530000,
      "mdrPct": 2,
      "payoutReceived": 1499400
    },
    {
      "id": "bt-4",
      "date": "2026-06-18",
      "gross": 760000,
      "mdrPct": 1.5,
      "payoutReceived": 748600
    },
    {
      "id": "bt-5",
      "date": "2026-06-19",
      "gross": 2100000,
      "mdrPct": 1.9,
      "payoutReceived": 2060100
    },
    {
      "id": "bt-6",
      "date": "2026-06-20",
      "gross": 1340000,
      "mdrPct": 1.8,
      "payoutReceived": 1315880
    }
  ],
  "pay-attempts": [
    {
      "id": "at-1",
      "method": "UPI",
      "status": "success",
      "amount": 24999,
      "ts": "2026-06-20T10:14:00+05:30"
    },
    {
      "id": "at-2",
      "method": "Card",
      "status": "failed",
      "amount": 45000,
      "declineReason": "Insufficient funds",
      "ts": "2026-06-20T11:02:00+05:30"
    },
    {
      "id": "at-3",
      "method": "Netbanking",
      "status": "success",
      "amount": 180000,
      "ts": "2026-06-20T12:30:00+05:30"
    },
    {
      "id": "at-4",
      "method": "UPI",
      "status": "failed",
      "amount": 9999,
      "declineReason": "Bank server timeout",
      "ts": "2026-06-20T13:45:00+05:30"
    },
    {
      "id": "at-5",
      "method": "Card",
      "status": "failed",
      "amount": 62000,
      "declineReason": "3DS authentication failed",
      "ts": "2026-06-20T15:20:00+05:30"
    },
    {
      "id": "at-6",
      "method": "UPI",
      "status": "success",
      "amount": 14500,
      "ts": "2026-06-21T09:05:00+05:30"
    }
  ],
  "pay-bulk-payees": [
    {
      "id": "bp-1",
      "name": "Sundaram Steel Suppliers",
      "account": "50100234567891",
      "ifsc": "HDFC0000123",
      "amount": 480000
    },
    {
      "id": "bp-2",
      "name": "Kaveri Logistics",
      "account": "62890011223344",
      "ifsc": "ICIC0001456",
      "amount": 96000
    },
    {
      "id": "bp-3",
      "name": "Deccan Auto Components",
      "account": "37011223344556",
      "ifsc": "SBIN0004567",
      "amount": 720000
    },
    {
      "id": "bp-4",
      "name": "Ravi Kumar (contract labour)",
      "account": "91201005678901",
      "ifsc": "AXIS0009988",
      "amount": 28500
    },
    {
      "id": "bp-5",
      "name": "Lakshmi Enterprises",
      "account": "10456789012345",
      "ifsc": "KKBK0001122",
      "amount": 134500
    },
    {
      "id": "bp-6",
      "name": "Brigade Estates LLP",
      "account": "20034567891234",
      "ifsc": "YESB0000456",
      "amount": 225000
    }
  ],
  "pay-reminders": [
    {
      "id": "rm-1",
      "customer": "Nilkamal Distributors",
      "amount": 275000,
      "dueDate": "2026-06-28",
      "channel": "whatsapp",
      "cadence": "3-day",
      "done": false
    },
    {
      "id": "rm-2",
      "customer": "Malabar Industrial Supplies",
      "amount": 540000,
      "dueDate": "2026-06-25",
      "channel": "email",
      "cadence": "weekly",
      "done": false
    },
    {
      "id": "rm-3",
      "customer": "Sri Venkateswara Traders",
      "amount": 305000,
      "dueDate": "2026-06-22",
      "channel": "sms",
      "cadence": "once",
      "done": true
    },
    {
      "id": "rm-4",
      "customer": "Coromandel Engineering Co",
      "amount": 65000,
      "dueDate": "2026-07-01",
      "channel": "whatsapp",
      "cadence": "3-day",
      "done": false
    },
    {
      "id": "rm-5",
      "customer": "Deccan Auto Components",
      "amount": 190000,
      "dueDate": "2026-06-30",
      "channel": "whatsapp",
      "cadence": "weekly",
      "done": false
    }
  ],
  "pay-disputes": [
    {
      "id": "dr-1",
      "customer": "Online buyer - Rohit S",
      "orderRef": "ORD-20461",
      "amount": 18500,
      "raised": "2026-06-08",
      "deadline": "2026-06-22",
      "stage": "evidence-sent"
    },
    {
      "id": "dr-2",
      "customer": "Online buyer - Anita M",
      "orderRef": "ORD-20479",
      "amount": 6200,
      "raised": "2026-06-12",
      "deadline": "2026-06-26",
      "stage": "received"
    },
    {
      "id": "dr-3",
      "customer": "Online buyer - Faisal K",
      "orderRef": "ORD-20444",
      "amount": 42000,
      "raised": "2026-05-30",
      "deadline": "2026-06-14",
      "stage": "won"
    },
    {
      "id": "dr-4",
      "customer": "Online buyer - Priya R",
      "orderRef": "ORD-20420",
      "amount": 9900,
      "raised": "2026-05-25",
      "deadline": "2026-06-09",
      "stage": "lost"
    },
    {
      "id": "dr-5",
      "customer": "Online buyer - Sanjay T",
      "orderRef": "ORD-20495",
      "amount": 27500,
      "raised": "2026-06-16",
      "deadline": "2026-06-30",
      "stage": "evidence-sent"
    }
  ],
  "pay-forecast-sales": [
    {
      "id": "fs-1",
      "date": "2026-06-15",
      "gross": 1240000,
      "instrument": "upi"
    },
    {
      "id": "fs-2",
      "date": "2026-06-16",
      "gross": 985000,
      "instrument": "card"
    },
    {
      "id": "fs-3",
      "date": "2026-06-17",
      "gross": 1530000,
      "instrument": "netbanking"
    },
    {
      "id": "fs-4",
      "date": "2026-06-18",
      "gross": 760000,
      "instrument": "upi"
    },
    {
      "id": "fs-5",
      "date": "2026-06-19",
      "gross": 2100000,
      "instrument": "card"
    },
    {
      "id": "fs-6",
      "date": "2026-06-20",
      "gross": 1340000,
      "instrument": "upi"
    }
  ],
  "pay-utr": [
    {
      "id": "ut-1",
      "utr": "HDFCN26061712345678",
      "amount": 850000,
      "expected": true,
      "note": "Bharat Heavy Castings - inv 1042"
    },
    {
      "id": "ut-2",
      "utr": "ICICR26061598765432",
      "amount": 420000,
      "expected": true,
      "note": "Coromandel Engineering - inv 1051"
    },
    {
      "id": "ut-3",
      "utr": "SBIN26061455667788",
      "amount": 73000,
      "expected": false,
      "note": "Unidentified inward credit"
    },
    {
      "id": "ut-4",
      "utr": "AXISP26061633445566",
      "amount": 305000,
      "expected": true,
      "note": "Sri Venkateswara - part payment"
    },
    {
      "id": "ut-5",
      "utr": "KKBKU26061722334455",
      "amount": 190000,
      "expected": true,
      "note": "Deccan Auto Components - inv 1058"
    }
  ],
  "pay-nach": [
    {
      "id": "nr-1",
      "umrn": "HDFC00002604261234567",
      "customer": "Nilkamal Distributors",
      "amount": 275000,
      "freq": "monthly",
      "sponsorBank": "HDFC Bank",
      "debitBank": "ICICI Bank",
      "mode": "e-mandate",
      "start": "2026-04-01",
      "end": "2027-03-31",
      "status": "active"
    },
    {
      "id": "nr-2",
      "umrn": "ICIC00007612260987654",
      "customer": "Coromandel Engineering Co",
      "amount": 500000,
      "freq": "quarterly",
      "sponsorBank": "ICICI Bank",
      "debitBank": "SBI",
      "mode": "e-mandate",
      "start": "2026-01-01",
      "end": "2028-12-31",
      "status": "active"
    },
    {
      "id": "nr-3",
      "umrn": "SBIN00004512260456789",
      "customer": "Sri Venkateswara Traders",
      "amount": 150000,
      "freq": "monthly",
      "sponsorBank": "SBI",
      "debitBank": "Axis Bank",
      "mode": "physical",
      "start": "2026-05-15",
      "end": "2027-05-14",
      "status": "pending"
    },
    {
      "id": "nr-4",
      "umrn": "AXIS00009912260112233",
      "customer": "Deccan Auto Components",
      "amount": 250000,
      "freq": "half-yearly",
      "sponsorBank": "Axis Bank",
      "debitBank": "Kotak",
      "mode": "e-mandate",
      "start": "2026-02-01",
      "end": "2029-01-31",
      "status": "active"
    },
    {
      "id": "nr-5",
      "umrn": "KKBK00001112260998877",
      "customer": "Malabar Industrial Supplies",
      "amount": 200000,
      "freq": "yearly",
      "sponsorBank": "Kotak Bank",
      "debitBank": "HDFC Bank",
      "mode": "physical",
      "start": "2025-12-01",
      "end": "2026-11-30",
      "status": "rejected"
    }
  ],
  "pay-dunning": [
    {
      "id": "d1",
      "dayOffset": 0,
      "channel": "upi-autopay",
      "action": "Auto re-present mandate (T+0)"
    },
    {
      "id": "d2",
      "dayOffset": 1,
      "channel": "whatsapp",
      "action": "WhatsApp: 'Payment failed — tap to pay now'"
    },
    {
      "id": "d3",
      "dayOffset": 3,
      "channel": "upi-autopay",
      "action": "Second re-presentment after payday window"
    },
    {
      "id": "d4",
      "dayOffset": 5,
      "channel": "sms",
      "action": "SMS with fresh payment link"
    },
    {
      "id": "d5",
      "dayOffset": 7,
      "channel": "call",
      "action": "Human call + pause/cancel offer"
    }
  ],
  "pay-vaccounts": [
    {
      "id": "vr-1",
      "customer": "Bharat Heavy Castings Pvt Ltd",
      "vpaHandle": "acme.bharat@hdfcbank",
      "ifsc": "HDFC0000123",
      "accountNo": "ACME2049817631"
    },
    {
      "id": "vr-2",
      "customer": "Coromandel Engineering Co",
      "vpaHandle": "acme.coromandel@hdfcbank",
      "ifsc": "HDFC0000123",
      "accountNo": "ACME3318074502"
    },
    {
      "id": "vr-3",
      "customer": "Nilkamal Distributors",
      "vpaHandle": "acme.nilkamal@hdfcbank",
      "ifsc": "HDFC0000123",
      "accountNo": "ACME5572910384"
    },
    {
      "id": "vr-4",
      "customer": "Sri Venkateswara Traders",
      "vpaHandle": "acme.venkateswara@hdfcbank",
      "ifsc": "HDFC0000123",
      "accountNo": "ACME6640183927"
    },
    {
      "id": "vr-5",
      "customer": "Deccan Auto Components",
      "vpaHandle": "acme.deccan@hdfcbank",
      "ifsc": "HDFC0000123",
      "accountNo": "ACME7791026458"
    }
  ],
  "pay-verify": [
    {
      "id": "vf-1",
      "payee": "Sundaram Steel Suppliers",
      "type": "bank",
      "identifier": "50100234567891",
      "ifsc": "HDFC0000123",
      "nameAtBank": "SUNDARAM STEEL SUPPLIERS",
      "checked": "2026-06-18",
      "result": "verified"
    },
    {
      "id": "vf-2",
      "payee": "Kaveri Logistics",
      "type": "vpa",
      "identifier": "kaveri.logistics@okicici",
      "ifsc": "",
      "nameAtBank": "KAVERI LOGISTICS PVT LTD",
      "checked": "2026-06-19",
      "result": "verified"
    },
    {
      "id": "vf-3",
      "payee": "Malabar Industrial Supplies",
      "type": "bank",
      "identifier": "91201005678901",
      "ifsc": "AXIS0009988",
      "nameAtBank": "MALABAR IND SUPP",
      "checked": "2026-06-20",
      "result": "name-mismatch"
    },
    {
      "id": "vf-4",
      "payee": "Ravi Kumar",
      "type": "vpa",
      "identifier": "ravikumar@oksbi",
      "ifsc": "",
      "nameAtBank": "RAVI KUMAR",
      "checked": "2026-06-20",
      "result": "verified"
    },
    {
      "id": "vf-5",
      "payee": "Lakshmi Enterprises",
      "type": "bank",
      "identifier": "10456789012345",
      "ifsc": "KKBK0001122",
      "nameAtBank": "",
      "checked": "2026-06-21",
      "result": "invalid"
    }
  ],
  "pay-dupe-entries": [
    {
      "id": "de-1",
      "ref": "INV-1042",
      "customer": "Bharat Heavy Castings Pvt Ltd",
      "amount": 850000,
      "date": "2026-06-12"
    },
    {
      "id": "de-2",
      "ref": "INV-1042",
      "customer": "Bharat Heavy Castings Pvt Ltd",
      "amount": 850000,
      "date": "2026-06-13"
    },
    {
      "id": "de-3",
      "ref": "INV-1051",
      "customer": "Coromandel Engineering Co",
      "amount": 420000,
      "date": "2026-06-17"
    },
    {
      "id": "de-4",
      "ref": "INV-1058",
      "customer": "Deccan Auto Components",
      "amount": 190000,
      "date": "2026-06-20"
    },
    {
      "id": "de-5",
      "ref": "INV-1063",
      "customer": "Sri Venkateswara Traders",
      "amount": 305000,
      "date": "2026-06-10"
    },
    {
      "id": "de-6",
      "ref": "INV-1063",
      "customer": "Sri Venkateswara Traders",
      "amount": 305000,
      "date": "2026-06-11"
    }
  ],
  "pay-feetiers": [
    {
      "id": "ft-1",
      "upto": 100000,
      "ratePct": 2
    },
    {
      "id": "ft-2",
      "upto": 500000,
      "ratePct": 1.8
    },
    {
      "id": "ft-3",
      "upto": 2000000,
      "ratePct": 1.5
    },
    {
      "id": "ft-4",
      "upto": 10000000,
      "ratePct": 1.2
    }
  ],
  "pay-alloc-invoices": [
    {
      "id": "ai-1",
      "number": "INV-1042",
      "due": 850000
    },
    {
      "id": "ai-2",
      "number": "INV-1051",
      "due": 420000
    },
    {
      "id": "ai-3",
      "number": "INV-1058",
      "due": 190000
    },
    {
      "id": "ai-4",
      "number": "INV-1063",
      "due": 305000
    },
    {
      "id": "ai-5",
      "number": "INV-1071",
      "due": 540000
    }
  ],
  "pay-reserves": [
    {
      "id": "rs-1",
      "month": "2026-03",
      "gross": 28500000,
      "reservePct": 5,
      "releaseMonth": "2026-09"
    },
    {
      "id": "rs-2",
      "month": "2026-04",
      "gross": 31200000,
      "reservePct": 5,
      "releaseMonth": "2026-10"
    },
    {
      "id": "rs-3",
      "month": "2026-05",
      "gross": 29800000,
      "reservePct": 5,
      "releaseMonth": "2026-11"
    },
    {
      "id": "rs-4",
      "month": "2026-06",
      "gross": 33600000,
      "reservePct": 5,
      "releaseMonth": "2026-12"
    }
  ],
  "pay-downtime": [
    {
      "id": "dt-1",
      "method": "UPI",
      "start": "2026-06-10T14:00:00+05:30",
      "minutes": 45,
      "failedTxns": 38,
      "lostValue": 462000
    },
    {
      "id": "dt-2",
      "method": "Card",
      "start": "2026-06-14T19:30:00+05:30",
      "minutes": 90,
      "failedTxns": 22,
      "lostValue": 318000
    },
    {
      "id": "dt-3",
      "method": "Netbanking",
      "start": "2026-06-18T11:15:00+05:30",
      "minutes": 30,
      "failedTxns": 12,
      "lostValue": 540000
    },
    {
      "id": "dt-4",
      "method": "UPI",
      "start": "2026-06-20T22:00:00+05:30",
      "minutes": 60,
      "failedTxns": 51,
      "lostValue": 612000
    }
  ],
  "pay-tds": [
    {
      "id": "td-1",
      "date": "2026-06-15",
      "source": "Razorpay gateway commission",
      "gross": 22320,
      "tdsPct": 2
    },
    {
      "id": "td-2",
      "date": "2026-06-16",
      "source": "Kaveri Logistics - transport",
      "gross": 96000,
      "tdsPct": 2
    },
    {
      "id": "td-3",
      "date": "2026-06-17",
      "source": "TechSoft - professional fees",
      "gross": 75000,
      "tdsPct": 10
    },
    {
      "id": "td-4",
      "date": "2026-06-18",
      "source": "Brigade Estates - office rent",
      "gross": 225000,
      "tdsPct": 10
    },
    {
      "id": "td-5",
      "date": "2026-06-19",
      "source": "Ravi Kumar - contract work",
      "gross": 28500,
      "tdsPct": 1
    }
  ],
  "pay-preauth": [
    {
      "id": "ha-1",
      "customer": "Nilkamal Distributors",
      "held": 50000,
      "placed": "2026-06-16",
      "expiryDays": 7,
      "status": "held"
    },
    {
      "id": "ha-2",
      "customer": "Sri Venkateswara Traders",
      "held": 30000,
      "placed": "2026-06-12",
      "expiryDays": 5,
      "status": "captured"
    },
    {
      "id": "ha-3",
      "customer": "Deccan Auto Components",
      "held": 75000,
      "placed": "2026-06-10",
      "expiryDays": 7,
      "status": "released"
    },
    {
      "id": "ha-4",
      "customer": "Coromandel Engineering Co",
      "held": 120000,
      "placed": "2026-06-18",
      "expiryDays": 10,
      "status": "held"
    },
    {
      "id": "ha-5",
      "customer": "Malabar Industrial Supplies",
      "held": 45000,
      "placed": "2026-06-19",
      "expiryDays": 7,
      "status": "held"
    }
  ],
  "pay-fee-gst": [
    {
      "id": "fg-1",
      "month": "2026-03",
      "gateway": "Razorpay",
      "feeBase": 512000,
      "gstPct": 18
    },
    {
      "id": "fg-2",
      "month": "2026-04",
      "gateway": "Razorpay",
      "feeBase": 561600,
      "gstPct": 18
    },
    {
      "id": "fg-3",
      "month": "2026-05",
      "gateway": "PayU",
      "feeBase": 536400,
      "gstPct": 18
    },
    {
      "id": "fg-4",
      "month": "2026-06",
      "gateway": "Razorpay",
      "feeBase": 604800,
      "gstPct": 18
    }
  ],
  "pay-pennydrop": [
    {
      "id": "pn-1",
      "payee": "Sundaram Steel Suppliers",
      "account": "50100234567891",
      "ifsc": "HDFC0000123",
      "nameAtBank": "SUNDARAM STEEL SUPPLIERS",
      "status": "verified",
      "ts": "2026-06-18T10:00:00+05:30"
    },
    {
      "id": "pn-2",
      "payee": "Kaveri Logistics",
      "account": "62890011223344",
      "ifsc": "ICIC0001456",
      "nameAtBank": "KAVERI LOGISTICS PVT LTD",
      "status": "verified",
      "ts": "2026-06-18T10:05:00+05:30"
    },
    {
      "id": "pn-3",
      "payee": "Malabar Industrial Supplies",
      "account": "91201005678901",
      "ifsc": "AXIS0009988",
      "nameAtBank": "MALABAR IND SUPP",
      "status": "mismatch",
      "ts": "2026-06-19T11:30:00+05:30"
    },
    {
      "id": "pn-4",
      "payee": "Lakshmi Enterprises",
      "account": "10456789012345",
      "ifsc": "KKBK0001122",
      "nameAtBank": "",
      "status": "failed",
      "ts": "2026-06-20T09:15:00+05:30"
    },
    {
      "id": "pn-5",
      "payee": "Deccan Auto Components",
      "account": "37011223344556",
      "ifsc": "SBIN0004567",
      "nameAtBank": "DECCAN AUTO COMPONENTS",
      "status": "verified",
      "ts": "2026-06-20T14:45:00+05:30"
    }
  ],
  "pay-approvals": [
    {
      "id": "ap-1",
      "payee": "Deccan Auto Components",
      "amount": 720000,
      "purpose": "Raw material - June order",
      "requestedBy": "Suresh (Procurement)",
      "ts": "2026-06-20T09:30:00+05:30",
      "status": "pending"
    },
    {
      "id": "ap-2",
      "payee": "Brigade Estates LLP",
      "amount": 225000,
      "purpose": "Office rent - June",
      "requestedBy": "Meena (Accounts)",
      "ts": "2026-06-19T16:00:00+05:30",
      "status": "approved"
    },
    {
      "id": "ap-3",
      "payee": "Sundaram Steel Suppliers",
      "amount": 480000,
      "purpose": "PDC replacement",
      "requestedBy": "Suresh (Procurement)",
      "ts": "2026-06-18T14:20:00+05:30",
      "status": "approved"
    },
    {
      "id": "ap-4",
      "payee": "TechSoft Solutions",
      "amount": 360000,
      "purpose": "ERP annual renewal",
      "requestedBy": "Arjun (IT)",
      "ts": "2026-06-20T11:10:00+05:30",
      "status": "pending"
    },
    {
      "id": "ap-5",
      "payee": "Unknown vendor (no GST)",
      "amount": 95000,
      "purpose": "Misc consultancy",
      "requestedBy": "Kiran (Ops)",
      "ts": "2026-06-17T13:00:00+05:30",
      "status": "rejected"
    }
  ],
  "pay-approval-threshold": 100000,
  "pay-recovery": [
    {
      "id": "rc-1",
      "label": "Card - insufficient funds",
      "failedCount": 42,
      "failedValue": 1260000,
      "recoveredCount": 31
    },
    {
      "id": "rc-2",
      "label": "UPI - bank timeout",
      "failedCount": 58,
      "failedValue": 870000,
      "recoveredCount": 52
    },
    {
      "id": "rc-3",
      "label": "eNACH - mandate inactive",
      "failedCount": 19,
      "failedValue": 950000,
      "recoveredCount": 8
    },
    {
      "id": "rc-4",
      "label": "Card - 3DS auth failed",
      "failedCount": 27,
      "failedValue": 648000,
      "recoveredCount": 14
    },
    {
      "id": "rc-5",
      "label": "Netbanking - session expired",
      "failedCount": 11,
      "failedValue": 495000,
      "recoveredCount": 9
    }
  ],
  "pay-tip-staff": [
    {
      "id": "ts-1",
      "name": "Ramesh Iyer",
      "shares": 3
    },
    {
      "id": "ts-2",
      "name": "Sunita Devi",
      "shares": 2
    },
    {
      "id": "ts-3",
      "name": "Vijay Nair",
      "shares": 2
    },
    {
      "id": "ts-4",
      "name": "Anil Gupta",
      "shares": 1
    },
    {
      "id": "ts-5",
      "name": "Pooja Sharma",
      "shares": 2
    }
  ],
  "connector-bank-upi-feeds": [
    {
      "id": "feed-hdfc-01",
      "fipName": "HDFC Bank",
      "vpa": "acme@okhdfcbank",
      "consentStatus": "active",
      "lastSync": "2026-06-21T09:12:00.000Z",
      "txnPulled": 184,
      "connectedAt": "2026-01-15T06:30:00.000Z"
    },
    {
      "id": "feed-icici-02",
      "fipName": "ICICI Bank",
      "vpa": "acmemfg@okicici",
      "consentStatus": "active",
      "lastSync": "2026-06-20T18:45:00.000Z",
      "txnPulled": 96,
      "connectedAt": "2026-02-03T10:15:00.000Z"
    },
    {
      "id": "feed-axis-03",
      "fipName": "Axis Bank",
      "vpa": "acme.payments@okaxis",
      "consentStatus": "pending",
      "lastSync": null,
      "txnPulled": 0,
      "connectedAt": "2026-06-19T11:05:00.000Z"
    },
    {
      "id": "feed-sbi-04",
      "fipName": "State Bank of India",
      "vpa": "acme@oksbi",
      "consentStatus": "active",
      "lastSync": "2026-06-18T07:20:00.000Z",
      "txnPulled": 142,
      "connectedAt": "2025-11-22T08:00:00.000Z"
    },
    {
      "id": "feed-kotak-05",
      "fipName": "Kotak Mahindra Bank",
      "vpa": "",
      "consentStatus": "revoked",
      "lastSync": "2026-05-10T14:30:00.000Z",
      "txnPulled": 51,
      "connectedAt": "2025-12-01T09:45:00.000Z"
    }
  ],
  "connector-ecom-batches": [
    {
      "id": "batch-amz-01",
      "marketplace": "Amazon",
      "importedAt": "2026-06-15T05:40:00.000Z",
      "orders": [
        {
          "orderId": "403-1234567-8901234",
          "sku": "ACM-VALVE-M8",
          "qty": 4,
          "gross": 4796,
          "fees": 862,
          "net": 3934
        },
        {
          "orderId": "404-2345678-9012345",
          "sku": "ACM-BEARING-22",
          "qty": 2,
          "gross": 2998,
          "fees": 539,
          "net": 2459
        },
        {
          "orderId": "405-3456789-0123456",
          "sku": "ACM-GASKET-KIT",
          "qty": 6,
          "gross": 1794,
          "fees": 322,
          "net": 1472
        }
      ]
    },
    {
      "id": "batch-flip-02",
      "marketplace": "Flipkart",
      "importedAt": "2026-06-10T06:10:00.000Z",
      "orders": [
        {
          "orderId": "OD118273645900112",
          "sku": "ACM-PUMP-1HP",
          "qty": 1,
          "gross": 8499,
          "fees": 1487,
          "net": 7012
        },
        {
          "orderId": "OD118273645900113",
          "sku": "ACM-VALVE-M8",
          "qty": 3,
          "gross": 3597,
          "fees": 629,
          "net": 2968
        }
      ]
    },
    {
      "id": "batch-mee-03",
      "marketplace": "Meesho",
      "importedAt": "2026-06-05T04:55:00.000Z",
      "orders": [
        {
          "orderId": "MEE-9087612",
          "sku": "ACM-GASKET-KIT",
          "qty": 10,
          "gross": 2990,
          "fees": 448,
          "net": 2542
        },
        {
          "orderId": "MEE-9087613",
          "sku": "ACM-CLAMP-S",
          "qty": 8,
          "gross": 1592,
          "fees": 239,
          "net": 1353
        }
      ]
    }
  ],
  "connector-sync-incidents": [
    {
      "connectorId": "conn-razorpay-01",
      "failedAt": "2026-06-20T22:14:00.000Z",
      "reason": "Gateway webhook timeout"
    },
    {
      "connectorId": "conn-aa-02",
      "failedAt": "2026-06-19T03:40:00.000Z",
      "reason": "AA consent expired"
    },
    {
      "connectorId": "conn-tally-03",
      "failedAt": "2026-06-17T19:05:00.000Z",
      "reason": "Auth token revoked"
    },
    {
      "connectorId": "conn-stripe-04",
      "failedAt": "2026-06-21T01:22:00.000Z",
      "reason": "Rate limit exceeded"
    }
  ],
  "conn-catalog-connected": {
    "razorpay": "2026-01-10T08:30:00.000Z",
    "zoho_books": "2026-02-14T11:00:00.000Z",
    "stripe": "2026-03-02T07:45:00.000Z",
    "phonepe": "2026-04-21T13:20:00.000Z"
  },
  "conn-schedules": {
    "conn-razorpay-01": {
      "freq": "hourly",
      "hour": 0,
      "enabled": true
    },
    "conn-aa-02": {
      "freq": "daily",
      "hour": 9,
      "enabled": true
    },
    "conn-tally-03": {
      "freq": "weekly",
      "hour": 7,
      "enabled": true
    },
    "conn-stripe-04": {
      "freq": "daily",
      "hour": 18,
      "enabled": false
    }
  },
  "conn-field-maps": {
    "Razorpay": {
      "settlement_amount": "amount",
      "settled_at": "date",
      "description": "description",
      "contact_name": "counterparty",
      "rzp_payment_id": "reference"
    },
    "Zoho Books": {
      "total": "amount",
      "invoice_date": "date",
      "vendor_name": "counterparty",
      "account_name": "category"
    },
    "Stripe": {
      "amount_captured": "amount",
      "created": "date",
      "customer_name": "counterparty",
      "charge_id": "reference"
    }
  },
  "conn-credentials": [
    {
      "id": "cred-01",
      "connector": "Razorpay",
      "keyName": "rzp_live_key",
      "secret": "rzp_live_8aK29sLmPq7Xz4Wv",
      "addedAt": "2026-01-10T08:31:00.000Z"
    },
    {
      "id": "cred-02",
      "connector": "Stripe",
      "keyName": "stripe_secret",
      "secret": "sk_live_51Hb29Lk8Qm3Rt6Yw0Zx",
      "addedAt": "2026-03-02T07:46:00.000Z"
    },
    {
      "id": "cred-03",
      "connector": "Zoho Books",
      "keyName": "zoho_oauth_token",
      "secret": "1000.a1b2c3d4e5f6g7h8i9j0",
      "addedAt": "2026-02-14T11:01:00.000Z"
    },
    {
      "id": "cred-04",
      "connector": "PhonePe",
      "keyName": "phonepe_merchant_key",
      "secret": "PGTESTPAYUAT-99201ZxMnB7",
      "addedAt": "2026-04-21T13:21:00.000Z"
    }
  ],
  "conn-webhooks": [
    {
      "id": "wh-01",
      "label": "Razorpay payments",
      "url": "https://api.acmemfg.in/hooks/razorpay",
      "events": "payment.captured, refund.created",
      "lastPing": "2026-06-21T08:00:00.000Z",
      "lastStatus": 200
    },
    {
      "id": "wh-02",
      "label": "Stripe charges",
      "url": "https://api.acmemfg.in/hooks/stripe",
      "events": "charge.succeeded, payout.paid",
      "lastPing": "2026-06-20T20:30:00.000Z",
      "lastStatus": 200
    },
    {
      "id": "wh-03",
      "label": "Shiprocket status",
      "url": "https://api.acmemfg.in/hooks/shiprocket",
      "events": "shipment.delivered, shipment.rto",
      "lastPing": "2026-06-19T15:10:00.000Z",
      "lastStatus": 500
    },
    {
      "id": "wh-04",
      "label": "GSTN IRN callback",
      "url": "https://api.acmemfg.in/hooks/einvoice",
      "events": "irn.generated",
      "lastPing": null,
      "lastStatus": null
    }
  ],
  "conn-sync-history": [
    {
      "id": "se-01",
      "connector": "Razorpay",
      "at": "2026-06-21T09:00:00.000Z",
      "records": 42,
      "outcome": "success"
    },
    {
      "id": "se-02",
      "connector": "AA Network",
      "at": "2026-06-21T08:45:00.000Z",
      "records": 18,
      "outcome": "partial"
    },
    {
      "id": "se-03",
      "connector": "Tally ERP",
      "at": "2026-06-20T07:00:00.000Z",
      "records": 0,
      "outcome": "failed"
    },
    {
      "id": "se-04",
      "connector": "Stripe",
      "at": "2026-06-20T18:30:00.000Z",
      "records": 27,
      "outcome": "success"
    },
    {
      "id": "se-05",
      "connector": "Zoho Books",
      "at": "2026-06-19T12:15:00.000Z",
      "records": 55,
      "outcome": "success"
    },
    {
      "id": "se-06",
      "connector": "AA Network",
      "at": "2026-06-18T09:10:00.000Z",
      "records": 33,
      "outcome": "success"
    }
  ],
  "conn-erp-agents": [
    {
      "id": "agent-01",
      "software": "Tally Prime",
      "company": "Acme Manufacturing Pvt Ltd",
      "port": "9000",
      "token": "hr_agent_4f8a2c9d1e6b",
      "pushVouchers": true,
      "pushMasters": true,
      "paired": true,
      "lastBeat": "2026-06-21T08:55:00.000Z"
    },
    {
      "id": "agent-02",
      "software": "Busy",
      "company": "Acme Components Bengaluru",
      "port": "9001",
      "token": "hr_agent_7b3e1f0a9c2d",
      "pushVouchers": true,
      "pushMasters": false,
      "paired": true,
      "lastBeat": "2026-06-20T17:40:00.000Z"
    },
    {
      "id": "agent-03",
      "software": "Tally ERP 9",
      "company": "Acme Exports Unit",
      "port": "9000",
      "token": "hr_agent_2d9c0a1f3e7b",
      "pushVouchers": false,
      "pushMasters": false,
      "paired": false,
      "lastBeat": null
    }
  ],
  "conn-gstn-session": {
    "gstin": "29ABCDE1234F1Z5",
    "legalName": "Acme Manufacturing Pvt Ltd",
    "connectedAt": "2026-04-12T09:00:00.000Z",
    "scopes": [
      "GSTR-1 (outward)",
      "GSTR-2B (ITC)",
      "GSTR-3B summary",
      "e-Invoice IRN"
    ]
  },
  "conn-cost-enabled": {
    "aa": true,
    "gw": true,
    "ecom": true,
    "gstn": true,
    "erp": false
  },
  "conn-cost-volumes": {
    "aa": 1200,
    "gw": 2400,
    "ecom": 850,
    "gstn": 0,
    "erp": 3000
  },
  "conn-dataflow-grants": {
    "statements.read": true,
    "balance.read": true,
    "settlements.read": true,
    "tags.write": false,
    "recon.write": true,
    "einvoice.read": true
  },
  "conn-environments": {
    "conn-razorpay-01": "production",
    "conn-aa-02": "production",
    "conn-stripe-04": "sandbox",
    "conn-tally-03": "production"
  },
  "conn-pos-links": [
    {
      "id": "pos-01",
      "provider": "PineLabs",
      "outletName": "Acme Factory Outlet — Whitefield",
      "status": "connected",
      "lastImport": "2026-06-21T06:00:00.000Z",
      "salesImported": 482350,
      "connectedAt": "2026-02-01T05:30:00.000Z"
    },
    {
      "id": "pos-02",
      "provider": "Petpooja",
      "outletName": "Acme Canteen — Peenya",
      "status": "connected",
      "lastImport": "2026-06-20T05:00:00.000Z",
      "salesImported": 128900,
      "connectedAt": "2026-03-10T05:30:00.000Z"
    },
    {
      "id": "pos-03",
      "provider": "Posist",
      "outletName": "Acme Showroom — Indiranagar",
      "status": "paused",
      "lastImport": "2026-05-28T05:00:00.000Z",
      "salesImported": 254100,
      "connectedAt": "2026-01-18T05:30:00.000Z"
    }
  ],
  "conn-payroll-links": [
    {
      "id": "pay-01",
      "provider": "RazorpayX Payroll",
      "status": "connected",
      "headcount": 24,
      "monthlyCost": 1080000,
      "lastSync": "2026-06-21T04:00:00.000Z",
      "connectedAt": "2025-12-05T06:00:00.000Z"
    },
    {
      "id": "pay-02",
      "provider": "GreytHR",
      "status": "connected",
      "headcount": 12,
      "monthlyCost": 468000,
      "lastSync": "2026-06-19T04:00:00.000Z",
      "connectedAt": "2026-02-20T06:00:00.000Z"
    },
    {
      "id": "pay-03",
      "provider": "Keka",
      "status": "error",
      "headcount": 8,
      "monthlyCost": 296000,
      "lastSync": "2026-06-10T04:00:00.000Z",
      "connectedAt": "2026-03-15T06:00:00.000Z"
    }
  ],
  "conn-crm-links": [
    {
      "id": "crm-01",
      "provider": "Zoho CRM",
      "status": "connected",
      "openDeals": 27,
      "pipelineValue": 6480000,
      "lastSync": "2026-06-21T07:30:00.000Z",
      "connectedAt": "2026-01-25T06:00:00.000Z"
    },
    {
      "id": "crm-02",
      "provider": "HubSpot",
      "status": "connected",
      "openDeals": 14,
      "pipelineValue": 3290000,
      "lastSync": "2026-06-20T07:30:00.000Z",
      "connectedAt": "2026-03-08T06:00:00.000Z"
    },
    {
      "id": "crm-03",
      "provider": "Freshsales",
      "status": "paused",
      "openDeals": 9,
      "pipelineValue": 1820000,
      "lastSync": "2026-05-30T07:30:00.000Z",
      "connectedAt": "2026-04-02T06:00:00.000Z"
    }
  ],
  "conn-shipping-links": [
    {
      "id": "ship-01",
      "provider": "Shiprocket",
      "status": "connected",
      "activeShipments": 86,
      "codPending": 412800,
      "lastSync": "2026-06-21T08:10:00.000Z",
      "connectedAt": "2026-01-12T06:00:00.000Z"
    },
    {
      "id": "ship-02",
      "provider": "Delhivery",
      "status": "connected",
      "activeShipments": 54,
      "codPending": 268900,
      "lastSync": "2026-06-20T08:10:00.000Z",
      "connectedAt": "2026-02-19T06:00:00.000Z"
    },
    {
      "id": "ship-03",
      "provider": "Blue Dart",
      "status": "paused",
      "activeShipments": 17,
      "codPending": 0,
      "lastSync": "2026-06-12T08:10:00.000Z",
      "connectedAt": "2026-03-22T06:00:00.000Z"
    }
  ],
  "conn-eway-creds": {
    "gstin": "29ABCDE1234F1Z5",
    "gspUser": "acmemfg_gsp",
    "linked": true
  },
  "conn-eway-entries": [
    {
      "id": "ewb-01",
      "ewbNo": "291002847561",
      "docNo": "INV-2026-0412",
      "value": 248500,
      "toState": "Maharashtra",
      "validTill": "2026-06-24T23:59:00.000Z",
      "createdAt": "2026-06-20T10:30:00.000Z"
    },
    {
      "id": "ewb-02",
      "ewbNo": "291002847562",
      "docNo": "INV-2026-0413",
      "value": 96200,
      "toState": "Tamil Nadu",
      "validTill": "2026-06-23T23:59:00.000Z",
      "createdAt": "2026-06-19T14:15:00.000Z"
    },
    {
      "id": "ewb-03",
      "ewbNo": "291002847563",
      "docNo": "INV-2026-0418",
      "value": 512000,
      "toState": "Gujarat",
      "validTill": "2026-06-25T23:59:00.000Z",
      "createdAt": "2026-06-21T07:50:00.000Z"
    },
    {
      "id": "ewb-04",
      "ewbNo": "291002847564",
      "docNo": "INV-2026-0420",
      "value": 73400,
      "toState": "Telangana",
      "validTill": "2026-06-22T23:59:00.000Z",
      "createdAt": "2026-06-18T09:05:00.000Z"
    }
  ],
  "conn-awb-key": {
    "courier": "Delhivery",
    "key": "dlv_live_9XmK2Pq7Lz4Wn"
  },
  "conn-awb-shipments": [
    {
      "id": "awb-01",
      "courier": "Delhivery",
      "awb": "7281904563210",
      "orderRef": "INV-2026-0412",
      "weightKg": 12.5,
      "status": "picked_up",
      "createdAt": "2026-06-20T11:00:00.000Z"
    },
    {
      "id": "awb-02",
      "courier": "Blue Dart",
      "awb": "4502318976540",
      "orderRef": "INV-2026-0413",
      "weightKg": 4.2,
      "status": "manifested",
      "createdAt": "2026-06-21T06:30:00.000Z"
    },
    {
      "id": "awb-03",
      "courier": "DTDC",
      "awb": "8819203745610",
      "orderRef": "OD118273645900112",
      "weightKg": 8,
      "status": "picked_up",
      "createdAt": "2026-06-19T13:45:00.000Z"
    },
    {
      "id": "awb-04",
      "courier": "Ecom Express",
      "awb": "6390218475032",
      "orderRef": "MEE-9087612",
      "weightKg": 2.1,
      "status": "cancelled",
      "createdAt": "2026-06-17T16:20:00.000Z"
    }
  ],
  "conn-whatsapp-num": {
    "phone": "+919845012345",
    "wabaId": "104829317650482",
    "verified": true
  },
  "conn-whatsapp-templates": [
    {
      "id": "wa-01",
      "name": "invoice_due_reminder",
      "category": "UTILITY",
      "status": "approved",
      "body": "Hi {{1}}, your invoice {{2}} for ₹{{3}} is due on {{4}}. Pay here: {{5}}"
    },
    {
      "id": "wa-02",
      "name": "payment_received",
      "category": "UTILITY",
      "status": "approved",
      "body": "Thanks {{1}}! We have received your payment of ₹{{2}} against {{3}}."
    },
    {
      "id": "wa-03",
      "name": "festive_offer_2026",
      "category": "MARKETING",
      "status": "pending",
      "body": "Hi {{1}}, enjoy 10% off on bulk valve orders this monsoon. Reply to know more."
    },
    {
      "id": "wa-04",
      "name": "otp_login_code",
      "category": "AUTHENTICATION",
      "status": "approved",
      "body": "{{1}} is your Acme verification code. Valid for 10 minutes."
    }
  ],
  "conn-fx-cfg": {
    "provider": "RBI Reference Rate",
    "apiKey": "oxr_3k9Lm2Pq7Xz",
    "linked": true,
    "lastSync": "2026-06-21T06:00:00.000Z"
  },
  "conn-fx-rates": [
    {
      "ccy": "USD",
      "rate": 83.42
    },
    {
      "ccy": "EUR",
      "rate": 90.18
    },
    {
      "ccy": "GBP",
      "rate": 105.67
    },
    {
      "ccy": "AED",
      "rate": 22.71
    },
    {
      "ccy": "SGD",
      "rate": 61.94
    },
    {
      "ccy": "AUD",
      "rate": 55.12
    }
  ],
  "pdc-register": [
    {
      "id": "pdc-01",
      "party": "Tata Steel Ltd",
      "amount": 285000,
      "chequeNo": "004512",
      "bank": "HDFC Bank",
      "dueDate": "2026-07-05",
      "type": "receive",
      "status": "pending"
    },
    {
      "id": "pdc-02",
      "party": "Bharat Forge Ltd",
      "amount": 142500,
      "chequeNo": "778231",
      "bank": "ICICI Bank",
      "dueDate": "2026-06-28",
      "type": "receive",
      "status": "pending"
    },
    {
      "id": "pdc-03",
      "party": "Reliance Polymers",
      "amount": 96000,
      "chequeNo": "100934",
      "bank": "Axis Bank",
      "dueDate": "2026-06-18",
      "type": "issue",
      "status": "cleared"
    },
    {
      "id": "pdc-04",
      "party": "Sundaram Fasteners",
      "amount": 54200,
      "chequeNo": "452109",
      "bank": "Kotak Mahindra Bank",
      "dueDate": "2026-07-12",
      "type": "issue",
      "status": "pending"
    },
    {
      "id": "pdc-05",
      "party": "Mahindra Logistics",
      "amount": 38750,
      "chequeNo": "667845",
      "bank": "State Bank of India",
      "dueDate": "2026-06-10",
      "type": "receive",
      "status": "bounced"
    },
    {
      "id": "pdc-06",
      "party": "L&T Construction",
      "amount": 410000,
      "chequeNo": "990012",
      "bank": "Yes Bank",
      "dueDate": "2026-07-20",
      "type": "receive",
      "status": "pending"
    }
  ],
  "bounce-cases": [
    {
      "id": "bc-01",
      "party": "Mahindra Logistics",
      "chequeNo": "667845",
      "bank": "State Bank of India",
      "amount": 38750,
      "bounceDate": "2026-06-10",
      "reason": "insufficient_funds",
      "status": "represented",
      "representDate": "2026-07-10",
      "notes": "Party confirmed re-deposit after month-end collections."
    },
    {
      "id": "bc-02",
      "party": "Speed Auto Parts",
      "chequeNo": "223410",
      "bank": "Canara Bank",
      "amount": 67500,
      "bounceDate": "2026-05-22",
      "reason": "signature_mismatch",
      "status": "recovered",
      "representDate": "2026-06-21",
      "notes": "Replaced with NEFT transfer on 15-Jun."
    },
    {
      "id": "bc-03",
      "party": "Galaxy Traders",
      "chequeNo": "551209",
      "bank": "Punjab National Bank",
      "amount": 121000,
      "bounceDate": "2026-04-30",
      "reason": "account_closed",
      "status": "legal",
      "representDate": "2026-05-30",
      "notes": "Sec 138 notice issued through advocate."
    },
    {
      "id": "bc-04",
      "party": "Nova Engineering",
      "chequeNo": "880145",
      "bank": "Bank of Baroda",
      "amount": 45000,
      "bounceDate": "2026-06-05",
      "reason": "payment_stopped",
      "status": "open",
      "representDate": "2026-07-05",
      "notes": "Disputed delivery shortfall — under reconciliation."
    }
  ],
  "recurring-templates": [
    {
      "id": "rt-01",
      "description": "Office rent — Peenya plant",
      "amount": 185000,
      "direction": "expense",
      "category": "expense",
      "frequency": "monthly",
      "nextDate": "2026-07-01",
      "counterparty": "Prestige Estates",
      "active": true
    },
    {
      "id": "rt-02",
      "description": "AWS cloud hosting",
      "amount": 42000,
      "direction": "expense",
      "category": "expense",
      "frequency": "monthly",
      "nextDate": "2026-06-28",
      "counterparty": "Amazon Web Services",
      "active": true
    },
    {
      "id": "rt-03",
      "description": "Annual maintenance contract — Zoho",
      "amount": 96000,
      "direction": "expense",
      "category": "expense",
      "frequency": "annual",
      "nextDate": "2026-09-15",
      "counterparty": "Zoho Corporation",
      "active": true
    },
    {
      "id": "rt-04",
      "description": "Retainer — Tata Steel supply",
      "amount": 750000,
      "direction": "income",
      "category": "revenue",
      "frequency": "quarterly",
      "nextDate": "2026-07-10",
      "counterparty": "Tata Steel Ltd",
      "active": true
    },
    {
      "id": "rt-05",
      "description": "GST payment — monthly",
      "amount": 220000,
      "direction": "expense",
      "category": "tax",
      "frequency": "monthly",
      "nextDate": "2026-07-20",
      "counterparty": "GST Department",
      "active": true
    },
    {
      "id": "rt-06",
      "description": "Working capital loan EMI",
      "amount": 134500,
      "direction": "expense",
      "category": "loan",
      "frequency": "monthly",
      "nextDate": "2026-07-05",
      "counterparty": "HDFC Bank",
      "active": false
    }
  ],
  "txn-cat-rules": [
    {
      "id": "cr-01",
      "field": "counterparty",
      "op": "contains",
      "needle": "Amazon Web Services",
      "minAmount": "",
      "maxAmount": "",
      "category": "expense"
    },
    {
      "id": "cr-02",
      "field": "counterparty",
      "op": "contains",
      "needle": "GST Department",
      "minAmount": "",
      "maxAmount": "",
      "category": "tax"
    },
    {
      "id": "cr-03",
      "field": "description",
      "op": "contains",
      "needle": "salary",
      "minAmount": "10000",
      "maxAmount": "",
      "category": "payroll"
    },
    {
      "id": "cr-04",
      "field": "counterparty",
      "op": "equals",
      "needle": "Tata Steel Ltd",
      "minAmount": "",
      "maxAmount": "",
      "category": "revenue"
    },
    {
      "id": "cr-05",
      "field": "description",
      "op": "contains",
      "needle": "EMI",
      "minAmount": "",
      "maxAmount": "",
      "category": "loan"
    }
  ],
  "txn-cost-centers": [
    {
      "id": "cc-01",
      "name": "Valve Manufacturing Line"
    },
    {
      "id": "cc-02",
      "name": "Export Division"
    },
    {
      "id": "cc-03",
      "name": "R&D — New Products"
    },
    {
      "id": "cc-04",
      "name": "Bengaluru Showroom"
    },
    {
      "id": "cc-05",
      "name": "Administration & Overheads"
    }
  ],
  "txn-cost-center-map": {
    "txn-1001": "cc-01",
    "txn-1002": "cc-02",
    "txn-1003": "cc-01",
    "txn-1004": "cc-03",
    "txn-1005": "cc-04",
    "txn-1006": "cc-05"
  },
  "txn-manual-journals": [
    {
      "id": "jv-01",
      "voucherNo": "JV-2026-001",
      "date": "2026-04-01",
      "narration": "Opening balance transfer for FY 2026-27",
      "legs": [
        {
          "account": "Cash & Bank",
          "debit": 1500000,
          "credit": 0
        },
        {
          "account": "Capital Account",
          "debit": 0,
          "credit": 1500000
        }
      ],
      "total": 1500000
    },
    {
      "id": "jv-02",
      "voucherNo": "JV-2026-002",
      "date": "2026-05-31",
      "narration": "Depreciation on plant & machinery",
      "legs": [
        {
          "account": "Depreciation Expense",
          "debit": 84000,
          "credit": 0
        },
        {
          "account": "Accumulated Depreciation",
          "debit": 0,
          "credit": 84000
        }
      ],
      "total": 84000
    },
    {
      "id": "jv-03",
      "voucherNo": "JV-2026-003",
      "date": "2026-06-15",
      "narration": "Provision for doubtful debts — Galaxy Traders",
      "legs": [
        {
          "account": "Bad Debt Provision",
          "debit": 121000,
          "credit": 0
        },
        {
          "account": "Sundry Debtors",
          "debit": 0,
          "credit": 121000
        }
      ],
      "total": 121000
    },
    {
      "id": "jv-04",
      "voucherNo": "JV-2026-004",
      "date": "2026-06-20",
      "narration": "TDS payable adjustment for Q1",
      "legs": [
        {
          "account": "TDS Receivable",
          "debit": 18500,
          "credit": 0
        },
        {
          "account": "Professional Fees",
          "debit": 0,
          "credit": 18500
        }
      ],
      "total": 18500
    }
  ],
  "txn-opening-balances": {
    "Cash & Bank": 1500000,
    "Sundry Debtors": 842000,
    "Sundry Creditors": 615000,
    "Capital Account": 2000000,
    "Working Capital Loan": 1250000
  },
  "txn-opening-asof": "2026-04-01",
  "txn-write-offs": [
    {
      "id": "wo-01",
      "date": "2026-05-12",
      "party": "Galaxy Traders",
      "amount": 121000,
      "reason": "bad_debt",
      "notes": "Account closed, cheque dishonoured, Sec 138 in progress."
    },
    {
      "id": "wo-02",
      "date": "2026-06-03",
      "party": "Speed Auto Parts",
      "amount": 2500,
      "reason": "short_receipt",
      "notes": "Round-off short receipt on final settlement."
    },
    {
      "id": "wo-03",
      "date": "2026-06-18",
      "party": "Reliance Polymers",
      "amount": 8000,
      "reason": "discount",
      "notes": "Early payment discount allowed as agreed."
    },
    {
      "id": "wo-04",
      "date": "2026-06-20",
      "party": "Nova Engineering",
      "amount": 350,
      "reason": "rounding",
      "notes": "Invoice rounding adjustment."
    }
  ],
  "txn-period-lock-upto": "2026-03-31",
  "txn-chart-of-accounts": [
    {
      "id": "seed-cash",
      "code": "1000",
      "name": "Cash & Bank",
      "group": "asset"
    },
    {
      "id": "coa-debtors",
      "code": "1200",
      "name": "Sundry Debtors",
      "group": "asset"
    },
    {
      "id": "coa-inventory",
      "code": "1300",
      "name": "Inventory — Raw Material",
      "group": "asset"
    },
    {
      "id": "seed-loan",
      "code": "2000",
      "name": "Working Capital Loan",
      "group": "liability"
    },
    {
      "id": "seed-tax",
      "code": "2100",
      "name": "GST Payable",
      "group": "liability"
    },
    {
      "id": "coa-creditors",
      "code": "2200",
      "name": "Sundry Creditors",
      "group": "liability"
    },
    {
      "id": "coa-capital",
      "code": "3000",
      "name": "Capital Account",
      "group": "equity"
    },
    {
      "id": "seed-rev",
      "code": "4000",
      "name": "Revenue — Domestic Sales",
      "group": "income"
    },
    {
      "id": "coa-export",
      "code": "4100",
      "name": "Revenue — Export Sales",
      "group": "income"
    },
    {
      "id": "seed-exp",
      "code": "5000",
      "name": "Raw Material Purchases",
      "group": "expense"
    },
    {
      "id": "seed-pay",
      "code": "5100",
      "name": "Payroll & Wages",
      "group": "expense"
    }
  ],
  "txn-gst-ledger-rate": 18,
  "txn-tds-ledger-section": "194J",
  "txn-tds-ledger-threshold": 30000,
  "txn-budget-actual": {
    "revenue": 8500000,
    "expense": 4200000,
    "payroll": 1800000,
    "tax": 950000,
    "loan": 800000
  },
  "sales-deals": [
    {
      "id": "deal-1001",
      "title": "5000 precision valves - bulk order",
      "customer": "Sharma Industrial Traders",
      "rep": "Rahul Mehta",
      "value": 1850000,
      "stage": "negotiation",
      "source": "IndiaMART",
      "expectedClose": "2026-07-10"
    },
    {
      "id": "deal-1002",
      "title": "Annual maintenance contract - pumps",
      "customer": "Krishna Engineering Works",
      "rep": "Priya Nair",
      "value": 640000,
      "stage": "quoted",
      "source": "Referral",
      "expectedClose": "2026-07-02"
    },
    {
      "id": "deal-1003",
      "title": "CNC spare parts repeat order",
      "customer": "Patel Auto Components",
      "rep": "Aditya Rao",
      "value": 320000,
      "stage": "won",
      "source": "WhatsApp",
      "expectedClose": "2026-06-15"
    },
    {
      "id": "deal-1004",
      "title": "Hydraulic cylinders - 200 units",
      "customer": "Reddy Fabricators Pvt Ltd",
      "rep": "Rahul Mehta",
      "value": 1120000,
      "stage": "enquiry",
      "source": "Website",
      "expectedClose": "2026-08-05"
    },
    {
      "id": "deal-1005",
      "title": "Gearbox assemblies trial batch",
      "customer": "Mehta Tools & Dies",
      "rep": "Sneha Iyer",
      "value": 480000,
      "stage": "lost",
      "source": "JustDial",
      "expectedClose": "2026-06-08"
    },
    {
      "id": "deal-1006",
      "title": "Conveyor belt replacement",
      "customer": "Iyer Logistics Solutions",
      "rep": "Priya Nair",
      "value": 275000,
      "stage": "negotiation",
      "source": "Walk-in",
      "expectedClose": "2026-07-18"
    },
    {
      "id": "deal-1007",
      "title": "Industrial bearings - quarterly supply",
      "customer": "Gupta Steel Traders",
      "rep": "Aditya Rao",
      "value": 920000,
      "stage": "won",
      "source": "IndiaMART",
      "expectedClose": "2026-06-12"
    }
  ],
  "sales-commissions": [
    {
      "id": "comm-201",
      "rep": "Rahul Mehta",
      "dealValue": 1850000,
      "margin": 22,
      "tier": "tiered"
    },
    {
      "id": "comm-202",
      "rep": "Priya Nair",
      "dealValue": 640000,
      "margin": 18,
      "tier": "flat"
    },
    {
      "id": "comm-203",
      "rep": "Aditya Rao",
      "dealValue": 320000,
      "margin": 25,
      "tier": "flat"
    },
    {
      "id": "comm-204",
      "rep": "Sneha Iyer",
      "dealValue": 1120000,
      "margin": 20,
      "tier": "tiered"
    },
    {
      "id": "comm-205",
      "rep": "Rahul Mehta",
      "dealValue": 480000,
      "margin": 15,
      "tier": "tiered"
    },
    {
      "id": "comm-206",
      "rep": "Aditya Rao",
      "dealValue": 920000,
      "margin": 19,
      "tier": "tiered"
    }
  ],
  "sales-leads": [
    {
      "id": "lead-301",
      "name": "Vikram Desai",
      "phone": "9845012345",
      "source": "IndiaMART",
      "status": "qualified",
      "nextFollowUp": "2026-06-24",
      "note": "Wants quote for 100 valves, decision by month-end",
      "converted": false
    },
    {
      "id": "lead-302",
      "name": "Anjali Kulkarni",
      "phone": "9820076543",
      "source": "WhatsApp",
      "status": "contacted",
      "nextFollowUp": "2026-06-23",
      "note": "Sent catalogue, awaiting specs",
      "converted": false
    },
    {
      "id": "lead-303",
      "name": "Suresh Menon",
      "phone": "9900112233",
      "source": "Referral",
      "status": "new",
      "nextFollowUp": "2026-06-25",
      "note": "Referred by Patel Auto, needs AMC pricing",
      "converted": false
    },
    {
      "id": "lead-304",
      "name": "Deepa Raghavan",
      "phone": "9740099887",
      "source": "Website",
      "status": "qualified",
      "nextFollowUp": "2026-06-22",
      "note": "Budget confirmed 8L, ready to order",
      "converted": true
    },
    {
      "id": "lead-305",
      "name": "Manoj Pillai",
      "phone": "9886655443",
      "source": "JustDial",
      "status": "dropped",
      "nextFollowUp": "2026-06-18",
      "note": "Went with competitor on price",
      "converted": false
    },
    {
      "id": "lead-306",
      "name": "Kavya Shetty",
      "phone": "9663322110",
      "source": "Walk-in",
      "status": "contacted",
      "nextFollowUp": "2026-06-26",
      "note": "Visited showroom, comparing 3 vendors",
      "converted": false
    }
  ],
  "sales-winloss": [
    {
      "id": "wl-401",
      "deal": "CNC spare parts repeat order - Patel Auto",
      "value": 320000,
      "outcome": "won",
      "reason": "Existing relationship and fast delivery"
    },
    {
      "id": "wl-402",
      "deal": "Gearbox assemblies trial batch - Mehta Tools",
      "value": 480000,
      "outcome": "lost",
      "reason": "Competitor quoted 12% lower"
    },
    {
      "id": "wl-403",
      "deal": "Industrial bearings supply - Gupta Steel",
      "value": 920000,
      "outcome": "won",
      "reason": "Better payment terms and stock availability"
    },
    {
      "id": "wl-404",
      "deal": "Sheet metal contract - Verma Industries",
      "value": 560000,
      "outcome": "lost",
      "reason": "Lost on lead time, buyer needed 7-day dispatch"
    },
    {
      "id": "wl-405",
      "deal": "Pump overhaul project - Krishna Engg",
      "value": 410000,
      "outcome": "won",
      "reason": "Technical proposal rated highest"
    },
    {
      "id": "wl-406",
      "deal": "Motor rewinding bulk - Nair Textiles",
      "value": 230000,
      "outcome": "lost",
      "reason": "Project deferred to next fiscal year"
    }
  ],
  "sales-targets": [
    {
      "id": "tgt-501",
      "rep": "Rahul Mehta",
      "target": 2500000,
      "achieved": 2170000
    },
    {
      "id": "tgt-502",
      "rep": "Priya Nair",
      "target": 1800000,
      "achieved": 1920000
    },
    {
      "id": "tgt-503",
      "rep": "Aditya Rao",
      "target": 1500000,
      "achieved": 1240000
    },
    {
      "id": "tgt-504",
      "rep": "Sneha Iyer",
      "target": 1200000,
      "achieved": 880000
    },
    {
      "id": "tgt-505",
      "rep": "Vivek Joshi",
      "target": 1000000,
      "achieved": 1050000
    }
  ],
  "sales-territories": [
    {
      "id": "terr-601",
      "name": "Bengaluru North",
      "rep": "Rahul Mehta",
      "pincodes": "560001, 560003, 560024",
      "accounts": 42,
      "potential": 8500000
    },
    {
      "id": "terr-602",
      "name": "Bengaluru South",
      "rep": "Priya Nair",
      "pincodes": "560011, 560029, 560078",
      "accounts": 35,
      "potential": 6200000
    },
    {
      "id": "terr-603",
      "name": "Peenya Industrial Area",
      "rep": "Aditya Rao",
      "pincodes": "560058, 560073",
      "accounts": 58,
      "potential": 11400000
    },
    {
      "id": "terr-604",
      "name": "Hosur Road Belt",
      "rep": "Sneha Iyer",
      "pincodes": "560068, 560100, 562107",
      "accounts": 27,
      "potential": 4900000
    },
    {
      "id": "terr-605",
      "name": "Mysuru Cluster",
      "rep": "Vivek Joshi",
      "pincodes": "570001, 570016, 571186",
      "accounts": 19,
      "potential": 3300000
    }
  ],
  "sales-activities": [
    {
      "id": "act-701",
      "contact": "Vikram Desai - Sharma Industrial",
      "type": "call",
      "outcome": "connected",
      "duration": 14,
      "note": "Discussed valve specs, will share BOQ",
      "at": "2026-06-20T10:30:00"
    },
    {
      "id": "act-702",
      "contact": "Anjali Kulkarni - Krishna Engg",
      "type": "whatsapp",
      "outcome": "follow-up",
      "duration": 0,
      "note": "Sent catalogue PDF and price list",
      "at": "2026-06-20T15:05:00"
    },
    {
      "id": "act-703",
      "contact": "Suresh Menon - Patel Auto",
      "type": "visit",
      "outcome": "connected",
      "duration": 45,
      "note": "Plant visit, inspected requirement on-site",
      "at": "2026-06-19T11:00:00"
    },
    {
      "id": "act-704",
      "contact": "Deepa Raghavan - Reddy Fabricators",
      "type": "meeting",
      "outcome": "closed",
      "duration": 60,
      "note": "Final negotiation, order confirmed",
      "at": "2026-06-18T16:30:00"
    },
    {
      "id": "act-705",
      "contact": "Manoj Pillai - Gupta Steel",
      "type": "call",
      "outcome": "no-answer",
      "duration": 0,
      "note": "Left voicemail, retry tomorrow",
      "at": "2026-06-20T09:15:00"
    },
    {
      "id": "act-706",
      "contact": "Kavya Shetty - Iyer Logistics",
      "type": "email",
      "outcome": "follow-up",
      "duration": 0,
      "note": "Emailed revised quote with 5% discount",
      "at": "2026-06-17T13:45:00"
    }
  ],
  "sales-quote-expiry": [
    {
      "id": "qe-801",
      "quote": "QT-2026-0142",
      "customer": "Sharma Industrial Traders",
      "value": 1850000,
      "validUntil": "2026-06-28"
    },
    {
      "id": "qe-802",
      "quote": "QT-2026-0145",
      "customer": "Krishna Engineering Works",
      "value": 640000,
      "validUntil": "2026-07-05"
    },
    {
      "id": "qe-803",
      "quote": "QT-2026-0138",
      "customer": "Reddy Fabricators Pvt Ltd",
      "value": 1120000,
      "validUntil": "2026-06-22"
    },
    {
      "id": "qe-804",
      "quote": "QT-2026-0150",
      "customer": "Iyer Logistics Solutions",
      "value": 275000,
      "validUntil": "2026-07-12"
    },
    {
      "id": "qe-805",
      "quote": "QT-2026-0129",
      "customer": "Gupta Steel Traders",
      "value": 920000,
      "validUntil": "2026-06-19"
    },
    {
      "id": "qe-806",
      "quote": "QT-2026-0151",
      "customer": "Verma Industries",
      "value": 560000,
      "validUntil": "2026-07-20"
    }
  ],
  "sales-nps": [
    {
      "id": "fb-901",
      "customer": "Patel Auto Components",
      "score": 9,
      "comment": "Excellent delivery timelines and quality consistency",
      "at": "2026-06-12T10:00:00"
    },
    {
      "id": "fb-902",
      "customer": "Krishna Engineering Works",
      "score": 8,
      "comment": "Good products, would like faster quote turnaround",
      "at": "2026-06-14T14:20:00"
    },
    {
      "id": "fb-903",
      "customer": "Gupta Steel Traders",
      "score": 10,
      "comment": "Best vendor we work with, very reliable",
      "at": "2026-06-15T09:30:00"
    },
    {
      "id": "fb-904",
      "customer": "Reddy Fabricators Pvt Ltd",
      "score": 6,
      "comment": "Pricing is a bit high compared to others",
      "at": "2026-06-10T16:45:00"
    },
    {
      "id": "fb-905",
      "customer": "Mehta Tools & Dies",
      "score": 4,
      "comment": "Delivery was delayed twice last quarter",
      "at": "2026-06-08T11:15:00"
    },
    {
      "id": "fb-906",
      "customer": "Iyer Logistics Solutions",
      "score": 9,
      "comment": "Responsive support team, smooth onboarding",
      "at": "2026-06-16T13:00:00"
    }
  ],
  "sales-playbook": [
    {
      "id": "ps-001",
      "label": "Respond to enquiry within 1 hour",
      "done": true
    },
    {
      "id": "ps-002",
      "label": "Qualify need, budget and timeline",
      "done": true
    },
    {
      "id": "ps-003",
      "label": "Validate buyer GSTIN & place of supply",
      "done": true
    },
    {
      "id": "ps-004",
      "label": "Send branded, GST-correct quote",
      "done": true
    },
    {
      "id": "ps-005",
      "label": "Set quote validity & follow-up reminder",
      "done": false
    },
    {
      "id": "ps-006",
      "label": "Get discount approved if above policy",
      "done": false
    },
    {
      "id": "ps-007",
      "label": "Confirm credit limit before order",
      "done": false
    },
    {
      "id": "ps-008",
      "label": "Convert to sales order with UPI link",
      "done": false
    },
    {
      "id": "ps-009",
      "label": "Dispatch & share tracking",
      "done": false
    },
    {
      "id": "ps-010",
      "label": "Send NPS survey post-delivery",
      "done": false
    }
  ],
  "sales-renewals": [
    {
      "id": "ren-1101",
      "customer": "Patel Auto Components",
      "product": "Annual Maintenance Contract",
      "value": 360000,
      "renewalDate": "2026-07-15",
      "status": "active"
    },
    {
      "id": "ren-1102",
      "customer": "Krishna Engineering Works",
      "product": "Pump Service Plan",
      "value": 240000,
      "renewalDate": "2026-06-30",
      "status": "active"
    },
    {
      "id": "ren-1103",
      "customer": "Gupta Steel Traders",
      "product": "Quarterly Bearings Supply",
      "value": 920000,
      "renewalDate": "2026-06-25",
      "status": "renewed"
    },
    {
      "id": "ren-1104",
      "customer": "Mehta Tools & Dies",
      "product": "Tooling Support Contract",
      "value": 180000,
      "renewalDate": "2026-05-20",
      "status": "lapsed"
    },
    {
      "id": "ren-1105",
      "customer": "Iyer Logistics Solutions",
      "product": "Conveyor AMC",
      "value": 150000,
      "renewalDate": "2026-08-10",
      "status": "active"
    }
  ],
  "sales-referrals": [
    {
      "id": "ref-1201",
      "referrer": "Patel Auto Components",
      "referred": "Suresh Menon - Menon Castings",
      "dealValue": 410000,
      "rewardPct": 2,
      "status": "closed"
    },
    {
      "id": "ref-1202",
      "referrer": "Krishna Engineering Works",
      "referred": "Verma Industries",
      "dealValue": 560000,
      "rewardPct": 2.5,
      "status": "pending"
    },
    {
      "id": "ref-1203",
      "referrer": "Gupta Steel Traders",
      "referred": "Reddy Fabricators Pvt Ltd",
      "dealValue": 1120000,
      "rewardPct": 1.5,
      "status": "paid"
    },
    {
      "id": "ref-1204",
      "referrer": "Sharma Industrial Traders",
      "referred": "Nair Textiles",
      "dealValue": 230000,
      "rewardPct": 3,
      "status": "pending"
    },
    {
      "id": "ref-1205",
      "referrer": "Iyer Logistics Solutions",
      "referred": "Desai Engineering",
      "dealValue": 340000,
      "rewardPct": 2,
      "status": "closed"
    }
  ],
  "sales-source-spend": [
    {
      "source": "WhatsApp",
      "spend": 12000
    },
    {
      "source": "IndiaMART",
      "spend": 85000
    },
    {
      "source": "JustDial",
      "spend": 45000
    },
    {
      "source": "Referral",
      "spend": 20000
    },
    {
      "source": "Walk-in",
      "spend": 8000
    },
    {
      "source": "Website",
      "spend": 60000
    }
  ],
  "sales-account-plans": [
    {
      "id": "ap-1301",
      "account": "Gupta Steel Traders",
      "goalValue": 3000000,
      "objective": "Become sole bearings supplier for FY27",
      "nextStep": "Present annual rate contract to procurement head",
      "owner": "Aditya Rao",
      "status": "active"
    },
    {
      "id": "ap-1302",
      "account": "Patel Auto Components",
      "goalValue": 1500000,
      "objective": "Expand from spares into full CNC tooling",
      "nextStep": "Schedule plant audit with production team",
      "owner": "Rahul Mehta",
      "status": "active"
    },
    {
      "id": "ap-1303",
      "account": "Krishna Engineering Works",
      "goalValue": 1200000,
      "objective": "Win 3-year AMC renewal",
      "nextStep": "Finalise pricing with finance",
      "owner": "Priya Nair",
      "status": "won"
    },
    {
      "id": "ap-1304",
      "account": "Mehta Tools & Dies",
      "goalValue": 800000,
      "objective": "Re-engage after lost trial order",
      "nextStep": "Address delivery concerns, offer trial discount",
      "owner": "Sneha Iyer",
      "status": "stalled"
    }
  ],
  "sales-rate-card": [
    {
      "id": "rc-1401",
      "sku": "VLV-PRC-50",
      "listPrice": 3500,
      "tier1Pct": 5,
      "tier2Pct": 10,
      "gstPct": 18
    },
    {
      "id": "rc-1402",
      "sku": "HYD-CYL-200",
      "listPrice": 8200,
      "tier1Pct": 4,
      "tier2Pct": 8,
      "gstPct": 18
    },
    {
      "id": "rc-1403",
      "sku": "BRG-IND-6205",
      "listPrice": 450,
      "tier1Pct": 6,
      "tier2Pct": 12,
      "gstPct": 18
    },
    {
      "id": "rc-1404",
      "sku": "GBX-ASM-15",
      "listPrice": 14500,
      "tier1Pct": 3,
      "tier2Pct": 7,
      "gstPct": 28
    },
    {
      "id": "rc-1405",
      "sku": "CNV-BLT-12M",
      "listPrice": 6800,
      "tier1Pct": 5,
      "tier2Pct": 9,
      "gstPct": 18
    },
    {
      "id": "rc-1406",
      "sku": "MTR-3PH-5HP",
      "listPrice": 18900,
      "tier1Pct": 4,
      "tier2Pct": 8,
      "gstPct": 18
    }
  ],
  "sales-negotiation": [
    {
      "id": "neg-1501",
      "deal": "5000 precision valves - Sharma Industrial",
      "listPrice": 1850000,
      "floorPrice": 1620000,
      "rounds": [
        {
          "id": "nr-1",
          "by": "buyer",
          "price": 1500000,
          "note": "Opening offer, cited competitor quote",
          "at": "2026-06-15T10:00:00"
        },
        {
          "id": "nr-2",
          "by": "us",
          "price": 1780000,
          "note": "Countered, highlighted quality cert",
          "at": "2026-06-16T11:30:00"
        },
        {
          "id": "nr-3",
          "by": "buyer",
          "price": 1650000,
          "note": "Pushed for volume discount",
          "at": "2026-06-18T14:00:00"
        }
      ]
    },
    {
      "id": "neg-1502",
      "deal": "Hydraulic cylinders - Reddy Fabricators",
      "listPrice": 1120000,
      "floorPrice": 980000,
      "rounds": [
        {
          "id": "nr-4",
          "by": "buyer",
          "price": 950000,
          "note": "Wants free delivery included",
          "at": "2026-06-17T09:00:00"
        },
        {
          "id": "nr-5",
          "by": "us",
          "price": 1080000,
          "note": "Offered free delivery at this price",
          "at": "2026-06-19T15:20:00"
        }
      ]
    },
    {
      "id": "neg-1503",
      "deal": "Conveyor belt - Iyer Logistics",
      "listPrice": 275000,
      "floorPrice": 240000,
      "rounds": [
        {
          "id": "nr-6",
          "by": "buyer",
          "price": 230000,
          "note": "Budget constraint",
          "at": "2026-06-16T12:00:00"
        },
        {
          "id": "nr-7",
          "by": "us",
          "price": 260000,
          "note": "Final offer with 30-day credit",
          "at": "2026-06-18T10:45:00"
        }
      ]
    }
  ],
  "sales-lead-response": [
    {
      "id": "lr-1601",
      "lead": "Vikram Desai",
      "source": "IndiaMART",
      "receivedAt": "2026-06-20T09:00:00",
      "respondedAt": "2026-06-20T09:18:00"
    },
    {
      "id": "lr-1602",
      "lead": "Anjali Kulkarni",
      "source": "WhatsApp",
      "receivedAt": "2026-06-20T11:30:00",
      "respondedAt": "2026-06-20T11:42:00"
    },
    {
      "id": "lr-1603",
      "lead": "Suresh Menon",
      "source": "Referral",
      "receivedAt": "2026-06-19T14:00:00",
      "respondedAt": "2026-06-19T15:25:00"
    },
    {
      "id": "lr-1604",
      "lead": "Deepa Raghavan",
      "source": "Website",
      "receivedAt": "2026-06-19T10:15:00",
      "respondedAt": "2026-06-19T10:22:00"
    },
    {
      "id": "lr-1605",
      "lead": "Manoj Pillai",
      "source": "JustDial",
      "receivedAt": "2026-06-18T16:00:00",
      "respondedAt": "2026-06-18T18:40:00"
    },
    {
      "id": "lr-1606",
      "lead": "Kavya Shetty",
      "source": "Walk-in",
      "receivedAt": "2026-06-17T13:00:00",
      "respondedAt": "2026-06-17T13:10:00"
    }
  ],
  "sales-response-sla": 30,
  "sales-loyalty-rate": 2,
  "sales-loyalty-value": 1,
  "sales-loyalty": [
    {
      "id": "ly-1701",
      "customer": "Patel Auto Components",
      "kind": "earn",
      "amount": 320000,
      "points": 6400,
      "at": "2026-06-12T10:00:00"
    },
    {
      "id": "ly-1702",
      "customer": "Gupta Steel Traders",
      "kind": "earn",
      "amount": 920000,
      "points": 18400,
      "at": "2026-06-15T09:30:00"
    },
    {
      "id": "ly-1703",
      "customer": "Patel Auto Components",
      "kind": "redeem",
      "amount": 5000,
      "points": 5000,
      "at": "2026-06-18T14:00:00"
    },
    {
      "id": "ly-1704",
      "customer": "Krishna Engineering Works",
      "kind": "earn",
      "amount": 410000,
      "points": 8200,
      "at": "2026-06-14T11:00:00"
    },
    {
      "id": "ly-1705",
      "customer": "Iyer Logistics Solutions",
      "kind": "earn",
      "amount": 150000,
      "points": 3000,
      "at": "2026-06-16T13:00:00"
    },
    {
      "id": "ly-1706",
      "customer": "Gupta Steel Traders",
      "kind": "redeem",
      "amount": 10000,
      "points": 10000,
      "at": "2026-06-19T16:30:00"
    }
  ],
  "sales-reorder": [
    {
      "id": "ro-1801",
      "name": "Patel Auto Components",
      "lastOrder": "2026-05-15",
      "cycleDays": 30,
      "avgValue": 320000
    },
    {
      "id": "ro-1802",
      "name": "Krishna Engineering Works",
      "lastOrder": "2026-04-20",
      "cycleDays": 45,
      "avgValue": 240000
    },
    {
      "id": "ro-1803",
      "name": "Gupta Steel Traders",
      "lastOrder": "2026-06-01",
      "cycleDays": 90,
      "avgValue": 920000
    },
    {
      "id": "ro-1804",
      "name": "Iyer Logistics Solutions",
      "lastOrder": "2026-03-10",
      "cycleDays": 60,
      "avgValue": 150000
    },
    {
      "id": "ro-1805",
      "name": "Reddy Fabricators Pvt Ltd",
      "lastOrder": "2026-05-28",
      "cycleDays": 30,
      "avgValue": 410000
    }
  ],
  "sales-customer-region": {
    "Sharma Industrial Traders": "Bengaluru North",
    "Krishna Engineering Works": "Bengaluru South",
    "Patel Auto Components": "Peenya Industrial Area",
    "Reddy Fabricators Pvt Ltd": "Hosur Road Belt",
    "Gupta Steel Traders": "Peenya Industrial Area",
    "Iyer Logistics Solutions": "Mysuru Cluster"
  },
  "analytics-targets": [
    {
      "month": "Jan 2026",
      "target": 3200000
    },
    {
      "month": "Feb 2026",
      "target": 3400000
    },
    {
      "month": "Mar 2026",
      "target": 3800000
    },
    {
      "month": "Apr 2026",
      "target": 3500000
    },
    {
      "month": "May 2026",
      "target": 3700000
    },
    {
      "month": "Jun 2026",
      "target": 4000000
    }
  ],
  "commission-mode": "tiered",
  "commission-flat-rate": 3,
  "commission-tiers": [
    {
      "id": "tier-1",
      "upTo": 250000,
      "rate": 4
    },
    {
      "id": "tier-2",
      "upTo": 1000000,
      "rate": 6
    },
    {
      "id": "tier-3",
      "upTo": 5000000,
      "rate": 8
    }
  ],
  "commission-people": [
    {
      "id": "person-1",
      "name": "Rahul Mehta",
      "sales": 2170000
    },
    {
      "id": "person-2",
      "name": "Priya Nair",
      "sales": 1920000
    },
    {
      "id": "person-3",
      "name": "Aditya Rao",
      "sales": 1240000
    },
    {
      "id": "person-4",
      "name": "Sneha Iyer",
      "sales": 880000
    },
    {
      "id": "person-5",
      "name": "Vivek Joshi",
      "sales": 1050000
    }
  ],
  "sku-default-cogs": 60,
  "sku-cogs-overrides": {
    "VLV-PRC-50": 55,
    "HYD-CYL-200": 62,
    "BRG-IND-6205": 48,
    "GBX-ASM-15": 65,
    "CNV-BLT-12M": 58
  },
  "branch-segment-by": "region",
  "ue-sm-pct": 15,
  "ue-gm-pct": 50,
  "ue-lifetime": 24,
  "funnel-leads": 480,
  "funnel-qualified": 210,
  "variance-mode": "mom",
  "pareto-dim": "customer",
  "bridge-price": 5,
  "bridge-volume": 8,
  "bridge-cost": 3,
  "bridge-cogs-pct": 60,
  "anl-mt-cogs-pct": 60,
  "anl-be-fixed-pct": 55,
  "anl-wc-inv-days": 30,
  "anl-pe-headcount": 18,
  "anl-pe-benchmark": 1500000,
  "anl-yoy-window": "6",
  "anl-nvr-months": 6,
  "anl-aov-range": "6",
  "contracts": [
    {
      "id": "ct1a2b",
      "name": "Annual Maintenance Contract - CNC Machines",
      "party": "Bharat Engineering Works",
      "kind": "Vendor",
      "expiry": "2026-09-30",
      "value": 1850000,
      "notes": "Covers 4 VMC units, quarterly preventive service"
    },
    {
      "id": "ct3c4d",
      "name": "Factory Lease Deed - Peenya Unit",
      "party": "Sai Industrial Estates LLP",
      "kind": "Lease/Rent",
      "expiry": "2027-03-31",
      "value": 9600000,
      "notes": "11-month renewable lease, escalation 8% p.a."
    },
    {
      "id": "ct5e6f",
      "name": "Master Supply Agreement - Steel",
      "party": "JSW Steel Distributors",
      "kind": "Customer",
      "expiry": "2026-07-15",
      "value": 24500000,
      "notes": "Auto-renews unless 60-day notice given"
    },
    {
      "id": "ct7g8h",
      "name": "Group Health Insurance Policy",
      "party": "ICICI Lombard",
      "kind": "Insurance",
      "expiry": "2026-08-20",
      "value": 740000,
      "notes": "Covers 42 employees + dependents"
    },
    {
      "id": "ct9i0j",
      "name": "Non-Disclosure Agreement",
      "party": "Wipro Procurement Cell",
      "kind": "NDA",
      "expiry": "2027-01-10",
      "value": 0,
      "notes": "Mutual NDA for OEM component supply talks"
    },
    {
      "id": "ctk1l2",
      "name": "Working Capital Loan Agreement",
      "party": "HDFC Bank",
      "kind": "Loan",
      "expiry": "2026-12-31",
      "value": 15000000,
      "notes": "CC limit, renewable annually after review"
    },
    {
      "id": "ctm3n4",
      "name": "Sales Manager Employment Contract",
      "party": "Rajesh Kumar Nair",
      "kind": "Employment",
      "expiry": "2026-06-28",
      "value": 1440000,
      "notes": "Confirmed; 60-day notice clause"
    }
  ],
  "insurance-policies": [
    {
      "id": "insa1",
      "name": "Fire & Burglary - Factory & Stock",
      "type": "Fire & Burglary",
      "insurer": "New India Assurance",
      "premium": 285000,
      "renewalDate": "2026-07-05",
      "sumInsured": 65000000,
      "notes": "Covers plant, machinery and finished goods"
    },
    {
      "id": "insb2",
      "name": "Group Mediclaim - Staff",
      "type": "Group Health",
      "insurer": "ICICI Lombard",
      "premium": 740000,
      "renewalDate": "2026-08-20",
      "sumInsured": 21000000,
      "notes": "Family floater, 42 lives"
    },
    {
      "id": "insc3",
      "name": "Marine Cargo - Inland Transit",
      "type": "Marine Cargo",
      "insurer": "TATA AIG",
      "premium": 96000,
      "renewalDate": "2026-10-12",
      "sumInsured": 18000000,
      "notes": "Open policy for dispatches across South India"
    },
    {
      "id": "insd4",
      "name": "Workmen Compensation",
      "type": "Workmen Compensation",
      "insurer": "Bajaj Allianz",
      "premium": 132000,
      "renewalDate": "2026-09-01",
      "sumInsured": 12000000,
      "notes": "Statutory cover for shop-floor workers"
    },
    {
      "id": "inse5",
      "name": "Directors & Officers Liability",
      "type": "Directors & Officers",
      "insurer": "HDFC ERGO",
      "premium": 175000,
      "renewalDate": "2027-01-15",
      "sumInsured": 50000000,
      "notes": "Board indemnity cover"
    },
    {
      "id": "insf6",
      "name": "Vehicle Fleet - Commercial",
      "type": "Vehicle Fleet",
      "insurer": "Reliance General",
      "premium": 410000,
      "renewalDate": "2026-11-30",
      "sumInsured": 8500000,
      "notes": "6 delivery trucks + 2 forklifts"
    }
  ],
  "compliance-din-holders": [
    {
      "id": "din01",
      "name": "Suresh Venkataraman",
      "din": "01234567",
      "mode": "DIR-3 KYC-WEB",
      "done": true
    },
    {
      "id": "din02",
      "name": "Meera Suresh",
      "din": "02345678",
      "mode": "DIR-3 KYC-WEB",
      "done": true
    },
    {
      "id": "din03",
      "name": "Arvind Patel",
      "din": "03456789",
      "mode": "DIR-3 KYC",
      "done": false
    },
    {
      "id": "din04",
      "name": "Lakshmi Narayan",
      "din": "04567890",
      "mode": "DIR-3 KYC-WEB",
      "done": false
    }
  ],
  "compliance-dpt3-applies": true,
  "compliance-meetings": [
    {
      "id": "mtg01",
      "kind": "Board",
      "date": "2026-04-12",
      "agenda": "Q4 FY25-26 results, dividend recommendation, banker review",
      "minutes": "Approved audited financials; recommended 10% dividend; HDFC CC limit renewal authorised.",
      "resolutions": "Adoption of audited accounts; appointment of internal auditor",
      "done": true
    },
    {
      "id": "mtg02",
      "kind": "Board",
      "date": "2026-05-28",
      "agenda": "Capex approval for new CNC line, related-party contract ratification",
      "minutes": "Capex of Rs 1.2 cr approved; RPT with Director's firm ratified at arm's length.",
      "resolutions": "Capex sanction; RPT approval u/s 188",
      "done": true
    },
    {
      "id": "mtg03",
      "kind": "AGM",
      "date": "2026-09-25",
      "agenda": "Adoption of accounts, declaration of dividend, auditor re-appointment",
      "minutes": "",
      "resolutions": "Ordinary resolutions for accounts, dividend and auditor",
      "done": false
    },
    {
      "id": "mtg04",
      "kind": "Committee",
      "date": "2026-06-10",
      "agenda": "Audit Committee - review of internal controls and statutory dues",
      "minutes": "Reviewed GST and TDS reconciliations; no material exceptions noted.",
      "resolutions": "Noted internal audit report",
      "done": true
    },
    {
      "id": "mtg05",
      "kind": "EGM",
      "date": "2026-02-18",
      "agenda": "Increase in authorised share capital",
      "minutes": "Authorised capital increased from Rs 1 cr to Rs 2 cr; SH-7 to be filed.",
      "resolutions": "Special resolution for capital alteration",
      "done": true
    }
  ],
  "compliance-registers": [
    {
      "id": "mbr",
      "name": "Register of Members",
      "form": "MGT-1",
      "maintained": true,
      "updated": "2026-04-15"
    },
    {
      "id": "dir",
      "name": "Register of Directors & KMP",
      "form": "Sec 170",
      "maintained": true,
      "updated": "2026-04-15"
    },
    {
      "id": "chg",
      "name": "Register of Charges",
      "form": "CHG-7",
      "maintained": true,
      "updated": "2026-05-02"
    },
    {
      "id": "rpt",
      "name": "Register of Contracts w/ Related Parties",
      "form": "MBP-4",
      "maintained": false,
      "updated": ""
    },
    {
      "id": "trf",
      "name": "Register of Share Transfers",
      "form": "SH-6",
      "maintained": true,
      "updated": "2026-03-20"
    },
    {
      "id": "loan",
      "name": "Register of Loans & Investments",
      "form": "MBP-2",
      "maintained": false,
      "updated": ""
    },
    {
      "id": "dep",
      "name": "Register of Deposits",
      "form": "DPT-2",
      "maintained": true,
      "updated": "2026-04-30"
    }
  ],
  "compliance-shop-licenses": [
    {
      "id": "lic-shop1",
      "name": "Shop & Establishment Registration - Peenya",
      "authority": "Karnataka Labour Dept",
      "number": "KA/BLR/SE/2019/004521",
      "expiry": "2026-12-31"
    },
    {
      "id": "lic-shop2",
      "name": "Trade License - BBMP",
      "authority": "Bruhat Bengaluru Mahanagara Palike",
      "number": "BBMP/TL/2021/88123",
      "expiry": "2026-09-30"
    },
    {
      "id": "lic-shop3",
      "name": "Factory License (Power + 25 workers)",
      "authority": "Karnataka Factories & Boilers Dept",
      "number": "KA/FAC/2018/11920",
      "expiry": "2027-03-31"
    }
  ],
  "compliance-industry-licenses": [
    {
      "id": "lic-ind1",
      "name": "FSSAI - Canteen / Pantry License",
      "authority": "FSSAI",
      "number": "11221334000456",
      "expiry": "2026-08-15"
    },
    {
      "id": "lic-ind2",
      "name": "Legal Metrology - Weighbridge Stamping",
      "authority": "Karnataka Legal Metrology Dept",
      "number": "LM/WB/2024/0231",
      "expiry": "2027-01-20"
    },
    {
      "id": "lic-ind3",
      "name": "BIS Certification - Steel Fasteners",
      "authority": "Bureau of Indian Standards",
      "number": "CM/L-7700123456",
      "expiry": "2026-11-10"
    }
  ],
  "compliance-posh-policies": [
    {
      "id": "posh",
      "name": "POSH Policy adopted & circulated",
      "required": "≥10 employees",
      "done": true
    },
    {
      "id": "icc",
      "name": "Internal Committee (IC) constituted",
      "required": "Presiding officer (woman) + 2 employees + 1 external NGO member",
      "done": true
    },
    {
      "id": "report",
      "name": "Annual POSH report filed with District Officer",
      "required": "By 31 Jan",
      "done": true
    },
    {
      "id": "training",
      "name": "POSH awareness training conducted",
      "required": "Annual",
      "done": false
    },
    {
      "id": "coc",
      "name": "Code of Conduct / HR policy",
      "required": "All firms",
      "done": true
    },
    {
      "id": "register",
      "name": "Complaints register maintained",
      "required": "All firms",
      "done": false
    }
  ],
  "compliance-health-areas": [
    {
      "id": "gst",
      "name": "GST returns (GSTR-1/3B)",
      "weight": 20,
      "status": "good"
    },
    {
      "id": "tds",
      "name": "TDS deposits & returns",
      "weight": 15,
      "status": "good"
    },
    {
      "id": "roc",
      "name": "ROC / MCA filings",
      "weight": 15,
      "status": "warning"
    },
    {
      "id": "payroll",
      "name": "PF / ESI / PT",
      "weight": 15,
      "status": "good"
    },
    {
      "id": "incometax",
      "name": "Income tax & advance tax",
      "weight": 15,
      "status": "good"
    },
    {
      "id": "licenses",
      "name": "Licenses & renewals",
      "weight": 10,
      "status": "warning"
    },
    {
      "id": "posh",
      "name": "POSH & labour policies",
      "weight": 10,
      "status": "good"
    }
  ],
  "comp-pt-states": [
    {
      "id": "ptka",
      "state": "Karnataka",
      "ec": true,
      "rc": true,
      "ecNo": "EC/KA/2018/55231",
      "rcNo": "RC/KA/2018/77810",
      "slab": "Rs 200/month",
      "due": 8400
    },
    {
      "id": "ptmh",
      "state": "Maharashtra",
      "ec": true,
      "rc": false,
      "ecNo": "27/PT/E/2020/9921",
      "rcNo": "",
      "slab": "Rs 200/month (Rs 300 Feb)",
      "due": 3000
    },
    {
      "id": "pttn",
      "state": "Tamil Nadu",
      "ec": true,
      "rc": true,
      "ecNo": "TN/PT/CHN/2021/4412",
      "rcNo": "TN/PT/RC/2021/4413",
      "slab": "Half-yearly",
      "due": 5100
    },
    {
      "id": "pttg",
      "state": "Telangana",
      "ec": false,
      "rc": false,
      "ecNo": "",
      "rcNo": "",
      "slab": "Rs 200/month",
      "due": 0
    }
  ],
  "comp-ip-assets": [
    {
      "id": "ip01",
      "name": "ACME (wordmark)",
      "kind": "Trademark",
      "regNo": "3344521",
      "cls": "07",
      "regDate": "2018-05-22"
    },
    {
      "id": "ip02",
      "name": "Acme logo device",
      "kind": "Trademark",
      "regNo": "3344522",
      "cls": "12",
      "regDate": "2019-11-03"
    },
    {
      "id": "ip03",
      "name": "Self-aligning bearing housing",
      "kind": "Patent",
      "regNo": "IN201841029912",
      "cls": "Mechanical",
      "regDate": "2021-02-14"
    },
    {
      "id": "ip04",
      "name": "Industrial gearbox enclosure",
      "kind": "Design",
      "regNo": "DES/345112",
      "cls": "15-01",
      "regDate": "2020-07-30"
    },
    {
      "id": "ip05",
      "name": "Operations manual & schematics",
      "kind": "Copyright",
      "regNo": "L-112233/2022",
      "cls": "Literary",
      "regDate": "2022-01-19"
    }
  ],
  "comp-iec-number": "29ABCDE1234F1Z5",
  "comp-iec-updated": "2026-05-10",
  "comp-iec-adcodes": [
    {
      "id": "ad01",
      "port": "INMAA4 - Chennai Sea Port",
      "bank": "HDFC Bank - Industrial Area Branch",
      "reg": true
    },
    {
      "id": "ad02",
      "port": "INBLR4 - Bengaluru Air Cargo",
      "bank": "HDFC Bank - Industrial Area Branch",
      "reg": true
    },
    {
      "id": "ad03",
      "port": "INNSA1 - JNPT Nhava Sheva",
      "bank": "ICICI Bank - Whitefield",
      "reg": false
    }
  ],
  "comp-pollution-consents": [
    {
      "id": "pc01",
      "kind": "CTO",
      "category": "Orange",
      "number": "KSPCB/CTO/2022/BLR/11201",
      "issued": "2022-04-01",
      "valid": "2027-03-31"
    },
    {
      "id": "pc02",
      "kind": "CTE",
      "category": "Orange",
      "number": "KSPCB/CTE/2017/BLR/3391",
      "issued": "2017-06-10",
      "valid": "2026-08-30"
    },
    {
      "id": "pc03",
      "kind": "CTO",
      "category": "Green",
      "number": "KSPCB/CTO/2023/BLR/14502",
      "issued": "2023-01-15",
      "valid": "2026-07-20"
    },
    {
      "id": "pc04",
      "kind": "CTO",
      "category": "Red",
      "number": "KSPCB/CTO/2021/BLR/9087",
      "issued": "2021-09-01",
      "valid": "2026-09-01"
    }
  ],
  "comp-fire-noc": [
    {
      "id": "fn01",
      "premise": "Peenya Factory Unit-1",
      "type": "Fire Safety Certificate",
      "number": "KSFES/BLR/FSC/2024/2231",
      "issued": "2024-07-01",
      "valid": "2026-07-31",
      "mockDrill": "Last mock drill 2026-05-15, all clear"
    },
    {
      "id": "fn02",
      "premise": "Whitefield Warehouse",
      "type": "Final NOC",
      "number": "KSFES/BLR/NOC/2023/1145",
      "issued": "2023-10-12",
      "valid": "2026-10-12",
      "mockDrill": "Drill conducted 2026-04-20"
    },
    {
      "id": "fn03",
      "premise": "Head Office - MG Road",
      "type": "Provisional NOC",
      "number": "KSFES/BLR/PNOC/2025/0412",
      "issued": "2025-12-01",
      "valid": "2026-08-25",
      "mockDrill": "Pending - schedule for July"
    },
    {
      "id": "fn04",
      "premise": "Hosur Assembly Shed",
      "type": "Fire Safety Certificate",
      "number": "TNFRS/HSR/FSC/2024/6678",
      "issued": "2024-09-15",
      "valid": "2027-09-15",
      "mockDrill": "Drill done 2026-03-30"
    }
  ],
  "comp-rpt-register": [
    {
      "id": "rpt01",
      "party": "Venkataraman Auto Components Pvt Ltd",
      "relation": "Director's other firm",
      "nature": "Purchase of machined parts",
      "amount": 4200000,
      "basis": "Arm's length",
      "boardApproval": true,
      "date": "2026-05-12"
    },
    {
      "id": "rpt02",
      "party": "Suresh Venkataraman",
      "relation": "Director",
      "nature": "Unsecured loan to company",
      "amount": 2500000,
      "basis": "Arm's length",
      "boardApproval": true,
      "date": "2026-04-02"
    },
    {
      "id": "rpt03",
      "party": "Meera Suresh",
      "relation": "Relative of Director/KMP",
      "nature": "Office premises rent",
      "amount": 960000,
      "basis": "Arm's length",
      "boardApproval": false,
      "date": "2026-06-01"
    },
    {
      "id": "rpt04",
      "party": "Acme Logistics LLP",
      "relation": "Associate",
      "nature": "Freight & transport services",
      "amount": 1350000,
      "basis": "Arm's length",
      "boardApproval": true,
      "date": "2026-05-25"
    },
    {
      "id": "rpt05",
      "party": "Arvind Patel",
      "relation": "KMP",
      "nature": "Sale of scrap material",
      "amount": 180000,
      "basis": "Not arm's length",
      "boardApproval": false,
      "date": "2026-06-08"
    }
  ],
  "comp-dir-disqual": [
    {
      "id": "dd01",
      "name": "Suresh Venkataraman",
      "din": "01234567",
      "flags": {}
    },
    {
      "id": "dd02",
      "name": "Meera Suresh",
      "din": "02345678",
      "flags": {}
    },
    {
      "id": "dd03",
      "name": "Arvind Patel",
      "din": "03456789",
      "flags": {
        "noDin": true
      }
    },
    {
      "id": "dd04",
      "name": "Lakshmi Narayan",
      "din": "04567890",
      "flags": {}
    }
  ],
  "comp-event-roc": [
    {
      "id": "er01",
      "form": "SH-7",
      "event": "Increase in authorised share capital",
      "eventDate": "2026-02-18",
      "filed": true
    },
    {
      "id": "er02",
      "form": "DIR-12",
      "event": "Director appointment / resignation / change",
      "eventDate": "2026-05-20",
      "filed": false
    },
    {
      "id": "er03",
      "form": "CHG-1",
      "event": "Charge created / modified (loan secured)",
      "eventDate": "2026-06-05",
      "filed": false
    },
    {
      "id": "er04",
      "form": "MGT-14",
      "event": "Special / specified board resolution passed",
      "eventDate": "2026-02-18",
      "filed": true
    },
    {
      "id": "er05",
      "form": "PAS-3",
      "event": "Allotment of shares",
      "eventDate": "2026-03-10",
      "filed": true
    }
  ],
  "comp-msme-form1": [
    {
      "id": "ms01",
      "supplier": "Shakti Precision Tools",
      "udyam": "UDYAM-KA-03-0012345",
      "invoiceDate": "2026-03-15",
      "amount": 580000,
      "paid": false
    },
    {
      "id": "ms02",
      "supplier": "Krishna Rubber Industries",
      "udyam": "UDYAM-KA-03-0023456",
      "invoiceDate": "2026-04-02",
      "amount": 245000,
      "paid": false
    },
    {
      "id": "ms03",
      "supplier": "Deepak Castings",
      "udyam": "UDYAM-TN-05-0034567",
      "invoiceDate": "2026-05-20",
      "amount": 410000,
      "paid": false
    },
    {
      "id": "ms04",
      "supplier": "Ganesh Packaging",
      "udyam": "UDYAM-KA-03-0045678",
      "invoiceDate": "2026-02-10",
      "amount": 132000,
      "paid": true
    },
    {
      "id": "ms05",
      "supplier": "Vijay Electricals",
      "udyam": "UDYAM-KA-03-0056789",
      "invoiceDate": "2026-06-01",
      "amount": 96000,
      "paid": false
    }
  ],
  "comp-sbo-register": [
    {
      "id": "sbo01",
      "name": "Suresh Venkataraman",
      "pan": "ABCPV1234K",
      "directPct": 48,
      "indirectPct": 12,
      "declared": true
    },
    {
      "id": "sbo02",
      "name": "Meera Suresh",
      "pan": "ABDPS5678L",
      "directPct": 22,
      "indirectPct": 0,
      "declared": false
    },
    {
      "id": "sbo03",
      "name": "Arvind Patel",
      "pan": "ABEPP9012M",
      "directPct": 5,
      "indirectPct": 15,
      "declared": false
    },
    {
      "id": "sbo04",
      "name": "Lakshmi Narayan",
      "pan": "ABFPN3456N",
      "directPct": 8,
      "indirectPct": 0,
      "declared": false
    }
  ],
  "comp-secretarial-std": {
    "ss1-notice": true,
    "ss1-quorum": true,
    "ss1-freq": true,
    "ss1-leave": true,
    "ss1-minutes": true,
    "ss1-draftcirc": false,
    "ss2-notice21": true,
    "ss2-explan": true,
    "ss2-quorum": false,
    "ss2-proxy": true,
    "ss2-attend": true,
    "ss2-minutes": false
  },
  "comp-gst-recon-gstr": "184500000",
  "comp-gst-recon-unbilled": "3200000",
  "comp-gst-recon-exempt": "1500000",
  "comp-gst-recon-nongst": "850000",
  "ocr-expenses": [
    {
      "id": "ocr01",
      "vendor": "Indian Oil Petrol Pump",
      "amount": 4250,
      "gst": 0,
      "date": "2026-06-15",
      "category": "Travel",
      "fileName": "iocl-fuel-bill.jpg",
      "createdAt": "2026-06-15T10:22:00.000Z"
    },
    {
      "id": "ocr02",
      "vendor": "Reliance Digital",
      "amount": 58900,
      "gst": 8983,
      "date": "2026-06-10",
      "category": "Office",
      "fileName": "reliance-laptop-invoice.pdf",
      "createdAt": "2026-06-10T14:05:00.000Z"
    },
    {
      "id": "ocr03",
      "vendor": "Cafe Coffee Day",
      "amount": 1840,
      "gst": 92,
      "date": "2026-06-18",
      "category": "Travel",
      "fileName": "ccd-receipt.jpg",
      "createdAt": "2026-06-18T09:30:00.000Z"
    },
    {
      "id": "ocr04",
      "vendor": "Bharat Stationers",
      "amount": 6720,
      "gst": 1025,
      "date": "2026-06-05",
      "category": "Supplies",
      "fileName": "stationery-bill.jpg",
      "createdAt": "2026-06-05T16:45:00.000Z"
    },
    {
      "id": "ocr05",
      "vendor": "Google India Cloud",
      "amount": 24600,
      "gst": 3752,
      "date": "2026-06-01",
      "category": "Utilities",
      "fileName": "gcp-tax-invoice.pdf",
      "createdAt": "2026-06-01T08:00:00.000Z"
    },
    {
      "id": "ocr06",
      "vendor": "Hindustan Times Media",
      "amount": 35000,
      "gst": 6300,
      "date": "2026-05-28",
      "category": "Marketing",
      "fileName": "ad-insertion-bill.pdf",
      "createdAt": "2026-05-28T11:15:00.000Z"
    }
  ],
  "esign-docs": [
    {
      "id": "es01",
      "title": "Vendor Supply Agreement - Shakti Tools",
      "signer": "Mohan Shakti",
      "email": "mohan@shaktitools.in",
      "method": "aadhaar",
      "sentAt": "2026-06-12T10:00:00.000Z",
      "status": "signed"
    },
    {
      "id": "es02",
      "title": "Employment Offer - Priya Menon",
      "signer": "Priya Menon",
      "email": "priya.menon@gmail.com",
      "method": "email",
      "sentAt": "2026-06-16T09:30:00.000Z",
      "status": "viewed"
    },
    {
      "id": "es03",
      "title": "NDA - Wipro Procurement",
      "signer": "Sanjay Rao",
      "email": "sanjay.rao@wipro.com",
      "method": "dsc",
      "sentAt": "2026-06-18T15:20:00.000Z",
      "status": "sent"
    },
    {
      "id": "es04",
      "title": "Board Resolution - CC Renewal",
      "signer": "Suresh Venkataraman",
      "email": "suresh@acmemfg.in",
      "method": "dsc",
      "sentAt": "2026-06-08T12:00:00.000Z",
      "status": "signed"
    },
    {
      "id": "es05",
      "title": "Lease Renewal - Peenya Unit",
      "signer": "Sai Estates",
      "email": "accounts@saiestates.in",
      "method": "aadhaar",
      "sentAt": "2026-06-14T11:45:00.000Z",
      "status": "declined"
    }
  ],
  "expiry-items": [
    {
      "id": "ex01",
      "name": "Factory License - Peenya",
      "type": "License",
      "expiresAt": "2027-03-31",
      "owner": "Compliance / Arvind",
      "noticeDays": 60
    },
    {
      "id": "ex02",
      "name": "Fire Safety Certificate - Unit 1",
      "type": "Certificate",
      "expiresAt": "2026-07-31",
      "owner": "Admin / Ravi",
      "noticeDays": 45
    },
    {
      "id": "ex03",
      "name": "Group Health Insurance",
      "type": "Insurance",
      "expiresAt": "2026-08-20",
      "owner": "HR / Lakshmi",
      "noticeDays": 30
    },
    {
      "id": "ex04",
      "name": "Steel Supply MSA - JSW",
      "type": "Contract",
      "expiresAt": "2026-07-15",
      "owner": "Sales / Rajesh",
      "noticeDays": 60
    },
    {
      "id": "ex05",
      "name": "FSSAI Canteen License",
      "type": "Registration",
      "expiresAt": "2026-08-15",
      "owner": "Admin / Ravi",
      "noticeDays": 30
    },
    {
      "id": "ex06",
      "name": "Trade License - BBMP",
      "type": "License",
      "expiresAt": "2026-09-30",
      "owner": "Compliance / Arvind",
      "noticeDays": 45
    }
  ],
  "audit-trail-entries": [
    {
      "id": "at01",
      "document": "Audited Financials FY25-26",
      "action": "created",
      "actor": "Suresh Venkataraman",
      "version": 1,
      "note": "Draft uploaded by auditor",
      "at": "2026-04-10T09:00:00.000Z"
    },
    {
      "id": "at02",
      "document": "Audited Financials FY25-26",
      "action": "edited",
      "actor": "CA Ramesh Iyer",
      "version": 2,
      "note": "Incorporated board comments",
      "at": "2026-04-14T11:30:00.000Z"
    },
    {
      "id": "at03",
      "document": "Audited Financials FY25-26",
      "action": "signed",
      "actor": "Suresh Venkataraman",
      "version": 3,
      "note": "Signed for AGM adoption",
      "at": "2026-04-16T16:00:00.000Z"
    },
    {
      "id": "at04",
      "document": "Vendor MSA - Shakti Tools",
      "action": "shared",
      "actor": "Rajesh Kumar Nair",
      "version": 1,
      "note": "Sent for e-sign",
      "at": "2026-06-12T10:05:00.000Z"
    },
    {
      "id": "at05",
      "document": "GST Reconciliation Q1",
      "action": "viewed",
      "actor": "CA Ramesh Iyer",
      "version": 1,
      "note": "",
      "at": "2026-06-18T13:20:00.000Z"
    },
    {
      "id": "at06",
      "document": "Old Rate Card 2024",
      "action": "deleted",
      "actor": "Meera Suresh",
      "version": 1,
      "note": "Superseded by 2026 card",
      "at": "2026-05-30T15:10:00.000Z"
    }
  ],
  "doc-checklist-done": {
    "loan::PAN card (business + proprietor/directors)": true,
    "loan::GST registration certificate": true,
    "loan::Last 6–12 months bank statements": true,
    "loan::Last 2 years ITR with computation": true,
    "loan::Audited financials / P&L + balance sheet": false,
    "loan::KYC of promoters (Aadhaar + PAN)": true,
    "gst-reg::PAN of business / proprietor": true,
    "gst-reg::Aadhaar of authorised signatory": true,
    "tender::GST registration certificate": true,
    "tender::PAN card": true,
    "tender::Udyam (MSME) certificate": false
  },
  "doc-share-links": [
    {
      "id": "sl01",
      "docName": "Audited Financials FY25-26",
      "recipient": "ramesh@iyerassociates.in",
      "access": "download",
      "createdAt": "2026-06-10T10:00:00.000Z",
      "expiresAt": "2026-07-10T10:00:00.000Z",
      "token": "a1b2c3d4",
      "revoked": false
    },
    {
      "id": "sl02",
      "docName": "GST Certificate",
      "recipient": "vendor.onboard@jsw.in",
      "access": "view",
      "createdAt": "2026-06-15T11:30:00.000Z",
      "expiresAt": "2026-06-22T11:30:00.000Z",
      "token": "e5f6g7h8",
      "revoked": false
    },
    {
      "id": "sl03",
      "docName": "Company PAN Card",
      "recipient": "kyc@hdfcbank.com",
      "access": "view",
      "createdAt": "2026-05-20T09:00:00.000Z",
      "expiresAt": "2026-05-27T09:00:00.000Z",
      "token": "i9j0k1l2",
      "revoked": false
    },
    {
      "id": "sl04",
      "docName": "Udyam Certificate",
      "recipient": "tender@gem.gov.in",
      "access": "download",
      "createdAt": "2026-06-01T14:00:00.000Z",
      "expiresAt": "2026-06-15T14:00:00.000Z",
      "token": "m3n4o5p6",
      "revoked": true
    },
    {
      "id": "sl05",
      "docName": "Board Resolution - Banking",
      "recipient": "relationship.mgr@icici.com",
      "access": "view",
      "createdAt": "2026-06-17T16:20:00.000Z",
      "expiresAt": "2026-07-17T16:20:00.000Z",
      "token": "q7r8s9t0",
      "revoked": false
    }
  ],
  "doc-kyc-parties": [
    {
      "id": "kp01",
      "name": "JSW Steel Distributors",
      "kind": "customer",
      "createdAt": "2026-05-10T10:00:00.000Z",
      "received": {
        "PAN card": true,
        "GST certificate": true,
        "Cancelled cheque / bank proof": true,
        "Signed agreement": true,
        "Address proof": true
      }
    },
    {
      "id": "kp02",
      "name": "Shakti Precision Tools",
      "kind": "vendor",
      "createdAt": "2026-05-15T11:00:00.000Z",
      "received": {
        "PAN card": true,
        "GST certificate": true,
        "Cancelled cheque / bank proof": true
      }
    },
    {
      "id": "kp03",
      "name": "Priya Menon",
      "kind": "employee",
      "createdAt": "2026-06-16T09:00:00.000Z",
      "received": {
        "PAN card": true,
        "Aadhaar": true,
        "Photograph": true
      }
    },
    {
      "id": "kp04",
      "name": "Krishna Rubber Industries",
      "kind": "vendor",
      "createdAt": "2026-06-02T13:00:00.000Z",
      "received": {
        "PAN card": true,
        "GST certificate": false
      }
    },
    {
      "id": "kp05",
      "name": "Wipro Procurement Cell",
      "kind": "customer",
      "createdAt": "2026-06-18T15:00:00.000Z",
      "received": {
        "PAN card": true,
        "GST certificate": true,
        "Signed agreement": false
      }
    }
  ],
  "doc-contract-keydates": [
    {
      "id": "kd01",
      "contract": "Steel Supply MSA - JSW",
      "kind": "Notice deadline",
      "date": "2026-07-01",
      "counterparty": "JSW Steel Distributors",
      "note": "60-day notice to prevent auto-renewal"
    },
    {
      "id": "kd02",
      "contract": "Factory Lease - Peenya",
      "kind": "Renewal",
      "date": "2027-03-31",
      "counterparty": "Sai Industrial Estates LLP",
      "note": "Renew with 8% escalation"
    },
    {
      "id": "kd03",
      "contract": "Working Capital Loan",
      "kind": "Review",
      "date": "2026-12-31",
      "counterparty": "HDFC Bank",
      "note": "Annual CC limit review"
    },
    {
      "id": "kd04",
      "contract": "AMC - CNC Machines",
      "kind": "Payment milestone",
      "date": "2026-09-30",
      "counterparty": "Bharat Engineering Works",
      "note": "Q2 service payment due"
    },
    {
      "id": "kd05",
      "contract": "Group Health Insurance",
      "kind": "Expiry",
      "date": "2026-08-20",
      "counterparty": "ICICI Lombard",
      "note": "Renew before lapse, refresh census"
    }
  ],
  "doc-filing-items": [
    {
      "id": "fi01",
      "vendor": "Shakti Precision Tools",
      "billNo": "STP/2026/0451",
      "amount": 580000,
      "billDate": "2026-03-15",
      "location": "Vault / GST folder",
      "status": "filed",
      "filedAt": "2026-03-20T10:00:00.000Z"
    },
    {
      "id": "fi02",
      "vendor": "Reliance Digital",
      "billNo": "RD-BLR-99812",
      "amount": 58900,
      "billDate": "2026-06-10",
      "location": "",
      "status": "to-file"
    },
    {
      "id": "fi03",
      "vendor": "Indian Oil",
      "billNo": "IOCL-44521",
      "amount": 4250,
      "billDate": "2026-06-15",
      "location": "",
      "status": "to-file"
    },
    {
      "id": "fi04",
      "vendor": "Google India Cloud",
      "billNo": "GCP-IN-2026-06",
      "amount": 24600,
      "billDate": "2026-06-01",
      "location": "Drive / Cloud invoices",
      "status": "filed",
      "filedAt": "2026-06-03T09:00:00.000Z"
    },
    {
      "id": "fi05",
      "vendor": "Krishna Rubber Industries",
      "billNo": "KRI/26/0231",
      "amount": 245000,
      "billDate": "2026-04-02",
      "location": "Vault / Vendor bills",
      "status": "filed",
      "filedAt": "2026-04-08T11:00:00.000Z"
    },
    {
      "id": "fi06",
      "vendor": "Bharat Stationers",
      "billNo": "BS-7781",
      "amount": 6720,
      "billDate": "2026-06-05",
      "location": "",
      "status": "to-file"
    }
  ],
  "doc-approval-reqs": [
    {
      "id": "ap01",
      "title": "Capex - New CNC Line",
      "approver": "Suresh Venkataraman",
      "amount": 12000000,
      "reason": "Capacity expansion for JSW order",
      "raisedBy": "Rajesh Kumar Nair",
      "raisedAt": "2026-05-25T10:00:00.000Z",
      "status": "approved",
      "decisionNote": "Approved subject to board ratification",
      "decidedAt": "2026-05-26T15:00:00.000Z"
    },
    {
      "id": "ap02",
      "title": "Vendor Payment - Shakti Tools",
      "approver": "Meera Suresh",
      "amount": 580000,
      "reason": "MSME 45-day deadline approaching",
      "raisedBy": "Accounts / Deepa",
      "raisedAt": "2026-06-15T09:30:00.000Z",
      "status": "pending",
      "decisionNote": ""
    },
    {
      "id": "ap03",
      "title": "Marketing Spend - Trade Expo",
      "approver": "Suresh Venkataraman",
      "amount": 350000,
      "reason": "Stall at IMTEX 2026",
      "raisedBy": "Marketing / Anita",
      "raisedAt": "2026-06-12T14:00:00.000Z",
      "status": "rejected",
      "decisionNote": "Defer to next quarter budget",
      "decidedAt": "2026-06-13T10:00:00.000Z"
    },
    {
      "id": "ap04",
      "title": "Laptop Purchase - Design Team",
      "approver": "Meera Suresh",
      "amount": 58900,
      "reason": "Replacement for failed unit",
      "raisedBy": "IT / Karthik",
      "raisedAt": "2026-06-10T11:00:00.000Z",
      "status": "approved",
      "decisionNote": "Go ahead",
      "decidedAt": "2026-06-10T16:00:00.000Z"
    },
    {
      "id": "ap05",
      "title": "Office Rent - June",
      "approver": "Suresh Venkataraman",
      "amount": 960000,
      "reason": "Monthly premises rent to Meera Suresh",
      "raisedBy": "Accounts / Deepa",
      "raisedAt": "2026-06-01T09:00:00.000Z",
      "status": "pending",
      "decisionNote": ""
    }
  ],
  "doc-gstin-register": [
    {
      "id": "gv01",
      "label": "JSW Steel Distributors",
      "gstin": "29AAACJ4323F1Z8",
      "valid": true,
      "state": "Karnataka",
      "pan": "AAACJ4323F",
      "checkedAt": "2026-05-10T10:00:00.000Z"
    },
    {
      "id": "gv02",
      "label": "Shakti Precision Tools",
      "gstin": "29ABKFS6612P1Z9",
      "valid": true,
      "state": "Karnataka",
      "pan": "ABKFS6612P",
      "checkedAt": "2026-05-15T11:00:00.000Z"
    },
    {
      "id": "gv03",
      "label": "Wipro Procurement Cell",
      "gstin": "29AAACW0387R1ZW",
      "valid": true,
      "state": "Karnataka",
      "pan": "AAACW0387R",
      "checkedAt": "2026-06-18T15:00:00.000Z"
    },
    {
      "id": "gv04",
      "label": "Deepak Castings (TN)",
      "gstin": "33AADCD1122Q1Z5",
      "valid": true,
      "state": "Tamil Nadu",
      "pan": "AADCD1122Q",
      "checkedAt": "2026-06-02T13:00:00.000Z"
    },
    {
      "id": "gv05",
      "label": "Unknown vendor (typo)",
      "gstin": "29ABCDE1234F1Z3",
      "valid": false,
      "state": "Karnataka",
      "pan": "ABCDE1234F",
      "checkedAt": "2026-06-19T09:00:00.000Z"
    }
  ],
  "doc-request-tracker": [
    {
      "id": "dr01",
      "party": "Krishna Rubber Industries",
      "channel": "Email",
      "dueDate": "2026-06-25",
      "createdAt": "2026-06-12T10:00:00.000Z",
      "items": [
        {
          "id": "dri01",
          "label": "GST certificate",
          "received": false
        },
        {
          "id": "dri02",
          "label": "Cancelled cheque",
          "received": true
        },
        {
          "id": "dri03",
          "label": "MSME / Udyam certificate",
          "received": false
        }
      ]
    },
    {
      "id": "dr02",
      "party": "CA Ramesh Iyer",
      "channel": "WhatsApp",
      "dueDate": "2026-06-20",
      "createdAt": "2026-06-08T09:00:00.000Z",
      "items": [
        {
          "id": "dri04",
          "label": "Form 26AS download",
          "received": true
        },
        {
          "id": "dri05",
          "label": "TDS certificates Q4",
          "received": true
        }
      ]
    },
    {
      "id": "dr03",
      "party": "Priya Menon (new hire)",
      "channel": "Portal",
      "dueDate": "2026-06-30",
      "createdAt": "2026-06-16T11:00:00.000Z",
      "items": [
        {
          "id": "dri06",
          "label": "PAN card",
          "received": true
        },
        {
          "id": "dri07",
          "label": "Aadhaar",
          "received": true
        },
        {
          "id": "dri08",
          "label": "Cancelled cheque",
          "received": false
        },
        {
          "id": "dri09",
          "label": "Previous Form 16",
          "received": false
        }
      ]
    },
    {
      "id": "dr04",
      "party": "Wipro Procurement Cell",
      "channel": "Email",
      "dueDate": "2026-06-15",
      "createdAt": "2026-06-01T14:00:00.000Z",
      "items": [
        {
          "id": "dri10",
          "label": "Signed NDA",
          "received": false
        },
        {
          "id": "dri11",
          "label": "Vendor code form",
          "received": true
        }
      ]
    }
  ],
  "doc-naming-pattern": "date-first",
  "doc-compliance-tasks": [
    {
      "id": "ct01",
      "name": "GSTR-1 - May 2026",
      "category": "GST",
      "dueDate": "2026-06-11",
      "docsReady": true,
      "filed": true
    },
    {
      "id": "ct02",
      "name": "GSTR-3B - May 2026",
      "category": "GST",
      "dueDate": "2026-06-20",
      "docsReady": true,
      "filed": false
    },
    {
      "id": "ct03",
      "name": "TDS Deposit - May 2026",
      "category": "TDS",
      "dueDate": "2026-06-07",
      "docsReady": true,
      "filed": true
    },
    {
      "id": "ct04",
      "name": "PF & ESI - May 2026",
      "category": "PF / ESI",
      "dueDate": "2026-06-15",
      "docsReady": true,
      "filed": true
    },
    {
      "id": "ct05",
      "name": "Advance Tax Q1 FY26-27",
      "category": "Income Tax",
      "dueDate": "2026-06-15",
      "docsReady": false,
      "filed": false
    },
    {
      "id": "ct06",
      "name": "AOC-4 - FY25-26",
      "category": "ROC / MCA",
      "dueDate": "2026-10-29",
      "docsReady": false,
      "filed": false
    }
  ],
  "doc-bundles": [
    {
      "id": "bd01",
      "title": "JSW PO-2041 Dispatch",
      "reference": "PO-2041",
      "createdAt": "2026-05-20T10:00:00.000Z",
      "docs": [
        {
          "id": "bdd01",
          "name": "Tax Invoice INV-1182",
          "type": "Invoice"
        },
        {
          "id": "bdd02",
          "name": "E-way Bill EWB-7781",
          "type": "Challan"
        },
        {
          "id": "bdd03",
          "name": "Delivery Challan DC-552",
          "type": "Challan"
        },
        {
          "id": "bdd04",
          "name": "Payment UTR confirmation",
          "type": "Payment proof"
        }
      ]
    },
    {
      "id": "bd02",
      "title": "Shakti Tools Purchase",
      "reference": "STP/2026/0451",
      "createdAt": "2026-03-15T11:00:00.000Z",
      "docs": [
        {
          "id": "bdd05",
          "name": "Purchase Order PO-118",
          "type": "PO"
        },
        {
          "id": "bdd06",
          "name": "Vendor Invoice STP-0451",
          "type": "Invoice"
        },
        {
          "id": "bdd07",
          "name": "Goods Receipt Note GRN-204",
          "type": "GRN"
        }
      ]
    },
    {
      "id": "bd03",
      "title": "Whitefield Warehouse Lease",
      "reference": "LEASE-WF-2025",
      "createdAt": "2025-10-12T09:00:00.000Z",
      "docs": [
        {
          "id": "bdd08",
          "name": "Lease Deed signed",
          "type": "Contract"
        },
        {
          "id": "bdd09",
          "name": "Security deposit receipt",
          "type": "Payment proof"
        }
      ]
    },
    {
      "id": "bd04",
      "title": "Reliance Laptop Purchase",
      "reference": "RD-BLR-99812",
      "createdAt": "2026-06-10T14:00:00.000Z",
      "docs": [
        {
          "id": "bdd10",
          "name": "Tax Invoice RD-99812",
          "type": "Invoice"
        },
        {
          "id": "bdd11",
          "name": "Card payment slip",
          "type": "Payment proof"
        }
      ]
    }
  ],
  "doc-storage-lines": [
    {
      "id": "st01",
      "category": "gst",
      "count": 142,
      "mb": 386.5
    },
    {
      "id": "st02",
      "category": "banking",
      "count": 96,
      "mb": 512
    },
    {
      "id": "st03",
      "category": "legal",
      "count": 34,
      "mb": 220.8
    },
    {
      "id": "st04",
      "category": "tax",
      "count": 78,
      "mb": 298.2
    },
    {
      "id": "st05",
      "category": "payroll",
      "count": 120,
      "mb": 164
    },
    {
      "id": "st06",
      "category": "other",
      "count": 55,
      "mb": 90.4
    }
  ],
  "doc-access-rules": [
    {
      "id": "ar01",
      "role": "Accountant",
      "category": "gst",
      "level": "manage"
    },
    {
      "id": "ar02",
      "role": "Accountant",
      "category": "banking",
      "level": "edit"
    },
    {
      "id": "ar03",
      "role": "Accountant",
      "category": "legal",
      "level": "view"
    },
    {
      "id": "ar04",
      "role": "Accountant",
      "category": "tax",
      "level": "manage"
    },
    {
      "id": "ar05",
      "role": "Accountant",
      "category": "payroll",
      "level": "view"
    },
    {
      "id": "ar06",
      "role": "Accountant",
      "category": "other",
      "level": "view"
    },
    {
      "id": "ar07",
      "role": "CA (External)",
      "category": "gst",
      "level": "view"
    },
    {
      "id": "ar08",
      "role": "CA (External)",
      "category": "banking",
      "level": "view"
    },
    {
      "id": "ar09",
      "role": "CA (External)",
      "category": "legal",
      "level": "view"
    },
    {
      "id": "ar10",
      "role": "CA (External)",
      "category": "tax",
      "level": "edit"
    },
    {
      "id": "ar11",
      "role": "CA (External)",
      "category": "payroll",
      "level": "none"
    },
    {
      "id": "ar12",
      "role": "CA (External)",
      "category": "other",
      "level": "view"
    },
    {
      "id": "ar13",
      "role": "HR Manager",
      "category": "gst",
      "level": "none"
    },
    {
      "id": "ar14",
      "role": "HR Manager",
      "category": "banking",
      "level": "none"
    },
    {
      "id": "ar15",
      "role": "HR Manager",
      "category": "legal",
      "level": "view"
    },
    {
      "id": "ar16",
      "role": "HR Manager",
      "category": "tax",
      "level": "none"
    },
    {
      "id": "ar17",
      "role": "HR Manager",
      "category": "payroll",
      "level": "manage"
    },
    {
      "id": "ar18",
      "role": "HR Manager",
      "category": "other",
      "level": "view"
    }
  ],
  "doc-statutory-collected": {
    "gst-reg::PAN of business": true,
    "gst-reg::Aadhaar of proprietor/partners": true,
    "gst-reg::Proof of business address": true,
    "gst-reg::Bank statement / cancelled cheque": true,
    "gst-reg::Photograph of authorised signatory": false,
    "gst-reg::Constitution proof (partnership deed / COI)": true,
    "annual-roc::Audited financial statements": true,
    "annual-roc::Board resolution": true,
    "annual-roc::Director KYC (DIR-3)": false,
    "loan-kyc::PAN & Aadhaar": true,
    "loan-kyc::GST returns (last 12 months)": true,
    "loan-kyc::Bank statements (6 months)": false
  },
  "doc-version-log": [
    {
      "id": "vl01",
      "docName": "Employee Handbook",
      "version": "v3.2",
      "changedBy": "Lakshmi Narayan",
      "note": "Updated leave policy and POSH section",
      "loggedAt": "2026-06-05T10:00:00.000Z"
    },
    {
      "id": "vl02",
      "docName": "Employee Handbook",
      "version": "v3.1",
      "changedBy": "Lakshmi Narayan",
      "note": "Added WFH guidelines",
      "loggedAt": "2026-02-12T11:00:00.000Z"
    },
    {
      "id": "vl03",
      "docName": "Employee Handbook",
      "version": "v3.0",
      "changedBy": "Meera Suresh",
      "note": "Annual revision FY26",
      "loggedAt": "2026-01-04T09:00:00.000Z"
    },
    {
      "id": "vl04",
      "docName": "Vendor MSA Template",
      "version": "v2.1",
      "changedBy": "CA Ramesh Iyer",
      "note": "Added MSME 45-day payment clause (43B(h))",
      "loggedAt": "2026-05-18T14:00:00.000Z"
    },
    {
      "id": "vl05",
      "docName": "Vendor MSA Template",
      "version": "v2.0",
      "changedBy": "Legal / Sunita",
      "note": "Reworked liability and arbitration clauses",
      "loggedAt": "2026-03-22T15:30:00.000Z"
    },
    {
      "id": "vl06",
      "docName": "Rate Card",
      "version": "v2026.1",
      "changedBy": "Rajesh Kumar Nair",
      "note": "Revised steel pass-through pricing",
      "loggedAt": "2026-04-01T08:00:00.000Z"
    }
  ],
  "doc-signatory-register": [
    {
      "id": "sg01",
      "name": "Suresh Venkataraman",
      "designation": "Managing Director",
      "authority": "Banking & cheques",
      "limit": 0,
      "signatureOnFile": true
    },
    {
      "id": "sg02",
      "name": "Meera Suresh",
      "designation": "Director - Finance",
      "authority": "Banking & cheques",
      "limit": 2500000,
      "signatureOnFile": true
    },
    {
      "id": "sg03",
      "name": "Arvind Patel",
      "designation": "Company Secretary",
      "authority": "ROC / statutory",
      "limit": 0,
      "signatureOnFile": true
    },
    {
      "id": "sg04",
      "name": "Rajesh Kumar Nair",
      "designation": "GM - Sales",
      "authority": "Contracts & agreements",
      "limit": 5000000,
      "signatureOnFile": false
    },
    {
      "id": "sg05",
      "name": "Lakshmi Narayan",
      "designation": "HR Head",
      "authority": "HR & payroll",
      "limit": 1000000,
      "signatureOnFile": true
    },
    {
      "id": "sg06",
      "name": "CA Ramesh Iyer",
      "designation": "Statutory Auditor",
      "authority": "GST & tax filings",
      "limit": 0,
      "signatureOnFile": false
    }
  ],
  "doc-redaction-log": [
    {
      "id": "rd01",
      "docName": "Promoter PAN + Aadhaar set",
      "sharedWith": "HDFC Bank - Loan KYC",
      "fields": {
        "Aadhaar number": true,
        "Phone / email": true,
        "Bank account number": false
      },
      "loggedAt": "2026-05-20T10:00:00.000Z"
    },
    {
      "id": "rd02",
      "docName": "Salary Register - May",
      "sharedWith": "External Payroll Auditor",
      "fields": {
        "Bank account number": true,
        "Salary figures": false,
        "Phone / email": true
      },
      "loggedAt": "2026-06-10T11:00:00.000Z"
    },
    {
      "id": "rd03",
      "docName": "Director ID proof",
      "sharedWith": "MCA Filing (DIR-3 KYC)",
      "fields": {
        "Aadhaar number": true,
        "PAN number": false,
        "Signature": true
      },
      "loggedAt": "2026-06-15T09:30:00.000Z"
    },
    {
      "id": "rd04",
      "docName": "Employee onboarding pack",
      "sharedWith": "Background verification agency",
      "fields": {
        "Aadhaar number": true,
        "PAN number": true,
        "Bank account number": true,
        "Phone / email": false
      },
      "loggedAt": "2026-06-17T14:00:00.000Z"
    }
  ],
  "doc-retention-years": {
    "gst": 6,
    "banking": 8,
    "legal": 10,
    "tax": 8,
    "payroll": 8,
    "other": 3
  },
  "doc-obligation-tracker": [
    {
      "id": "ob01",
      "contract": "Steel Supply MSA - JSW",
      "obligation": "Monthly dispatch report to procurement",
      "owner": "Rajesh Kumar Nair",
      "dueDate": "2026-06-30",
      "done": false
    },
    {
      "id": "ob02",
      "contract": "Working Capital Loan - HDFC",
      "obligation": "Submit quarterly stock & book debt statement",
      "owner": "Meera Suresh",
      "dueDate": "2026-07-10",
      "done": false
    },
    {
      "id": "ob03",
      "contract": "AMC - CNC Machines",
      "obligation": "Approve Q1 preventive maintenance schedule",
      "owner": "Plant / Ravi",
      "dueDate": "2026-06-20",
      "done": false
    },
    {
      "id": "ob04",
      "contract": "Factory Lease - Peenya",
      "obligation": "Renew fire insurance per lease covenant",
      "owner": "Admin / Ravi",
      "dueDate": "2026-07-05",
      "done": true
    },
    {
      "id": "ob05",
      "contract": "JSW Supply MSA",
      "obligation": "Annual quality audit certification submission",
      "owner": "QA / Deepak",
      "dueDate": "2026-05-31",
      "done": true
    },
    {
      "id": "ob06",
      "contract": "Group Health Policy - ICICI",
      "obligation": "Submit updated employee census for renewal",
      "owner": "HR / Lakshmi",
      "dueDate": "2026-08-01",
      "done": false
    }
  ],
  "net-directory": [
    {
      "id": "dir-001",
      "name": "Sharma Steel Traders",
      "gstin": "27ABCDS1234F1Z5",
      "role": "supplier",
      "state": "Maharashtra",
      "linked": true
    },
    {
      "id": "dir-002",
      "name": "Bharat Auto Components Pvt Ltd",
      "gstin": "29AAGCB4567H1Z2",
      "role": "buyer",
      "state": "Karnataka",
      "linked": true
    },
    {
      "id": "dir-003",
      "name": "Coastal Polymers LLP",
      "gstin": "33AABCC7890K1Z9",
      "role": "supplier",
      "state": "Tamil Nadu",
      "linked": false
    },
    {
      "id": "dir-004",
      "name": "Krishna Engineering Works",
      "gstin": "36AACFK2345L1Z3",
      "role": "both",
      "state": "Telangana",
      "linked": true
    },
    {
      "id": "dir-005",
      "name": "Mehta Industrial Supplies",
      "gstin": "24AAACM6789P1Z7",
      "role": "supplier",
      "state": "Gujarat",
      "linked": false
    },
    {
      "id": "dir-006",
      "name": "Sunrise Electricals",
      "gstin": "07AADCS3456Q1Z1",
      "role": "buyer",
      "state": "Delhi",
      "linked": true
    },
    {
      "id": "dir-007",
      "name": "Patel Logistics Pvt Ltd",
      "gstin": "27AABCP8901R1Z4",
      "role": "supplier",
      "state": "Maharashtra",
      "linked": false
    }
  ],
  "net-trade-refs": [
    {
      "id": "ref-001",
      "party": "Sharma Steel Traders",
      "gstin": "27ABCDS1234F1Z5",
      "relMonths": 36,
      "avgDays": 28,
      "creditLimit": 1500000,
      "status": "confirmed",
      "note": "Always pays within terms, never bounced"
    },
    {
      "id": "ref-002",
      "party": "Bharat Auto Components Pvt Ltd",
      "gstin": "29AAGCB4567H1Z2",
      "relMonths": 24,
      "avgDays": 35,
      "creditLimit": 2500000,
      "status": "confirmed",
      "note": "Long-standing buyer, monthly orders"
    },
    {
      "id": "ref-003",
      "party": "Krishna Engineering Works",
      "gstin": "36AACFK2345L1Z3",
      "relMonths": 18,
      "avgDays": 42,
      "creditLimit": 800000,
      "status": "confirmed",
      "note": "Reliable, occasional delay on large orders"
    },
    {
      "id": "ref-004",
      "party": "Mehta Industrial Supplies",
      "gstin": "24AAACM6789P1Z7",
      "relMonths": 12,
      "avgDays": 30,
      "creditLimit": 600000,
      "status": "requested",
      "note": "Newer relationship, growing volume"
    },
    {
      "id": "ref-005",
      "party": "Sunrise Electricals",
      "gstin": "07AADCS3456Q1Z1",
      "relMonths": 48,
      "avgDays": 25,
      "creditLimit": 1200000,
      "status": "confirmed",
      "note": "Oldest customer, strong cheque history"
    }
  ],
  "net-disputes": [
    {
      "id": "dsp-001",
      "party": "Bharat Auto Components Pvt Ltd",
      "invoiceRef": "INV-2026-0142",
      "amount": 86000,
      "reason": "Short shipment — 12 units less than PO",
      "status": "open",
      "openedAt": "2026-06-10",
      "proposed": 74000,
      "note": "Awaiting buyer's GRN copy"
    },
    {
      "id": "dsp-002",
      "party": "Sunrise Electricals",
      "invoiceRef": "INV-2026-0118",
      "amount": 45000,
      "reason": "Rate mismatch vs agreed price list",
      "status": "mediating",
      "openedAt": "2026-05-28",
      "proposed": 42500,
      "note": "Both sides reviewing quotation QT-2026-031"
    },
    {
      "id": "dsp-003",
      "party": "Krishna Engineering Works",
      "invoiceRef": "INV-2026-0097",
      "amount": 132000,
      "reason": "Damaged goods in transit",
      "status": "resolved",
      "openedAt": "2026-04-15",
      "proposed": 118000,
      "note": "Credit note CN-2026-009 issued for damaged lot"
    },
    {
      "id": "dsp-004",
      "party": "Mehta Industrial Supplies",
      "invoiceRef": "INV-2026-0156",
      "amount": 28500,
      "reason": "TDS deducted not reflecting",
      "status": "open",
      "openedAt": "2026-06-15",
      "proposed": 28500,
      "note": "Requested Form 26AS reconciliation"
    },
    {
      "id": "dsp-005",
      "party": "Coastal Polymers LLP",
      "invoiceRef": "INV-2026-0061",
      "amount": 67000,
      "reason": "Late delivery penalty claimed",
      "status": "resolved",
      "openedAt": "2026-03-22",
      "proposed": 60000,
      "note": "Settled with 10% penalty waiver"
    }
  ],
  "net-invoice-confirm": {
    "inv-seed-1": "confirmed",
    "inv-seed-2": "confirmed",
    "inv-seed-3": "sent",
    "inv-seed-4": "disputed",
    "inv-seed-5": "confirmed",
    "inv-seed-6": "sent"
  },
  "net-discovery": [
    {
      "id": "psp-001",
      "name": "Vega Precision Castings",
      "gstin": "27AAHCV1234M1Z8",
      "category": "Aluminium die casting",
      "state": "Maharashtra",
      "ondc": true,
      "gstRating": 4.5,
      "minOrder": 250000,
      "notes": "ISO 9001, quick sampling turnaround"
    },
    {
      "id": "psp-002",
      "name": "Ganga Fasteners Pvt Ltd",
      "gstin": "09AAFCG5678N1Z2",
      "category": "Industrial fasteners",
      "state": "Uttar Pradesh",
      "ondc": true,
      "gstRating": 4,
      "minOrder": 100000,
      "notes": "Competitive pricing, 7-day lead time"
    },
    {
      "id": "psp-003",
      "name": "Deccan Rubber Industries",
      "gstin": "36AADCD9012P1Z6",
      "category": "Rubber gaskets & seals",
      "state": "Telangana",
      "ondc": false,
      "gstRating": 3.5,
      "minOrder": 75000,
      "notes": "Need to verify capacity for bulk"
    },
    {
      "id": "psp-004",
      "name": "Nova Coatings & Paints",
      "gstin": "24AAGCN3456Q1Z0",
      "category": "Powder coating",
      "state": "Gujarat",
      "ondc": true,
      "gstRating": 5,
      "minOrder": 150000,
      "notes": "Top-rated, RoHS compliant finishes"
    },
    {
      "id": "psp-005",
      "name": "Tirupati Packaging Solutions",
      "gstin": "33AABCT7890R1Z3",
      "category": "Corrugated boxes",
      "state": "Tamil Nadu",
      "ondc": true,
      "gstRating": 4.2,
      "minOrder": 50000,
      "notes": "Local to Chennai plant, low freight"
    },
    {
      "id": "psp-006",
      "name": "Himalaya Tool & Die",
      "gstin": "02AAHCH2345S1Z9",
      "category": "Tooling & dies",
      "state": "Himachal Pradesh",
      "ondc": false,
      "gstRating": 4.8,
      "minOrder": 400000,
      "notes": "Premium tooling, longer lead time"
    }
  ],
  "net-onboarding": [
    {
      "id": "onb-001",
      "party": "Vega Precision Castings",
      "gstin": "27AAHCV1234M1Z8",
      "done": [
        0,
        1,
        2,
        3
      ],
      "startedAt": "2026-05-20"
    },
    {
      "id": "onb-002",
      "party": "Ganga Fasteners Pvt Ltd",
      "gstin": "09AAFCG5678N1Z2",
      "done": [
        0,
        1,
        2
      ],
      "startedAt": "2026-06-01"
    },
    {
      "id": "onb-003",
      "party": "Nova Coatings & Paints",
      "gstin": "24AAGCN3456Q1Z0",
      "done": [
        0,
        1,
        2,
        3,
        4,
        5
      ],
      "startedAt": "2026-04-10"
    },
    {
      "id": "onb-004",
      "party": "Tirupati Packaging Solutions",
      "gstin": "33AABCT7890R1Z3",
      "done": [
        0,
        1
      ],
      "startedAt": "2026-06-12"
    },
    {
      "id": "onb-005",
      "party": "Deccan Rubber Industries",
      "gstin": "36AADCD9012P1Z6",
      "done": [
        0
      ],
      "startedAt": "2026-06-18"
    }
  ],
  "net-trade-terms": [
    {
      "id": "trm-001",
      "party": "Sharma Steel Traders",
      "creditDays": 30,
      "creditLimit": 1500000,
      "earlyPayDiscPct": 2,
      "latePenaltyPct": 18,
      "effectiveFrom": "2026-01-01",
      "reviewOn": "2026-12-31",
      "status": "agreed",
      "note": "2/10 Net 30 standing arrangement"
    },
    {
      "id": "trm-002",
      "party": "Bharat Auto Components Pvt Ltd",
      "creditDays": 45,
      "creditLimit": 2500000,
      "earlyPayDiscPct": 1,
      "latePenaltyPct": 15,
      "effectiveFrom": "2025-10-01",
      "reviewOn": "2026-09-30",
      "status": "agreed",
      "note": "Volume buyer, Net-45 approved"
    },
    {
      "id": "trm-003",
      "party": "Krishna Engineering Works",
      "creditDays": 30,
      "creditLimit": 800000,
      "earlyPayDiscPct": 0,
      "latePenaltyPct": 18,
      "effectiveFrom": "2026-04-01",
      "reviewOn": "2027-03-31",
      "status": "agreed",
      "note": "Standard terms"
    },
    {
      "id": "trm-004",
      "party": "Mehta Industrial Supplies",
      "creditDays": 15,
      "creditLimit": 600000,
      "earlyPayDiscPct": 0,
      "latePenaltyPct": 24,
      "effectiveFrom": "2026-06-01",
      "reviewOn": "2026-11-30",
      "status": "draft",
      "note": "New supplier on probation terms"
    },
    {
      "id": "trm-005",
      "party": "Sunrise Electricals",
      "creditDays": 30,
      "creditLimit": 1200000,
      "earlyPayDiscPct": 1.5,
      "latePenaltyPct": 18,
      "effectiveFrom": "2025-07-01",
      "reviewOn": "2026-06-30",
      "status": "agreed",
      "note": "Up for annual review"
    }
  ],
  "net-referrals": [
    {
      "id": "rfr-001",
      "referredBy": "Sharma Steel Traders",
      "newParty": "Vega Precision Castings",
      "expectedValue": 1200000,
      "rewardType": "discount",
      "rewardAmount": 15000,
      "status": "converted",
      "date": "2026-03-12"
    },
    {
      "id": "rfr-002",
      "referredBy": "Bharat Auto Components Pvt Ltd",
      "newParty": "Ganga Fasteners Pvt Ltd",
      "expectedValue": 600000,
      "rewardType": "cash",
      "rewardAmount": 10000,
      "status": "rewarded",
      "date": "2026-02-05"
    },
    {
      "id": "rfr-003",
      "referredBy": "Sunrise Electricals",
      "newParty": "Nova Coatings & Paints",
      "expectedValue": 900000,
      "rewardType": "credit-note",
      "rewardAmount": 12000,
      "status": "pending",
      "date": "2026-05-28"
    },
    {
      "id": "rfr-004",
      "referredBy": "Krishna Engineering Works",
      "newParty": "Tirupati Packaging Solutions",
      "expectedValue": 350000,
      "rewardType": "none",
      "rewardAmount": 0,
      "status": "pending",
      "date": "2026-06-14"
    },
    {
      "id": "rfr-005",
      "referredBy": "Mehta Industrial Supplies",
      "newParty": "Himalaya Tool & Die",
      "expectedValue": 1500000,
      "rewardType": "discount",
      "rewardAmount": 20000,
      "status": "converted",
      "date": "2026-04-22"
    }
  ],
  "net-price-list": [
    {
      "id": "pl-001",
      "sku": "MS-PLATE-12",
      "name": "MS Plate 12mm (per sq.ft)",
      "unit": "sq.ft",
      "price": 480,
      "gstPct": 18
    },
    {
      "id": "pl-002",
      "sku": "AL-CAST-A356",
      "name": "Aluminium Casting A356 (per kg)",
      "unit": "kg",
      "price": 320,
      "gstPct": 18
    },
    {
      "id": "pl-003",
      "sku": "FAST-M10-HX",
      "name": "Hex Bolt M10 (per 100 nos)",
      "unit": "box",
      "price": 850,
      "gstPct": 18
    },
    {
      "id": "pl-004",
      "sku": "RBR-GSK-STD",
      "name": "Rubber Gasket Standard (per unit)",
      "unit": "nos",
      "price": 45,
      "gstPct": 12
    },
    {
      "id": "pl-005",
      "sku": "PWD-COAT-RAL",
      "name": "Powder Coating RAL finish (per sq.m)",
      "unit": "sq.m",
      "price": 210,
      "gstPct": 18
    },
    {
      "id": "pl-006",
      "sku": "BOX-CORR-5PLY",
      "name": "Corrugated Box 5-ply (per 100)",
      "unit": "box",
      "price": 2400,
      "gstPct": 12
    }
  ],
  "net-price-list-version": "2026-04-01",
  "net-sla": [
    {
      "id": "sla-001",
      "party": "Sharma Steel Traders",
      "onTimeDelivery": 96,
      "quality": 94,
      "responsiveness": 90,
      "orders": 48
    },
    {
      "id": "sla-002",
      "party": "Vega Precision Castings",
      "onTimeDelivery": 88,
      "quality": 92,
      "responsiveness": 85,
      "orders": 22
    },
    {
      "id": "sla-003",
      "party": "Ganga Fasteners Pvt Ltd",
      "onTimeDelivery": 92,
      "quality": 89,
      "responsiveness": 95,
      "orders": 31
    },
    {
      "id": "sla-004",
      "party": "Coastal Polymers LLP",
      "onTimeDelivery": 78,
      "quality": 85,
      "responsiveness": 72,
      "orders": 15
    },
    {
      "id": "sla-005",
      "party": "Nova Coatings & Paints",
      "onTimeDelivery": 98,
      "quality": 97,
      "responsiveness": 93,
      "orders": 27
    }
  ],
  "net-watchlist": [
    {
      "id": "wl-001",
      "party": "Coastal Polymers LLP",
      "risk": "high",
      "reason": "Two cheques bounced in last 90 days",
      "exposure": 420000,
      "action": "Move to advance payment until cleared",
      "addedAt": "2026-06-08"
    },
    {
      "id": "wl-002",
      "party": "Deccan Rubber Industries",
      "risk": "medium",
      "reason": "GST filing irregular, GSTR-3B late",
      "exposure": 180000,
      "action": "Cap credit at 1 lakh, monitor compliance",
      "addedAt": "2026-05-30"
    },
    {
      "id": "wl-003",
      "party": "Mehta Industrial Supplies",
      "risk": "low",
      "reason": "New relationship, limited track record",
      "exposure": 95000,
      "action": "Review after 3 clean cycles",
      "addedAt": "2026-06-12"
    },
    {
      "id": "wl-004",
      "party": "Bharat Auto Components Pvt Ltd",
      "risk": "medium",
      "reason": "Single buyer concentration >30% of AR",
      "exposure": 2350000,
      "action": "Diversify buyer base, seek insurance",
      "addedAt": "2026-04-18"
    }
  ],
  "net-meetings": [
    {
      "id": "mtg-001",
      "party": "Bharat Auto Components Pvt Ltd",
      "date": "2026-06-05",
      "channel": "in-person",
      "summary": "Q2 volume review, discussed Net-45 extension",
      "followUp": "Send revised rate card by 20 Jun",
      "followUpDone": true
    },
    {
      "id": "mtg-002",
      "party": "Sharma Steel Traders",
      "date": "2026-05-22",
      "channel": "call",
      "summary": "Negotiated 2% early-pay discount on bulk orders",
      "followUp": "Update trade terms in system",
      "followUpDone": true
    },
    {
      "id": "mtg-003",
      "party": "Vega Precision Castings",
      "date": "2026-06-12",
      "channel": "video",
      "summary": "Onboarding kickoff, sample approval pending",
      "followUp": "Receive first sample lot",
      "followUpDone": false
    },
    {
      "id": "mtg-004",
      "party": "Sunrise Electricals",
      "date": "2026-06-18",
      "channel": "event",
      "summary": "Met at Bengaluru Manufacturing Expo, explored co-marketing",
      "followUp": "Draft co-marketing proposal",
      "followUpDone": false
    },
    {
      "id": "mtg-005",
      "party": "Coastal Polymers LLP",
      "date": "2026-06-09",
      "channel": "call",
      "summary": "Discussed bounced cheque resolution plan",
      "followUp": "Collect demand draft for outstanding",
      "followUpDone": false
    }
  ],
  "net-netting": [
    {
      "id": "net-001",
      "party": "Krishna Engineering Works",
      "theyOweMe": 320000,
      "iOweThem": 185000
    },
    {
      "id": "net-002",
      "party": "Sharma Steel Traders",
      "theyOweMe": 0,
      "iOweThem": 540000
    },
    {
      "id": "net-003",
      "party": "Bharat Auto Components Pvt Ltd",
      "theyOweMe": 1180000,
      "iOweThem": 0
    },
    {
      "id": "net-004",
      "party": "Patel Logistics Pvt Ltd",
      "theyOweMe": 45000,
      "iOweThem": 220000
    },
    {
      "id": "net-005",
      "party": "Mehta Industrial Supplies",
      "theyOweMe": 28500,
      "iOweThem": 96000
    }
  ],
  "net-tier-scheme": [
    {
      "id": "bronze",
      "name": "Bronze",
      "minVolume": 0,
      "perk": "Standard terms"
    },
    {
      "id": "silver",
      "name": "Silver",
      "minVolume": 500000,
      "perk": "Net-15 terms"
    },
    {
      "id": "gold",
      "name": "Gold",
      "minVolume": 2000000,
      "perk": "Net-30 + 1% rebate"
    },
    {
      "id": "platinum",
      "name": "Platinum",
      "minVolume": 5000000,
      "perk": "Net-45 + 2% rebate, priority stock"
    }
  ],
  "net-terms-bench": [
    {
      "id": "tb-001",
      "party": "Sharma Steel Traders",
      "agreedDays": 30,
      "actualDays": 28
    },
    {
      "id": "tb-002",
      "party": "Bharat Auto Components Pvt Ltd",
      "agreedDays": 45,
      "actualDays": 52
    },
    {
      "id": "tb-003",
      "party": "Krishna Engineering Works",
      "agreedDays": 30,
      "actualDays": 41
    },
    {
      "id": "tb-004",
      "party": "Sunrise Electricals",
      "agreedDays": 30,
      "actualDays": 26
    },
    {
      "id": "tb-005",
      "party": "Coastal Polymers LLP",
      "agreedDays": 30,
      "actualDays": 63
    }
  ],
  "net-co-market": [
    {
      "id": "cm-001",
      "partner": "Sunrise Electricals",
      "title": "Joint stall at Bengaluru Manufacturing Expo",
      "channel": "Trade event",
      "myBudget": 150000,
      "theirBudget": 150000,
      "date": "2026-08-14",
      "status": "planned"
    },
    {
      "id": "cm-002",
      "partner": "Bharat Auto Components Pvt Ltd",
      "title": "Co-branded LinkedIn case study",
      "channel": "Social media",
      "myBudget": 40000,
      "theirBudget": 30000,
      "date": "2026-05-10",
      "status": "done"
    },
    {
      "id": "cm-003",
      "partner": "Nova Coatings & Paints",
      "title": "Webinar: Durable industrial finishes",
      "channel": "Webinar",
      "myBudget": 25000,
      "theirBudget": 25000,
      "date": "2026-07-02",
      "status": "live"
    },
    {
      "id": "cm-004",
      "partner": "Sharma Steel Traders",
      "title": "WhatsApp catalogue cross-promo",
      "channel": "WhatsApp",
      "myBudget": 10000,
      "theirBudget": 10000,
      "date": "2026-06-20",
      "status": "live"
    }
  ],
  "net-intros-ledger": [
    {
      "id": "intr-001",
      "date": "2026-03-15",
      "direction": "given",
      "partner": "Sharma Steel Traders",
      "toWhom": "Vega Precision Castings",
      "outcome": "deal",
      "note": "Led to recurring casting supply order"
    },
    {
      "id": "intr-002",
      "date": "2026-04-08",
      "direction": "received",
      "partner": "Bharat Auto Components Pvt Ltd",
      "toWhom": "Sunrise Electricals",
      "outcome": "deal",
      "note": "New electricals buyer onboarded"
    },
    {
      "id": "intr-003",
      "date": "2026-05-20",
      "direction": "given",
      "partner": "Krishna Engineering Works",
      "toWhom": "Tirupati Packaging Solutions",
      "outcome": "pending",
      "note": "Awaiting first PO"
    },
    {
      "id": "intr-004",
      "date": "2026-06-01",
      "direction": "received",
      "partner": "Nova Coatings & Paints",
      "toWhom": "Himalaya Tool & Die",
      "outcome": "dropped",
      "note": "Pricing did not match requirement"
    },
    {
      "id": "intr-005",
      "date": "2026-06-16",
      "direction": "given",
      "partner": "Mehta Industrial Supplies",
      "toWhom": "Ganga Fasteners Pvt Ltd",
      "outcome": "pending",
      "note": "Introduction email sent"
    }
  ],
  "net-forecast-share": [
    {
      "id": "fc-001",
      "partner": "Bharat Auto Components Pvt Ltd",
      "month": "2026-07",
      "forecastQty": 4200,
      "lastActual": 3900
    },
    {
      "id": "fc-002",
      "partner": "Bharat Auto Components Pvt Ltd",
      "month": "2026-08",
      "forecastQty": 4500,
      "lastActual": 4100
    },
    {
      "id": "fc-003",
      "partner": "Sunrise Electricals",
      "month": "2026-07",
      "forecastQty": 1800,
      "lastActual": 1650
    },
    {
      "id": "fc-004",
      "partner": "Krishna Engineering Works",
      "month": "2026-07",
      "forecastQty": 950,
      "lastActual": 1020
    },
    {
      "id": "fc-005",
      "partner": "Sunrise Electricals",
      "month": "2026-08",
      "forecastQty": 2000,
      "lastActual": 1650
    }
  ],
  "net-partner-nps": [
    {
      "id": "nps-001",
      "partner": "Sharma Steel Traders",
      "score": 9,
      "comment": "Consistent quality and reliable delivery"
    },
    {
      "id": "nps-002",
      "partner": "Bharat Auto Components Pvt Ltd",
      "score": 8,
      "comment": "Great volume partner, occasional payment delays"
    },
    {
      "id": "nps-003",
      "partner": "Vega Precision Castings",
      "score": 7,
      "comment": "Good casting quality, lead time can improve"
    },
    {
      "id": "nps-004",
      "partner": "Coastal Polymers LLP",
      "score": 4,
      "comment": "Payment reliability concerns this quarter"
    },
    {
      "id": "nps-005",
      "partner": "Nova Coatings & Paints",
      "score": 10,
      "comment": "Best-in-class finish, very responsive team"
    }
  ],
  "net-jv-split": [
    {
      "id": "jv-001",
      "partner": "Sunrise Electricals",
      "revenue": 4500000,
      "cost": 2800000,
      "mySharePct": 60,
      "note": "Switchgear assembly JV, Q1-Q2 FY27"
    },
    {
      "id": "jv-002",
      "partner": "Bharat Auto Components Pvt Ltd",
      "revenue": 7200000,
      "cost": 4600000,
      "mySharePct": 50,
      "note": "Tier-2 supply consortium"
    },
    {
      "id": "jv-003",
      "partner": "Vega Precision Castings",
      "revenue": 2100000,
      "cost": 1500000,
      "mySharePct": 70,
      "note": "Casting + machining bundle"
    },
    {
      "id": "jv-004",
      "partner": "Nova Coatings & Paints",
      "revenue": 1800000,
      "cost": 1100000,
      "mySharePct": 55,
      "note": "Coated component line"
    }
  ],
  "invoice-quotations": [
    {
      "id": "q-001",
      "number": "QT-2026-001",
      "customer": "Bharat Auto Components Pvt Ltd",
      "validUntil": "2026-07-15",
      "items": [
        {
          "id": "qi-1",
          "description": "MS Plate 12mm",
          "hsn_sac": "7208",
          "qty": "500",
          "rate": "480",
          "gst": "18"
        },
        {
          "id": "qi-2",
          "description": "Hex Bolt M10",
          "hsn_sac": "7318",
          "qty": "20",
          "rate": "850",
          "gst": "18"
        }
      ],
      "status": "converted",
      "createdAt": "2026-05-10T09:30:00.000Z"
    },
    {
      "id": "q-002",
      "number": "QT-2026-002",
      "customer": "Sunrise Electricals",
      "validUntil": "2026-07-01",
      "items": [
        {
          "id": "qi-3",
          "description": "Powder Coating RAL",
          "hsn_sac": "3208",
          "qty": "120",
          "rate": "210",
          "gst": "18"
        }
      ],
      "status": "accepted",
      "createdAt": "2026-06-02T11:15:00.000Z"
    },
    {
      "id": "q-003",
      "number": "QT-2026-003",
      "customer": "Krishna Engineering Works",
      "validUntil": "2026-06-30",
      "items": [
        {
          "id": "qi-4",
          "description": "Aluminium Casting A356",
          "hsn_sac": "7601",
          "qty": "300",
          "rate": "320",
          "gst": "18"
        }
      ],
      "status": "open",
      "createdAt": "2026-06-14T14:00:00.000Z"
    },
    {
      "id": "q-004",
      "number": "QT-2026-004",
      "customer": "Mehta Industrial Supplies",
      "validUntil": "2026-07-20",
      "items": [
        {
          "id": "qi-5",
          "description": "Rubber Gasket Standard",
          "hsn_sac": "4016",
          "qty": "2000",
          "rate": "45",
          "gst": "12"
        }
      ],
      "status": "open",
      "createdAt": "2026-06-18T10:45:00.000Z"
    }
  ],
  "invoice-proformas": [
    {
      "id": "pf-001",
      "number": "PI-2026-001",
      "customer": "Sunrise Electricals",
      "advancePct": "50",
      "items": [
        {
          "id": "pfi-1",
          "description": "Switchgear panel assembly",
          "hsn_sac": "8537",
          "qty": "10",
          "rate": "45000",
          "gst": "18"
        }
      ],
      "converted": true,
      "createdAt": "2026-04-12T09:00:00.000Z"
    },
    {
      "id": "pf-002",
      "number": "PI-2026-002",
      "customer": "Bharat Auto Components Pvt Ltd",
      "advancePct": "40",
      "items": [
        {
          "id": "pfi-2",
          "description": "Machined housing batch",
          "hsn_sac": "8483",
          "qty": "500",
          "rate": "1200",
          "gst": "18"
        }
      ],
      "converted": false,
      "createdAt": "2026-06-05T15:20:00.000Z"
    },
    {
      "id": "pf-003",
      "number": "PI-2026-003",
      "customer": "Krishna Engineering Works",
      "advancePct": "30",
      "items": [
        {
          "id": "pfi-3",
          "description": "Custom tooling set",
          "hsn_sac": "8207",
          "qty": "1",
          "rate": "380000",
          "gst": "18"
        }
      ],
      "converted": false,
      "createdAt": "2026-06-15T12:00:00.000Z"
    },
    {
      "id": "pf-004",
      "number": "PI-2026-004",
      "customer": "Vega Precision Castings",
      "advancePct": "50",
      "items": [
        {
          "id": "pfi-4",
          "description": "Aluminium castings (bulk)",
          "hsn_sac": "7601",
          "qty": "1000",
          "rate": "320",
          "gst": "18"
        }
      ],
      "converted": true,
      "createdAt": "2026-05-28T08:30:00.000Z"
    }
  ],
  "invoice-recurring": [
    {
      "id": "rec-001",
      "customer": "Sunrise Electricals",
      "amount": "85000",
      "gst": "18",
      "freq": "monthly",
      "nextRun": "2026-07-01",
      "active": true,
      "generated": 11
    },
    {
      "id": "rec-002",
      "customer": "Bharat Auto Components Pvt Ltd",
      "amount": "240000",
      "gst": "18",
      "freq": "monthly",
      "nextRun": "2026-07-05",
      "active": true,
      "generated": 8
    },
    {
      "id": "rec-003",
      "customer": "Krishna Engineering Works",
      "amount": "150000",
      "gst": "18",
      "freq": "quarterly",
      "nextRun": "2026-09-01",
      "active": true,
      "generated": 4
    },
    {
      "id": "rec-004",
      "customer": "Mehta Industrial Supplies",
      "amount": "45000",
      "gst": "12",
      "freq": "monthly",
      "nextRun": "2026-07-01",
      "active": false,
      "generated": 6
    },
    {
      "id": "rec-005",
      "customer": "Coastal Polymers LLP",
      "amount": "320000",
      "gst": "18",
      "freq": "yearly",
      "nextRun": "2027-04-01",
      "active": true,
      "generated": 1
    }
  ],
  "invoice-cdnotes": [
    {
      "id": "cn-001",
      "type": "credit",
      "number": "CN-2026-009",
      "againstInvoice": "INV-2026-0097",
      "customer": "Krishna Engineering Works",
      "reason": "Damaged goods in transit — credit for damaged lot",
      "taxable": "118000",
      "gst": "18",
      "createdAt": "2026-04-20T10:00:00.000Z"
    },
    {
      "id": "cn-002",
      "type": "credit",
      "number": "CN-2026-010",
      "againstInvoice": "INV-2026-0118",
      "customer": "Sunrise Electricals",
      "reason": "Rate correction per agreed price list",
      "taxable": "2500",
      "gst": "18",
      "createdAt": "2026-06-01T09:30:00.000Z"
    },
    {
      "id": "cn-003",
      "type": "debit",
      "number": "DN-2026-003",
      "againstInvoice": "INV-2026-0142",
      "customer": "Bharat Auto Components Pvt Ltd",
      "reason": "Additional freight charges",
      "taxable": "8500",
      "gst": "18",
      "createdAt": "2026-06-11T14:15:00.000Z"
    },
    {
      "id": "cn-004",
      "type": "credit",
      "number": "CN-2026-011",
      "againstInvoice": "INV-2026-0061",
      "customer": "Coastal Polymers LLP",
      "reason": "Late delivery penalty waiver",
      "taxable": "7000",
      "gst": "18",
      "createdAt": "2026-03-25T11:00:00.000Z"
    }
  ],
  "invoice-credit-limits": [
    {
      "id": "cl-001",
      "customer": "Bharat Auto Components Pvt Ltd",
      "limit": "2500000",
      "overdueDaysHold": "15"
    },
    {
      "id": "cl-002",
      "customer": "Sunrise Electricals",
      "limit": "1200000",
      "overdueDaysHold": "30"
    },
    {
      "id": "cl-003",
      "customer": "Krishna Engineering Works",
      "limit": "800000",
      "overdueDaysHold": "20"
    },
    {
      "id": "cl-004",
      "customer": "Coastal Polymers LLP",
      "limit": "300000",
      "overdueDaysHold": "7"
    },
    {
      "id": "cl-005",
      "customer": "Mehta Industrial Supplies",
      "limit": "600000",
      "overdueDaysHold": "15"
    }
  ],
  "invoice-fx": [
    {
      "id": "fx-001",
      "number": "EXP-2026-001",
      "customer": "Gulf Auto Parts FZE (Dubai)",
      "currency": "USD",
      "fcyAmount": "18500",
      "rateAtInvoice": "83.20",
      "rateAtRealisation": "83.65",
      "realised": true,
      "createdAt": "2026-04-02T09:00:00.000Z"
    },
    {
      "id": "fx-002",
      "number": "EXP-2026-002",
      "customer": "Singapore Industrial Pte Ltd",
      "currency": "SGD",
      "fcyAmount": "24000",
      "rateAtInvoice": "61.40",
      "rateAtRealisation": "0",
      "realised": false,
      "createdAt": "2026-06-10T10:30:00.000Z"
    },
    {
      "id": "fx-003",
      "number": "EXP-2026-003",
      "customer": "EuroMech GmbH (Germany)",
      "currency": "EUR",
      "fcyAmount": "31000",
      "rateAtInvoice": "90.10",
      "rateAtRealisation": "89.55",
      "realised": true,
      "createdAt": "2026-03-18T08:45:00.000Z"
    },
    {
      "id": "fx-004",
      "number": "EXP-2026-004",
      "customer": "Britannia Engineering Ltd (UK)",
      "currency": "GBP",
      "fcyAmount": "12500",
      "rateAtInvoice": "105.30",
      "rateAtRealisation": "0",
      "realised": false,
      "createdAt": "2026-06-15T13:00:00.000Z"
    }
  ],
  "invoice-approval-threshold": 200000,
  "invoice-approvals": [
    {
      "id": "ap-001",
      "invoiceNumber": "INV-2026-0142",
      "customer": "Bharat Auto Components Pvt Ltd",
      "amount": 286000,
      "maker": "Priya Nair",
      "status": "approved",
      "note": "Within agreed Net-45 terms",
      "createdAt": "2026-06-04T09:00:00.000Z"
    },
    {
      "id": "ap-002",
      "invoiceNumber": "INV-2026-0150",
      "customer": "Coastal Polymers LLP",
      "amount": 320000,
      "maker": "Ravi Kumar",
      "status": "rejected",
      "note": "Customer on risk watchlist — require advance",
      "createdAt": "2026-06-08T11:30:00.000Z"
    },
    {
      "id": "ap-003",
      "invoiceNumber": "INV-2026-0155",
      "customer": "Sunrise Electricals",
      "amount": 410000,
      "maker": "Priya Nair",
      "status": "pending",
      "note": "Large milestone billing, awaiting director sign-off",
      "createdAt": "2026-06-17T14:20:00.000Z"
    },
    {
      "id": "ap-004",
      "invoiceNumber": "INV-2026-0158",
      "customer": "Krishna Engineering Works",
      "amount": 245000,
      "maker": "Anil Deshpande",
      "status": "approved",
      "note": "Standard order, terms verified",
      "createdAt": "2026-06-19T10:00:00.000Z"
    }
  ],
  "invoice-template-theme": {
    "logoText": "ACME MANUFACTURING",
    "primary": "#0f766e",
    "accent": "#ecfeff",
    "font": "Inter",
    "terms": "Payment due within 30 days. Interest @18% p.a. on overdue amounts. Goods once sold will not be taken back.",
    "footer": "Acme Manufacturing Pvt Ltd · GSTIN 29ABCDE1234F1Z5 · Bengaluru · Thank you for your business."
  },
  "invoice-challans": [
    {
      "id": "ch-001",
      "number": "DC-2026-001",
      "customer": "Bharat Auto Components Pvt Ltd",
      "purpose": "Job work — machining",
      "vehicle": "KA 05 MH 4521",
      "items": [
        {
          "id": "chi-1",
          "description": "Raw castings for machining",
          "hsn_sac": "7601",
          "qty": "200",
          "rate": "0",
          "gst": "18"
        }
      ],
      "invoiced": true,
      "createdAt": "2026-05-30T08:00:00.000Z"
    },
    {
      "id": "ch-002",
      "number": "DC-2026-002",
      "customer": "Sunrise Electricals",
      "purpose": "Goods delivery",
      "vehicle": "KA 01 AB 7788",
      "items": [
        {
          "id": "chi-2",
          "description": "Switchgear panels",
          "hsn_sac": "8537",
          "qty": "10",
          "rate": "0",
          "gst": "18"
        }
      ],
      "invoiced": true,
      "createdAt": "2026-06-06T09:30:00.000Z"
    },
    {
      "id": "ch-003",
      "number": "DC-2026-003",
      "customer": "Krishna Engineering Works",
      "purpose": "Sample dispatch",
      "vehicle": "KA 03 CD 1199",
      "items": [
        {
          "id": "chi-3",
          "description": "Prototype tooling",
          "hsn_sac": "8207",
          "qty": "1",
          "rate": "0",
          "gst": "18"
        }
      ],
      "invoiced": false,
      "createdAt": "2026-06-16T11:00:00.000Z"
    },
    {
      "id": "ch-004",
      "number": "DC-2026-004",
      "customer": "Mehta Industrial Supplies",
      "purpose": "Returnable — testing",
      "vehicle": "KA 05 EF 6633",
      "items": [
        {
          "id": "chi-4",
          "description": "Gasket test batch",
          "hsn_sac": "4016",
          "qty": "500",
          "rate": "0",
          "gst": "12"
        }
      ],
      "invoiced": false,
      "createdAt": "2026-06-19T15:00:00.000Z"
    }
  ],
  "invoice-late-interest-rate": 18,
  "invoice-late-flat-fee": 500,
  "invoice-late-grace-days": 5,
  "invoice-late-applied": {
    "inv-seed-3": 2400,
    "inv-seed-4": 5600,
    "inv-late-0097": 3100,
    "inv-late-0061": 1800
  },
  "invoice-po-match": [
    {
      "id": "po-001",
      "poNumber": "PO-BAC-2026-512",
      "customer": "Bharat Auto Components Pvt Ltd",
      "poAmount": "286000",
      "invoiceNumber": "INV-2026-0142",
      "tolerancePct": "5",
      "createdAt": "2026-06-03T09:00:00.000Z"
    },
    {
      "id": "po-002",
      "poNumber": "PO-SE-2026-088",
      "customer": "Sunrise Electricals",
      "poAmount": "410000",
      "invoiceNumber": "INV-2026-0155",
      "tolerancePct": "2",
      "createdAt": "2026-06-15T10:00:00.000Z"
    },
    {
      "id": "po-003",
      "poNumber": "PO-KEW-2026-031",
      "customer": "Krishna Engineering Works",
      "poAmount": "245000",
      "invoiceNumber": "INV-2026-0158",
      "tolerancePct": "5",
      "createdAt": "2026-06-18T11:30:00.000Z"
    },
    {
      "id": "po-004",
      "poNumber": "PO-MIS-2026-014",
      "customer": "Mehta Industrial Supplies",
      "poAmount": "96000",
      "invoiceNumber": "INV-2026-0156",
      "tolerancePct": "10",
      "createdAt": "2026-06-14T14:00:00.000Z"
    }
  ],
  "invoice-disputes": [
    {
      "id": "idsp-001",
      "party": "Bharat Auto Components Pvt Ltd",
      "invoiceRef": "INV-2026-0142",
      "amount": 86000,
      "reason": "Short shipment — 12 units less than PO",
      "status": "open",
      "openedAt": "2026-06-10",
      "proposed": 74000,
      "note": "Awaiting buyer's GRN copy"
    },
    {
      "id": "idsp-002",
      "party": "Sunrise Electricals",
      "invoiceRef": "INV-2026-0118",
      "amount": 45000,
      "reason": "Rate mismatch vs agreed price list",
      "status": "mediating",
      "openedAt": "2026-05-28",
      "proposed": 42500,
      "note": "Reviewing against QT-2026-002"
    },
    {
      "id": "idsp-003",
      "party": "Krishna Engineering Works",
      "invoiceRef": "INV-2026-0097",
      "amount": 132000,
      "reason": "Damaged goods in transit",
      "status": "resolved",
      "openedAt": "2026-04-15",
      "proposed": 118000,
      "note": "Credit note CN-2026-009 issued"
    },
    {
      "id": "idsp-004",
      "party": "Mehta Industrial Supplies",
      "invoiceRef": "INV-2026-0156",
      "amount": 28500,
      "reason": "TDS not reflecting in 26AS",
      "status": "open",
      "openedAt": "2026-06-15",
      "proposed": 28500,
      "note": "Requested reconciliation"
    }
  ],
  "invoice-payment-terms": [
    {
      "id": "net15",
      "name": "Net 15",
      "netDays": 15,
      "earlyPayDays": 0,
      "earlyPayDiscount": 0,
      "lateRate": 18,
      "isDefault": false
    },
    {
      "id": "net30",
      "name": "Net 30",
      "netDays": 30,
      "earlyPayDays": 0,
      "earlyPayDiscount": 0,
      "lateRate": 18,
      "isDefault": true
    },
    {
      "id": "2-10-net30",
      "name": "2/10 Net 30",
      "netDays": 30,
      "earlyPayDays": 10,
      "earlyPayDiscount": 2,
      "lateRate": 18,
      "isDefault": false
    },
    {
      "id": "net45",
      "name": "Net 45",
      "netDays": 45,
      "earlyPayDays": 0,
      "earlyPayDiscount": 0,
      "lateRate": 15,
      "isDefault": false
    },
    {
      "id": "due-receipt",
      "name": "Due on receipt",
      "netDays": 0,
      "earlyPayDays": 0,
      "earlyPayDiscount": 0,
      "lateRate": 24,
      "isDefault": false
    }
  ],
  "invoice-milestones": [
    {
      "id": "ms-001",
      "customer": "Sunrise Electricals",
      "contractValue": "1200000",
      "gst": "18",
      "milestones": [
        {
          "id": "mss-1",
          "name": "Advance on order",
          "pct": "30",
          "billed": true
        },
        {
          "id": "mss-2",
          "name": "On design approval",
          "pct": "30",
          "billed": true
        },
        {
          "id": "mss-3",
          "name": "On delivery",
          "pct": "30",
          "billed": false
        },
        {
          "id": "mss-4",
          "name": "On commissioning",
          "pct": "10",
          "billed": false
        }
      ],
      "createdAt": "2026-04-10T09:00:00.000Z"
    },
    {
      "id": "ms-002",
      "customer": "Krishna Engineering Works",
      "contractValue": "780000",
      "gst": "18",
      "milestones": [
        {
          "id": "mss-5",
          "name": "Tooling advance",
          "pct": "50",
          "billed": true
        },
        {
          "id": "mss-6",
          "name": "First article approval",
          "pct": "25",
          "billed": false
        },
        {
          "id": "mss-7",
          "name": "Production handover",
          "pct": "25",
          "billed": false
        }
      ],
      "createdAt": "2026-05-15T10:30:00.000Z"
    },
    {
      "id": "ms-003",
      "customer": "Bharat Auto Components Pvt Ltd",
      "contractValue": "2400000",
      "gst": "18",
      "milestones": [
        {
          "id": "mss-8",
          "name": "Phase 1 supply",
          "pct": "40",
          "billed": true
        },
        {
          "id": "mss-9",
          "name": "Phase 2 supply",
          "pct": "40",
          "billed": false
        },
        {
          "id": "mss-10",
          "name": "Retention release",
          "pct": "20",
          "billed": false
        }
      ],
      "createdAt": "2026-03-20T08:00:00.000Z"
    }
  ],
  "invoice-advances": [
    {
      "id": "adv-001",
      "customer": "Sunrise Electricals",
      "received": "360000",
      "adjusted": "240000",
      "createdAt": "2026-04-10T09:00:00.000Z"
    },
    {
      "id": "adv-002",
      "customer": "Krishna Engineering Works",
      "received": "390000",
      "adjusted": "0",
      "createdAt": "2026-05-15T10:30:00.000Z"
    },
    {
      "id": "adv-003",
      "customer": "Bharat Auto Components Pvt Ltd",
      "received": "960000",
      "adjusted": "600000",
      "createdAt": "2026-03-20T08:00:00.000Z"
    },
    {
      "id": "adv-004",
      "customer": "Vega Precision Castings",
      "received": "160000",
      "adjusted": "160000",
      "createdAt": "2026-05-28T11:00:00.000Z"
    }
  ],
  "invoice-irp-supplier-gstin": "29ABCDE1234F1Z5",
  "invoice-irp-supplier-state": "29",
  "invoice-partial-payments": [
    {
      "id": "pp-001",
      "invoiceId": "INV-2026-0142",
      "amount": "150000",
      "mode": "NEFT",
      "date": "2026-06-12"
    },
    {
      "id": "pp-002",
      "invoiceId": "INV-2026-0142",
      "amount": "100000",
      "mode": "UPI",
      "date": "2026-06-18"
    },
    {
      "id": "pp-003",
      "invoiceId": "INV-2026-0118",
      "amount": "200000",
      "mode": "Cheque",
      "date": "2026-06-05"
    },
    {
      "id": "pp-004",
      "invoiceId": "INV-2026-0155",
      "amount": "180000",
      "mode": "RTGS",
      "date": "2026-06-19"
    },
    {
      "id": "pp-005",
      "invoiceId": "INV-2026-0097",
      "amount": "132000",
      "mode": "NEFT",
      "date": "2026-05-02"
    }
  ],
  "invoice-line-costs": {
    "MS-PLATE-12": "410",
    "AL-CAST-A356": "265",
    "FAST-M10-HX": "640",
    "RBR-GSK-STD": "31",
    "PWD-COAT-RAL": "155",
    "BOX-CORR-5PLY": "1850"
  },
  "inv-duedate-default": "30",
  "inv-duplicate-window": "14",
  "gst-rcm-register": [
    {
      "id": "rcm-001",
      "desc": "Legal fees — advocate (unregistered)",
      "supplier": "Rao & Associates, Advocates",
      "amount": 85000,
      "rate": 18,
      "date": "2026-04-12"
    },
    {
      "id": "rcm-002",
      "desc": "Goods Transport Agency freight",
      "supplier": "Karnataka Roadlines (GTA)",
      "amount": 142000,
      "rate": 5,
      "date": "2026-04-28"
    },
    {
      "id": "rcm-003",
      "desc": "Import of design services",
      "supplier": "Shenzhen Mould Tech Co",
      "amount": 310000,
      "rate": 18,
      "date": "2026-05-09"
    },
    {
      "id": "rcm-004",
      "desc": "Director sitting fees",
      "supplier": "Mr. Suresh Iyer (Director)",
      "amount": 120000,
      "rate": 18,
      "date": "2026-05-20"
    },
    {
      "id": "rcm-005",
      "desc": "Security services from unregistered agency",
      "supplier": "Sentinel Guarding Services",
      "amount": 96000,
      "rate": 18,
      "date": "2026-06-03"
    },
    {
      "id": "rcm-006",
      "desc": "Sponsorship to local trade body",
      "supplier": "Peenya Industrial Assn.",
      "amount": 50000,
      "rate": 18,
      "date": "2026-06-15"
    }
  ],
  "lut-register": [
    {
      "id": "lut-001",
      "refNo": "AD2904250012345",
      "fy": "2025-2026",
      "filedDate": "2025-04-02",
      "exportType": "goods",
      "status": "expired"
    },
    {
      "id": "lut-002",
      "refNo": "AD2904260054321",
      "fy": "2026-2027",
      "filedDate": "2026-04-01",
      "exportType": "goods",
      "status": "active"
    },
    {
      "id": "lut-003",
      "refNo": "AD2904260098765",
      "fy": "2026-2027",
      "filedDate": "2026-04-05",
      "exportType": "both",
      "status": "active"
    },
    {
      "id": "lut-004",
      "refNo": "AD2904250067890",
      "fy": "2025-2026",
      "filedDate": "2025-04-10",
      "exportType": "services",
      "status": "expired"
    }
  ],
  "gst-refunds": [
    {
      "id": "rfd-001",
      "refNo": "RFD-48217",
      "type": "Export (LUT)",
      "period": "Apr 2026",
      "claimed": 425000,
      "status": "Credited",
      "filedDate": "2026-05-08",
      "notes": "Accumulated ITC on machine exports to UAE"
    },
    {
      "id": "rfd-002",
      "refNo": "RFD-51932",
      "type": "Inverted Duty",
      "period": "Mar 2026",
      "claimed": 218500,
      "status": "Approved",
      "filedDate": "2026-04-22",
      "notes": "Inverted structure on motor components 18% in / 12% out"
    },
    {
      "id": "rfd-003",
      "refNo": "RFD-54810",
      "type": "Excess Cash Ledger",
      "period": "May 2026",
      "claimed": 64000,
      "status": "Processing",
      "filedDate": "2026-06-02",
      "notes": "Excess deposit in CGST head"
    },
    {
      "id": "rfd-004",
      "refNo": "RFD-57221",
      "type": "IGST on Export",
      "period": "May 2026",
      "claimed": 310000,
      "status": "Filed",
      "filedDate": "2026-06-10",
      "notes": "With-payment route, awaiting shipping bill match"
    },
    {
      "id": "rfd-005",
      "refNo": "RFD-49003",
      "type": "Deemed Export",
      "period": "Feb 2026",
      "claimed": 152000,
      "status": "Deficiency",
      "filedDate": "2026-03-18",
      "notes": "RFD-03 issued — resubmit with EPCG annexure"
    }
  ],
  "tds-gst-entries": [
    {
      "id": "tdsg-001",
      "deductor": "Bharat Heavy Electricals Ltd",
      "contract": "Supply of fabricated assemblies",
      "amount": 1850000,
      "tdsAmt": 37000,
      "month": "2026-04",
      "credited": true
    },
    {
      "id": "tdsg-002",
      "deductor": "Karnataka State PWD",
      "contract": "Works contract — plant shed",
      "amount": 920000,
      "tdsAmt": 18400,
      "month": "2026-05",
      "credited": true
    },
    {
      "id": "tdsg-003",
      "deductor": "Indian Railways (South Western)",
      "contract": "Component supply order",
      "amount": 1340000,
      "tdsAmt": 26800,
      "month": "2026-05",
      "credited": false
    },
    {
      "id": "tdsg-004",
      "deductor": "BBMP Bengaluru",
      "contract": "Civic infra fittings",
      "amount": 560000,
      "tdsAmt": 11200,
      "month": "2026-06",
      "credited": false
    },
    {
      "id": "tdsg-005",
      "deductor": "Hindustan Aeronautics Ltd",
      "contract": "Precision machining contract",
      "amount": 2210000,
      "tdsAmt": 44200,
      "month": "2026-06",
      "credited": false
    }
  ],
  "itc-recon-books": [
    {
      "id": "itcr-001",
      "gstin": "29AAACH7409R1ZX",
      "invoiceNo": "STL-4471",
      "party": "Jindal Steel Traders",
      "booksTax": 94500,
      "portalTax": 94500,
      "supplierFiled": true
    },
    {
      "id": "itcr-002",
      "gstin": "27AABCT3518Q1ZY",
      "invoiceNo": "TT-9920",
      "party": "Tata Tooling Pvt Ltd",
      "booksTax": 61200,
      "portalTax": 0,
      "supplierFiled": false
    },
    {
      "id": "itcr-003",
      "gstin": "29AAGCS1234M1Z2",
      "invoiceNo": "SE-1185",
      "party": "Siemens Electricals",
      "booksTax": 38400,
      "portalTax": 38400,
      "supplierFiled": true
    },
    {
      "id": "itcr-004",
      "gstin": "33AAFCP9087L1ZK",
      "invoiceNo": "PP-3302",
      "party": "Precision Plastics Chennai",
      "booksTax": 27600,
      "portalTax": 24000,
      "supplierFiled": true
    },
    {
      "id": "itcr-005",
      "gstin": "29AADCB5566N1ZP",
      "invoiceNo": "BC-7781",
      "party": "Bharath Coatings",
      "booksTax": 15800,
      "portalTax": 15800,
      "supplierFiled": true
    },
    {
      "id": "itcr-006",
      "gstin": "06AAHCR2210J1ZT",
      "invoiceNo": "RL-4456",
      "party": "Rico Lubricants Gurgaon",
      "booksTax": 42000,
      "portalTax": 0,
      "supplierFiled": false
    }
  ],
  "multi-gstin-units": [
    {
      "id": "unit-001",
      "gstin": "29ABCDE1234F1Z5",
      "state": "Karnataka",
      "output": 2850000,
      "itc": 1640000,
      "cashLedger": 320000
    },
    {
      "id": "unit-002",
      "gstin": "27ABCDE1234F1ZA",
      "state": "Maharashtra",
      "output": 1420000,
      "itc": 980000,
      "cashLedger": 150000
    },
    {
      "id": "unit-003",
      "gstin": "33ABCDE1234F1ZP",
      "state": "Tamil Nadu",
      "output": 1110000,
      "itc": 720000,
      "cashLedger": 95000
    },
    {
      "id": "unit-004",
      "gstin": "07ABCDE1234F1ZD",
      "state": "Delhi",
      "output": 640000,
      "itc": 510000,
      "cashLedger": 40000
    }
  ],
  "rate-change-items": [
    {
      "id": "rci-001",
      "name": "CNC-machined bracket",
      "base": 4500,
      "oldRate": 12,
      "newRate": 18,
      "gstInclusive": true
    },
    {
      "id": "rci-002",
      "name": "Industrial gearbox unit",
      "base": 38000,
      "oldRate": 18,
      "newRate": 18,
      "gstInclusive": false
    },
    {
      "id": "rci-003",
      "name": "Sheet-metal enclosure",
      "base": 7800,
      "oldRate": 12,
      "newRate": 18,
      "gstInclusive": true
    },
    {
      "id": "rci-004",
      "name": "Hydraulic valve assembly",
      "base": 15600,
      "oldRate": 18,
      "newRate": 12,
      "gstInclusive": false
    },
    {
      "id": "rci-005",
      "name": "Spare-parts service kit",
      "base": 2300,
      "oldRate": 5,
      "newRate": 12,
      "gstInclusive": true
    }
  ],
  "blocked-credit-entries": [
    {
      "id": "bce-001",
      "head": "Motor vehicles (≤13 seats) — not for resale/transport/training",
      "amount": 126000,
      "blocked": true,
      "reason": "17(5)(a)"
    },
    {
      "id": "bce-002",
      "head": "Food, beverages, outdoor catering",
      "amount": 48000,
      "blocked": true,
      "reason": "17(5)(b)(i)"
    },
    {
      "id": "bce-003",
      "head": "Works contract / goods for construction of immovable property",
      "amount": 215000,
      "blocked": true,
      "reason": "17(5)(c)/(d)"
    },
    {
      "id": "bce-004",
      "head": "Raw materials / inputs for taxable supply",
      "amount": 540000,
      "blocked": false,
      "reason": "Eligible"
    },
    {
      "id": "bce-005",
      "head": "Plant & machinery for business",
      "amount": 380000,
      "blocked": false,
      "reason": "Eligible"
    },
    {
      "id": "bce-006",
      "head": "Business services (audit, IT, rent of commercial premise)",
      "amount": 92000,
      "blocked": false,
      "reason": "Eligible"
    }
  ],
  "vendor-gst-score": [
    {
      "id": "vgs-001",
      "name": "Jindal Steel Traders",
      "gstin": "29AAACH7409R1ZX",
      "filedOnTime": 12,
      "totalReturns": 12,
      "itcAtRisk": 0,
      "lastFiled": "2026-06-11"
    },
    {
      "id": "vgs-002",
      "name": "Tata Tooling Pvt Ltd",
      "gstin": "27AABCT3518Q1ZY",
      "filedOnTime": 7,
      "totalReturns": 12,
      "itcAtRisk": 61200,
      "lastFiled": "2026-04-20"
    },
    {
      "id": "vgs-003",
      "name": "Siemens Electricals",
      "gstin": "29AAGCS1234M1Z2",
      "filedOnTime": 11,
      "totalReturns": 12,
      "itcAtRisk": 0,
      "lastFiled": "2026-06-09"
    },
    {
      "id": "vgs-004",
      "name": "Rico Lubricants Gurgaon",
      "gstin": "06AAHCR2210J1ZT",
      "filedOnTime": 5,
      "totalReturns": 12,
      "itcAtRisk": 42000,
      "lastFiled": "2026-03-15"
    },
    {
      "id": "vgs-005",
      "name": "Bharath Coatings",
      "gstin": "29AADCB5566N1ZP",
      "filedOnTime": 10,
      "totalReturns": 12,
      "itcAtRisk": 8000,
      "lastFiled": "2026-05-30"
    }
  ],
  "gst-advances": [
    {
      "id": "adv-001",
      "customer": "Bharat Heavy Electricals Ltd",
      "advance": 500000,
      "rate": 18,
      "date": "2026-05-04",
      "adjusted": true,
      "invoiceNo": "ACM/26-27/0142"
    },
    {
      "id": "adv-002",
      "customer": "L&T Construction",
      "advance": 320000,
      "rate": 18,
      "date": "2026-05-18",
      "adjusted": false,
      "invoiceNo": ""
    },
    {
      "id": "adv-003",
      "customer": "Mahindra & Mahindra",
      "advance": 275000,
      "rate": 12,
      "date": "2026-06-02",
      "adjusted": false,
      "invoiceNo": ""
    },
    {
      "id": "adv-004",
      "customer": "Ashok Leyland",
      "advance": 410000,
      "rate": 18,
      "date": "2026-06-12",
      "adjusted": true,
      "invoiceNo": "ACM/26-27/0188"
    }
  ],
  "zero-rated-invoices": [
    {
      "id": "zr-001",
      "invoiceNo": "EXP/26-27/001",
      "buyer": "Gulf Industrial Trading LLC, Dubai",
      "type": "export-goods",
      "method": "lut",
      "value": 1850000,
      "igst": 0,
      "firc": "FIRC-HDFC-552031",
      "fircReceived": true
    },
    {
      "id": "zr-002",
      "invoiceNo": "EXP/26-27/002",
      "buyer": "Apex Engineering Pte, Singapore",
      "type": "export-services",
      "method": "lut",
      "value": 640000,
      "igst": 0,
      "firc": "FIRC-ICICI-771204",
      "fircReceived": false
    },
    {
      "id": "zr-003",
      "invoiceNo": "SEZ/26-27/004",
      "buyer": "Wipro SEZ Unit, Bengaluru",
      "type": "sez",
      "method": "with-igst",
      "value": 920000,
      "igst": 165600,
      "firc": "",
      "fircReceived": false
    },
    {
      "id": "zr-004",
      "invoiceNo": "EXP/26-27/006",
      "buyer": "Bosch GmbH, Germany",
      "type": "export-goods",
      "method": "with-igst",
      "value": 2310000,
      "igst": 415800,
      "firc": "FIRC-SBI-330918",
      "fircReceived": true
    }
  ],
  "gst-filing-log": [
    {
      "id": "fil-001",
      "period": "2026-05",
      "type": "GSTR-3B",
      "onTime": true
    },
    {
      "id": "fil-002",
      "period": "2026-05",
      "type": "GSTR-1",
      "onTime": true
    },
    {
      "id": "fil-003",
      "period": "2026-04",
      "type": "GSTR-3B",
      "onTime": true
    },
    {
      "id": "fil-004",
      "period": "2026-04",
      "type": "GSTR-1",
      "onTime": false
    },
    {
      "id": "fil-005",
      "period": "2026-03",
      "type": "GSTR-3B",
      "onTime": true
    },
    {
      "id": "fil-006",
      "period": "2026-03",
      "type": "GSTR-1",
      "onTime": true
    }
  ],
  "gst-rule180-bills": [
    {
      "id": "r180-001",
      "supplier": "Tata Tooling Pvt Ltd",
      "invoiceNo": "TT-9920",
      "invoiceDate": "2025-11-15",
      "amount": 340000,
      "rate": 18,
      "paid": false
    },
    {
      "id": "r180-002",
      "supplier": "Rico Lubricants Gurgaon",
      "invoiceNo": "RL-4456",
      "invoiceDate": "2025-12-20",
      "amount": 233000,
      "rate": 18,
      "paid": false
    },
    {
      "id": "r180-003",
      "supplier": "Siemens Electricals",
      "invoiceNo": "SE-1185",
      "invoiceDate": "2026-03-08",
      "amount": 213000,
      "rate": 18,
      "paid": true
    },
    {
      "id": "r180-004",
      "supplier": "Jindal Steel Traders",
      "invoiceNo": "STL-4471",
      "invoiceDate": "2026-04-02",
      "amount": 525000,
      "rate": 18,
      "paid": true
    },
    {
      "id": "r180-005",
      "supplier": "Precision Plastics Chennai",
      "invoiceNo": "PP-3302",
      "invoiceDate": "2025-10-30",
      "amount": 153000,
      "rate": 18,
      "paid": false
    }
  ],
  "gst-einv30-invoices": [
    {
      "id": "einv-001",
      "invoiceNo": "ACM/26-27/0142",
      "invoiceDate": "2026-06-05",
      "value": 850000,
      "reported": true
    },
    {
      "id": "einv-002",
      "invoiceNo": "ACM/26-27/0188",
      "invoiceDate": "2026-06-12",
      "value": 1240000,
      "reported": true
    },
    {
      "id": "einv-003",
      "invoiceNo": "ACM/26-27/0205",
      "invoiceDate": "2026-05-28",
      "value": 560000,
      "reported": false
    },
    {
      "id": "einv-004",
      "invoiceNo": "ACM/26-27/0211",
      "invoiceDate": "2026-06-18",
      "value": 920000,
      "reported": false
    },
    {
      "id": "einv-005",
      "invoiceNo": "ACM/26-27/0150",
      "invoiceDate": "2026-06-09",
      "value": 305000,
      "reported": true
    }
  ],
  "gst-cdn-register": [
    {
      "id": "cdn-001",
      "noteNo": "CN/26-27/011",
      "kind": "credit",
      "party": "Mahindra & Mahindra",
      "origInvoice": "ACM/26-27/0098",
      "date": "2026-05-14",
      "taxable": 45000,
      "rate": 18
    },
    {
      "id": "cdn-002",
      "noteNo": "CN/26-27/012",
      "kind": "credit",
      "party": "Ashok Leyland",
      "origInvoice": "ACM/26-27/0107",
      "date": "2026-05-22",
      "taxable": 32000,
      "rate": 12
    },
    {
      "id": "cdn-003",
      "noteNo": "DN/26-27/004",
      "kind": "debit",
      "party": "L&T Construction",
      "origInvoice": "ACM/26-27/0083",
      "date": "2026-06-03",
      "taxable": 28000,
      "rate": 18
    },
    {
      "id": "cdn-004",
      "noteNo": "CN/26-27/013",
      "kind": "credit",
      "party": "Bharat Heavy Electricals Ltd",
      "origInvoice": "ACM/26-27/0142",
      "date": "2026-06-16",
      "taxable": 60000,
      "rate": 18
    }
  ],
  "gst-jobwork-itc04": [
    {
      "id": "jw-001",
      "challanNo": "JW/26-27/001",
      "jobWorker": "Sri Venkateshwara Heat Treaters",
      "goods": "Forged shafts for hardening",
      "sentDate": "2026-04-18",
      "value": 280000,
      "type": "inputs",
      "received": true
    },
    {
      "id": "jw-002",
      "challanNo": "JW/26-27/002",
      "jobWorker": "Anand Electroplaters",
      "goods": "Brackets for zinc plating",
      "sentDate": "2026-05-06",
      "value": 95000,
      "type": "inputs",
      "received": true
    },
    {
      "id": "jw-003",
      "challanNo": "JW/26-27/003",
      "jobWorker": "Precision CNC Job Works",
      "goods": "Castings for finish machining",
      "sentDate": "2026-05-29",
      "value": 410000,
      "type": "inputs",
      "received": false
    },
    {
      "id": "jw-004",
      "challanNo": "JW/26-27/004",
      "jobWorker": "Karnataka Tool Room",
      "goods": "Die for refurbishment",
      "sentDate": "2026-06-10",
      "value": 650000,
      "type": "capital",
      "received": false
    }
  ],
  "gst-isd-branches": [
    {
      "id": "isd-001",
      "name": "Bengaluru HO",
      "turnover": 28500000
    },
    {
      "id": "isd-002",
      "name": "Pune Branch",
      "turnover": 14200000
    },
    {
      "id": "isd-003",
      "name": "Chennai Branch",
      "turnover": 11100000
    },
    {
      "id": "isd-004",
      "name": "Delhi Sales Office",
      "turnover": 6400000
    }
  ],
  "gst-pmt09-transfers": [
    {
      "id": "pmt-001",
      "from": "CGST",
      "to": "IGST",
      "minor": "Tax",
      "amount": 45000
    },
    {
      "id": "pmt-002",
      "from": "SGST",
      "to": "CGST",
      "minor": "Interest",
      "amount": 3200
    },
    {
      "id": "pmt-003",
      "from": "Cess",
      "to": "IGST",
      "minor": "Tax",
      "amount": 12000
    },
    {
      "id": "pmt-004",
      "from": "IGST",
      "to": "CGST",
      "minor": "Fee",
      "amount": 1500
    }
  ],
  "gst-crosscharge-branches": [
    {
      "id": "cc-001",
      "name": "Pune Branch",
      "state": "Maharashtra",
      "turnoverShare": 38
    },
    {
      "id": "cc-002",
      "name": "Chennai Branch",
      "state": "Tamil Nadu",
      "turnoverShare": 30
    },
    {
      "id": "cc-003",
      "name": "Delhi Sales Office",
      "state": "Delhi",
      "turnoverShare": 18
    },
    {
      "id": "cc-004",
      "name": "Hyderabad Depot",
      "state": "Telangana",
      "turnoverShare": 14
    }
  ],
  "gst-crosscharge-cost": "2400000",
  "gst-freesample-items": [
    {
      "id": "fs-001",
      "desc": "Trial bearings to prospective OEM",
      "kind": "Free sample",
      "costPerUnit": 850,
      "qty": 120,
      "rate": 18
    },
    {
      "id": "fs-002",
      "desc": "Diwali gift hampers to dealers",
      "kind": "Gift / promo",
      "costPerUnit": 1500,
      "qty": 60,
      "rate": 18
    },
    {
      "id": "fs-003",
      "desc": "Buy-2-get-1 on service kits",
      "kind": "Buy-one-get-one",
      "costPerUnit": 600,
      "qty": 200,
      "rate": 12
    },
    {
      "id": "fs-004",
      "desc": "Demo valve units at trade fair",
      "kind": "Free sample",
      "costPerUnit": 2200,
      "qty": 40,
      "rate": 18
    }
  ],
  "gst-audit-checklist": {
    "recon1-3b": true,
    "recon3b-books": true,
    "itc-2b": true,
    "blocked": false,
    "reversal": true,
    "rule180": false,
    "rcm": true,
    "einvoice": true,
    "eway": false,
    "hsn": true
  },
  "tcs-entries": [
    {
      "id": "tcs-001",
      "buyer": "Mahindra & Mahindra",
      "goods": "Sale of goods >₹50L (Sec 206C(1H))",
      "saleAmount": 6200000,
      "tcsRate": 0.1,
      "date": "2026-04-15",
      "deposited": true
    },
    {
      "id": "tcs-002",
      "buyer": "Sundaram Metals",
      "goods": "Scrap (Sec 206C(1))",
      "saleAmount": 480000,
      "tcsRate": 1,
      "date": "2026-05-02",
      "deposited": true
    },
    {
      "id": "tcs-003",
      "buyer": "Bharat Heavy Electricals Ltd",
      "goods": "Sale of goods >₹50L (Sec 206C(1H))",
      "saleAmount": 5400000,
      "tcsRate": 0.1,
      "date": "2026-05-20",
      "deposited": false
    },
    {
      "id": "tcs-004",
      "buyer": "Kores Minerals",
      "goods": "Minerals (coal, lignite, iron ore)",
      "saleAmount": 920000,
      "tcsRate": 1,
      "date": "2026-06-08",
      "deposited": false
    },
    {
      "id": "tcs-005",
      "buyer": "Ashok Leyland",
      "goods": "Motor vehicles >₹10L",
      "saleAmount": 1350000,
      "tcsRate": 1,
      "date": "2026-06-14",
      "deposited": false
    }
  ],
  "tds-return-rows": [
    {
      "id": "tdr-001",
      "deductee": "Rao & Associates, Advocates",
      "pan": "AABFR1234K",
      "section": "194J-P",
      "amount": 240000,
      "date": "2026-04-10",
      "deposited": true
    },
    {
      "id": "tdr-002",
      "deductee": "Karnataka Roadlines",
      "pan": "AAGCK5678L",
      "section": "194C2",
      "amount": 380000,
      "date": "2026-04-25",
      "deposited": true
    },
    {
      "id": "tdr-003",
      "deductee": "Skylark Properties (Rent)",
      "pan": "AFZPS9012M",
      "section": "194I-L",
      "amount": 720000,
      "date": "2026-05-05",
      "deposited": true
    },
    {
      "id": "tdr-004",
      "deductee": "Suresh Marketing (Commission)",
      "pan": "BKLPS3456N",
      "section": "194H",
      "amount": 150000,
      "date": "2026-05-28",
      "deposited": false
    },
    {
      "id": "tdr-005",
      "deductee": "NetCore IT Solutions",
      "pan": "AADCN7890P",
      "section": "194J-T",
      "amount": 95000,
      "date": "2026-06-09",
      "deposited": false
    }
  ],
  "form26as-rows": [
    {
      "id": "f26-001",
      "party": "Bharat Heavy Electricals Ltd",
      "section": "194C2",
      "booksTds": 37000,
      "as26Tds": 37000
    },
    {
      "id": "f26-002",
      "party": "Karnataka State PWD",
      "section": "194C2",
      "booksTds": 18400,
      "as26Tds": 18400
    },
    {
      "id": "f26-003",
      "party": "Indian Railways (SWR)",
      "section": "194Q",
      "booksTds": 26800,
      "as26Tds": 0
    },
    {
      "id": "f26-004",
      "party": "Hindustan Aeronautics Ltd",
      "section": "194C2",
      "booksTds": 44200,
      "as26Tds": 40000
    },
    {
      "id": "f26-005",
      "party": "Mahindra & Mahindra",
      "section": "194Q",
      "booksTds": 6200,
      "as26Tds": 6200
    }
  ],
  "ldc-197-rows": [
    {
      "id": "ldc-001",
      "vendor": "NetCore IT Solutions",
      "certNo": "LDC/197/26-27/0091",
      "section": "194J-T",
      "certRate": 2,
      "validTill": "2027-03-31",
      "payment": 1200000
    },
    {
      "id": "ldc-002",
      "vendor": "Skylark Properties",
      "certNo": "LDC/197/26-27/0142",
      "section": "194I-L",
      "certRate": 5,
      "validTill": "2027-03-31",
      "payment": 2880000
    },
    {
      "id": "ldc-003",
      "vendor": "Karnataka Roadlines",
      "certNo": "LDC/197/26-27/0210",
      "section": "194C2",
      "certRate": 0.5,
      "validTill": "2027-03-31",
      "payment": 4560000
    },
    {
      "id": "ldc-004",
      "vendor": "Rao & Associates",
      "certNo": "LDC/197/26-27/0233",
      "section": "194J-P",
      "certRate": 5,
      "validTill": "2026-09-30",
      "payment": 960000
    }
  ],
  "depreciation-assets": [
    {
      "id": "dep-001",
      "name": "Factory building — Peenya",
      "block": "Buildings (general)",
      "openWdv": 12500000,
      "additions": 0,
      "halfYear": false
    },
    {
      "id": "dep-002",
      "name": "CNC machining centre",
      "block": "Plant & machinery (general)",
      "openWdv": 8400000,
      "additions": 2200000,
      "halfYear": false
    },
    {
      "id": "dep-003",
      "name": "Delivery trucks (fleet of 3)",
      "block": "Motor vehicles",
      "openWdv": 3600000,
      "additions": 1400000,
      "halfYear": true
    },
    {
      "id": "dep-004",
      "name": "ERP servers & workstations",
      "block": "Computers & software",
      "openWdv": 640000,
      "additions": 320000,
      "halfYear": true
    },
    {
      "id": "dep-005",
      "name": "Office furniture & fittings",
      "block": "Furniture & fittings",
      "openWdv": 480000,
      "additions": 0,
      "halfYear": false
    }
  ],
  "loss-setoff-rows": [
    {
      "id": "ls-001",
      "head": "business",
      "ay": "2023-24",
      "amount": 850000
    },
    {
      "id": "ls-002",
      "head": "stcl",
      "ay": "2024-25",
      "amount": 220000
    },
    {
      "id": "ls-003",
      "head": "ltcl",
      "ay": "2024-25",
      "amount": 310000
    },
    {
      "id": "ls-004",
      "head": "house",
      "ay": "2025-26",
      "amount": 180000
    },
    {
      "id": "ls-005",
      "head": "speculative",
      "ay": "2025-26",
      "amount": 95000
    }
  ],
  "eq-levy-rows": [
    {
      "id": "el-001",
      "party": "Google Ads (Google Asia Pacific)",
      "type": "el-ads",
      "amount": 420000,
      "date": "2026-04-30"
    },
    {
      "id": "el-002",
      "party": "Meta Platforms Ireland",
      "type": "el-ads",
      "amount": 180000,
      "date": "2026-05-31"
    },
    {
      "id": "el-003",
      "party": "Amazon Marketplace (e-com sales)",
      "type": "194o",
      "amount": 1350000,
      "date": "2026-05-15"
    },
    {
      "id": "el-004",
      "party": "Flipkart Internet Pvt Ltd",
      "type": "194o",
      "amount": 940000,
      "date": "2026-06-12"
    },
    {
      "id": "el-005",
      "party": "AWS Cloud (non-resident e-com)",
      "type": "el-ecom",
      "amount": 260000,
      "date": "2026-06-01"
    }
  ],
  "tax-notice-rows": [
    {
      "id": "ntc-001",
      "refNo": "CPC/143(1)/2025/884512",
      "ay": "2025-26",
      "type": "143(1) Intimation",
      "demand": 184000,
      "dueDate": "2026-07-15",
      "status": "open"
    },
    {
      "id": "ntc-002",
      "refNo": "ASMT/10/KAR/2025/3391",
      "ay": "2024-25",
      "type": "GST ASMT-10 Scrutiny",
      "demand": 92000,
      "dueDate": "2026-07-02",
      "status": "responded"
    },
    {
      "id": "ntc-003",
      "refNo": "CPC/143(1)/2024/771209",
      "ay": "2024-25",
      "type": "143(1) Intimation",
      "demand": 0,
      "dueDate": "2025-08-20",
      "status": "closed"
    },
    {
      "id": "ntc-004",
      "refNo": "DRC/01/KAR/2026/0118",
      "ay": "2025-26",
      "type": "GST DRC-01 SCN",
      "demand": 215000,
      "dueDate": "2026-07-28",
      "status": "open"
    }
  ],
  "tax-80g-donations": [
    {
      "id": "don-001",
      "donee": "PM CARES Fund",
      "amount": 200000,
      "category": "100nl",
      "mode": "digital"
    },
    {
      "id": "don-002",
      "donee": "Akshaya Patra Foundation",
      "amount": 150000,
      "category": "50ql",
      "mode": "digital"
    },
    {
      "id": "don-003",
      "donee": "National Defence Fund",
      "amount": 100000,
      "category": "100nl",
      "mode": "digital"
    },
    {
      "id": "don-004",
      "donee": "CM Relief Fund Karnataka",
      "amount": 75000,
      "category": "100ql",
      "mode": "digital"
    },
    {
      "id": "don-005",
      "donee": "Local charitable trust (Seva Bharati)",
      "amount": 50000,
      "category": "50ql",
      "mode": "cash"
    }
  ],
  "tax-80g-agti": "8500000",
  "tax-43bh-entries": [
    {
      "id": "bh-001",
      "vendor": "Precision Plastics Chennai (Micro)",
      "amount": 153000,
      "hasAgreement": true,
      "daysOutstanding": 62
    },
    {
      "id": "bh-002",
      "vendor": "Anand Electroplaters (Small)",
      "amount": 95000,
      "hasAgreement": true,
      "daysOutstanding": 28
    },
    {
      "id": "bh-003",
      "vendor": "Sri Venkateshwara Heat Treaters (Micro)",
      "amount": 280000,
      "hasAgreement": false,
      "daysOutstanding": 51
    },
    {
      "id": "bh-004",
      "vendor": "Karnataka Tool Room (Small)",
      "amount": 120000,
      "hasAgreement": true,
      "daysOutstanding": 18
    },
    {
      "id": "bh-005",
      "vendor": "Bharath Coatings (Micro)",
      "amount": 64000,
      "hasAgreement": false,
      "daysOutstanding": 73
    }
  ],
  "receivables-cash-applied": {
    "inv-acme-0098": "txn-rcpt-5521",
    "inv-acme-0107": "txn-rcpt-5588",
    "inv-acme-0112": "txn-rcpt-5640"
  },
  "receivables-ar-contacts": {
    "Mahindra & Mahindra": {
      "email": "accounts.payable@mahindra.com",
      "phone": "+91 22 2490 1441"
    },
    "L&T Construction": {
      "email": "ap.vendors@lntecc.com",
      "phone": "+91 44 2252 8000"
    },
    "Ashok Leyland": {
      "email": "vendor.payments@ashokleyland.com",
      "phone": "+91 44 2220 6000"
    },
    "Bharat Heavy Electricals Ltd": {
      "email": "finance.bhel@bhel.in",
      "phone": "+91 11 6633 7777"
    },
    "Bosch India": {
      "email": "supplier.ap@in.bosch.com",
      "phone": "+91 80 6752 1212"
    }
  },
  "receivables-ar-confirm-sent": {
    "Mahindra & Mahindra": "2026-06-15",
    "L&T Construction": "2026-06-12",
    "Ashok Leyland": "2026-06-10",
    "Bharat Heavy Electricals Ltd": "2026-06-18"
  },
  "rec-ecl-rates": {
    "current": "0.5",
    "30d": "3",
    "60d": "12",
    "90d": "40"
  },
  "rec-credit-limits": {
    "Mahindra & Mahindra": 5000000,
    "L&T Construction": 3000000,
    "Ashok Leyland": 2500000,
    "Bharat Heavy Electricals Ltd": 6000000,
    "Bosch India": 2000000
  },
  "rec-promise-to-pay": {
    "inv-acme-0142": {
      "invoiceId": "inv-acme-0142",
      "date": "2026-06-28",
      "amount": "850000",
      "note": "AP confirmed payment after GRN clearance",
      "loggedAt": "2026-06-14"
    },
    "inv-acme-0151": {
      "invoiceId": "inv-acme-0151",
      "date": "2026-07-05",
      "amount": "320000",
      "note": "Cheque to be couriered next week",
      "loggedAt": "2026-06-16"
    },
    "inv-acme-0133": {
      "invoiceId": "inv-acme-0133",
      "date": "2026-06-12",
      "amount": "275000",
      "note": "Promised but date lapsed — chase",
      "loggedAt": "2026-06-02"
    }
  },
  "rec-disputes": {
    "inv-acme-0107": {
      "invoiceId": "inv-acme-0107",
      "amount": "45000",
      "reason": "Quality / damage",
      "status": "open",
      "loggedAt": "2026-05-28"
    },
    "inv-acme-0118": {
      "invoiceId": "inv-acme-0118",
      "amount": "28000",
      "reason": "Short delivery",
      "status": "open",
      "loggedAt": "2026-06-04"
    },
    "inv-acme-0089": {
      "invoiceId": "inv-acme-0089",
      "amount": "15000",
      "reason": "Freight",
      "status": "resolved",
      "loggedAt": "2026-05-10"
    }
  },
  "rec-credit-hold-cleared": {
    "inv-acme-0133": true,
    "inv-acme-0151": true
  },
  "rec-writeoff-policy-days": "180",
  "rec-writeoff-approved": {
    "inv-acme-0061": true,
    "inv-acme-0074": true
  },
  "rec-interest-rate-pa": "18",
  "rec-interest-grace": "7",
  "rec-partial-payments": {
    "inv-acme-0142": [
      {
        "id": "pp-001",
        "amount": 400000,
        "date": "2026-06-05"
      },
      {
        "id": "pp-002",
        "amount": 200000,
        "date": "2026-06-18"
      }
    ],
    "inv-acme-0107": [
      {
        "id": "pp-003",
        "amount": 150000,
        "date": "2026-06-10"
      }
    ],
    "inv-acme-0118": [
      {
        "id": "pp-004",
        "amount": 100000,
        "date": "2026-06-14"
      },
      {
        "id": "pp-005",
        "amount": 80000,
        "date": "2026-06-20"
      }
    ]
  },
  "rec-roi-recovery-pct": "60",
  "rec-roi-agency-pct": "20",
  "rec-roi-legal-cost": "15000",
  "rec-stress-topn": "3",
  "rec-stress-delay": "60",
  "rec-stress-loss": "100",
  "rec-collection-target": "4500000",
  "alert-threshold-rules": [
    {
      "id": "atr-1001",
      "metric": "balance",
      "op": "below",
      "value": 2500000,
      "createdAt": "2026-02-12T09:14:00.000Z"
    },
    {
      "id": "atr-1002",
      "metric": "runway",
      "op": "below",
      "value": 60,
      "createdAt": "2026-03-04T11:30:00.000Z"
    },
    {
      "id": "atr-1003",
      "metric": "burn",
      "op": "above",
      "value": 1800000,
      "createdAt": "2026-04-18T08:05:00.000Z"
    },
    {
      "id": "atr-1004",
      "metric": "revenue30",
      "op": "below",
      "value": 4000000,
      "createdAt": "2026-05-01T15:42:00.000Z"
    },
    {
      "id": "atr-1005",
      "metric": "expense30",
      "op": "above",
      "value": 3200000,
      "createdAt": "2026-05-22T10:10:00.000Z"
    }
  ],
  "compliance-due-items": [
    {
      "id": "cdi-2001",
      "name": "GSTR-3B filing",
      "dueDate": "2026-07-20",
      "recurrence": "monthly"
    },
    {
      "id": "cdi-2002",
      "name": "GSTR-1 filing",
      "dueDate": "2026-07-11",
      "recurrence": "monthly"
    },
    {
      "id": "cdi-2003",
      "name": "TDS payment",
      "dueDate": "2026-07-07",
      "recurrence": "monthly"
    },
    {
      "id": "cdi-2004",
      "name": "PF & ESI deposit",
      "dueDate": "2026-06-25",
      "recurrence": "monthly"
    },
    {
      "id": "cdi-2005",
      "name": "Advance tax instalment",
      "dueDate": "2026-09-15",
      "recurrence": "quarterly"
    },
    {
      "id": "cdi-2006",
      "name": "ROC AOC-4 / MGT-7",
      "dueDate": "2026-10-30",
      "recurrence": "annual"
    },
    {
      "id": "cdi-2007",
      "name": "Income-tax return",
      "dueDate": "2026-10-31",
      "recurrence": "annual"
    }
  ],
  "liquidity-min-floor": "2000000",
  "alr-mute-rules": [
    {
      "id": "mr-3001",
      "type": "runway",
      "until": "2026-06-25T18:30:00.000Z",
      "createdAt": "2026-06-19T09:00:00.000Z"
    },
    {
      "id": "mr-3002",
      "type": "large-transaction",
      "until": "2026-06-23T12:00:00.000Z",
      "createdAt": "2026-06-20T11:15:00.000Z"
    },
    {
      "id": "mr-3003",
      "type": "low-stock",
      "until": "2026-06-28T06:00:00.000Z",
      "createdAt": "2026-06-18T14:45:00.000Z"
    }
  ],
  "alr-digest-enabled": true,
  "alr-digest-freq": "daily",
  "alr-digest-hour": "9",
  "alr-digest-channel": "both",
  "alr-escalation-rules": [
    {
      "id": "esc-4001",
      "severity": "critical",
      "recipient": "Rohan Mehta (Founder) · +91 98450 11223",
      "channel": "whatsapp",
      "createdAt": "2026-01-15T07:30:00.000Z"
    },
    {
      "id": "esc-4002",
      "severity": "critical",
      "recipient": "rohan@acmemfg.in",
      "channel": "call",
      "createdAt": "2026-01-15T07:32:00.000Z"
    },
    {
      "id": "esc-4003",
      "severity": "high",
      "recipient": "Priya Nair (Finance Head) · priya@acmemfg.in",
      "channel": "email",
      "createdAt": "2026-02-02T10:00:00.000Z"
    },
    {
      "id": "esc-4004",
      "severity": "high",
      "recipient": "+91 99020 44556",
      "channel": "whatsapp",
      "createdAt": "2026-02-02T10:05:00.000Z"
    },
    {
      "id": "esc-4005",
      "severity": "medium",
      "recipient": "accounts@acmemfg.in",
      "channel": "email",
      "createdAt": "2026-03-10T09:20:00.000Z"
    },
    {
      "id": "esc-4006",
      "severity": "low",
      "recipient": "Sandeep Rao (Accountant) · sandeep@acmemfg.in",
      "channel": "email",
      "createdAt": "2026-03-10T09:25:00.000Z"
    }
  ],
  "alr-recv-threshold": "1500000",
  "alr-payable-window": "14",
  "alr-kpi-targets": [
    {
      "id": "kpi-5001",
      "kpi": "revenue30",
      "goal": "atLeast",
      "value": 5000000,
      "createdAt": "2026-04-01T08:00:00.000Z"
    },
    {
      "id": "kpi-5002",
      "kpi": "margin",
      "goal": "atLeast",
      "value": 38,
      "createdAt": "2026-04-01T08:02:00.000Z"
    },
    {
      "id": "kpi-5003",
      "kpi": "expenseRatio",
      "goal": "atMost",
      "value": 65,
      "createdAt": "2026-04-05T11:00:00.000Z"
    },
    {
      "id": "kpi-5004",
      "kpi": "newRevenueShare",
      "goal": "atLeast",
      "value": 30,
      "createdAt": "2026-04-12T16:30:00.000Z"
    }
  ],
  "alr-stock-buffer": "1.5",
  "alr-largetxn-amount": "250000",
  "alr-largetxn-dir": "out",
  "alr-budget-warn": "80",
  "alr-concentration-pct": "30",
  "alr-licence-items": [
    {
      "id": "lic-6001",
      "name": "GST Registration (29ABCDE1234F1Z5)",
      "expiryDate": "2027-03-31",
      "createdAt": "2026-01-10T09:00:00.000Z"
    },
    {
      "id": "lic-6002",
      "name": "Factory Licence — KSPCB",
      "expiryDate": "2026-08-31",
      "createdAt": "2026-01-10T09:05:00.000Z"
    },
    {
      "id": "lic-6003",
      "name": "Fire NOC — Karnataka Fire Dept",
      "expiryDate": "2026-07-15",
      "createdAt": "2026-01-10T09:10:00.000Z"
    },
    {
      "id": "lic-6004",
      "name": "Trade Licence — BBMP",
      "expiryDate": "2026-12-31",
      "createdAt": "2026-01-10T09:12:00.000Z"
    },
    {
      "id": "lic-6005",
      "name": "Pollution Consent to Operate (KSPCB)",
      "expiryDate": "2026-09-30",
      "createdAt": "2026-01-10T09:15:00.000Z"
    },
    {
      "id": "lic-6006",
      "name": "Import-Export Code (IEC)",
      "expiryDate": "2027-06-30",
      "createdAt": "2026-01-10T09:18:00.000Z"
    }
  ],
  "alr-emicover-window": "30",
  "alr-recurring-ceiling": "75000",
  "alr-taxsetaside-rate": "25",
  "ins-policies": [
    {
      "id": "pol-7001",
      "insurer": "ICICI Lombard",
      "type": "Fire & Allied Perils",
      "policyNo": "FAP/2025/0098231",
      "sumInsured": 45000000,
      "premium": 142000,
      "startDate": "2025-08-01",
      "renewalDate": "2026-07-31"
    },
    {
      "id": "pol-7002",
      "insurer": "HDFC ERGO",
      "type": "Group Health (Mediclaim)",
      "policyNo": "GMC/2025/445672",
      "sumInsured": 12000000,
      "premium": 386000,
      "startDate": "2025-10-01",
      "renewalDate": "2026-09-30"
    },
    {
      "id": "pol-7003",
      "insurer": "Bajaj Allianz",
      "type": "Marine / Transit",
      "policyNo": "MAR/2025/771209",
      "sumInsured": 8000000,
      "premium": 54000,
      "startDate": "2026-01-01",
      "renewalDate": "2026-12-31"
    },
    {
      "id": "pol-7004",
      "insurer": "Tata AIG",
      "type": "Public Liability",
      "policyNo": "PL/2025/330145",
      "sumInsured": 10000000,
      "premium": 38000,
      "startDate": "2025-11-15",
      "renewalDate": "2026-07-05"
    },
    {
      "id": "pol-7005",
      "insurer": "New India Assurance",
      "type": "Burglary / Theft",
      "policyNo": "BUR/2025/660781",
      "sumInsured": 6000000,
      "premium": 27000,
      "startDate": "2025-09-01",
      "renewalDate": "2026-08-31"
    },
    {
      "id": "pol-7006",
      "insurer": "ICICI Lombard",
      "type": "Motor (Commercial)",
      "policyNo": "MOT/2026/112098",
      "sumInsured": 3200000,
      "premium": 96000,
      "startDate": "2026-03-01",
      "renewalDate": "2027-02-28"
    },
    {
      "id": "pol-7007",
      "insurer": "SBI General",
      "type": "Cyber",
      "policyNo": "CYB/2026/008834",
      "sumInsured": 5000000,
      "premium": 72000,
      "startDate": "2026-02-01",
      "renewalDate": "2026-06-28"
    }
  ],
  "ins-asset-schedule": [
    {
      "id": "as-8001",
      "name": "Factory shed & building",
      "value": 22000000,
      "perilRate": 0.12
    },
    {
      "id": "as-8002",
      "name": "CNC machines (4 units)",
      "value": 14500000,
      "perilRate": 0.25
    },
    {
      "id": "as-8003",
      "name": "Raw material & finished stock",
      "value": 9000000,
      "perilRate": 0.45
    },
    {
      "id": "as-8004",
      "name": "Office furniture & IT equipment",
      "value": 2800000,
      "perilRate": 0.18
    },
    {
      "id": "as-8005",
      "name": "DG set & electrical installations",
      "value": 3500000,
      "perilRate": 0.3
    }
  ],
  "ins-claims": [
    {
      "id": "clm-9001",
      "insurer": "ICICI Lombard",
      "type": "Fire",
      "claimAmount": 850000,
      "settledAmount": 760000,
      "status": "settled",
      "date": "2025-12-14"
    },
    {
      "id": "clm-9002",
      "insurer": "HDFC ERGO",
      "type": "Hospitalisation",
      "claimAmount": 245000,
      "settledAmount": 245000,
      "status": "settled",
      "date": "2026-02-08"
    },
    {
      "id": "clm-9003",
      "insurer": "Bajaj Allianz",
      "type": "Transit damage",
      "claimAmount": 180000,
      "settledAmount": 0,
      "status": "surveyor",
      "date": "2026-05-19"
    },
    {
      "id": "clm-9004",
      "insurer": "New India Assurance",
      "type": "Theft",
      "claimAmount": 320000,
      "settledAmount": 0,
      "status": "documents",
      "date": "2026-06-02"
    },
    {
      "id": "clm-9005",
      "insurer": "Tata AIG",
      "type": "Third-party liability",
      "claimAmount": 500000,
      "settledAmount": 0,
      "status": "intimated",
      "date": "2026-06-15"
    },
    {
      "id": "clm-9006",
      "insurer": "HDFC ERGO",
      "type": "Hospitalisation",
      "claimAmount": 95000,
      "settledAmount": 0,
      "status": "rejected",
      "date": "2026-04-22"
    }
  ],
  "ins-quotes": [
    {
      "id": "qt-10001",
      "insurer": "ICICI Lombard",
      "sumInsured": 45000000,
      "premium": 142000,
      "deductible": 100000
    },
    {
      "id": "qt-10002",
      "insurer": "HDFC ERGO",
      "sumInsured": 45000000,
      "premium": 138500,
      "deductible": 150000
    },
    {
      "id": "qt-10003",
      "insurer": "Bajaj Allianz",
      "sumInsured": 45000000,
      "premium": 151000,
      "deductible": 75000
    },
    {
      "id": "qt-10004",
      "insurer": "Tata AIG",
      "sumInsured": 45000000,
      "premium": 134000,
      "deductible": 200000
    },
    {
      "id": "qt-10005",
      "insurer": "New India Assurance",
      "sumInsured": 45000000,
      "premium": 129000,
      "deductible": 250000
    }
  ],
  "ins-csr": [
    {
      "id": "csr-11001",
      "insurer": "ICICI Lombard",
      "claimsReceived": 142,
      "claimsPaid": 131,
      "avgDays": 18
    },
    {
      "id": "csr-11002",
      "insurer": "HDFC ERGO",
      "claimsReceived": 98,
      "claimsPaid": 94,
      "avgDays": 12
    },
    {
      "id": "csr-11003",
      "insurer": "Bajaj Allianz",
      "claimsReceived": 76,
      "claimsPaid": 68,
      "avgDays": 22
    },
    {
      "id": "csr-11004",
      "insurer": "Tata AIG",
      "claimsReceived": 110,
      "claimsPaid": 103,
      "avgDays": 15
    },
    {
      "id": "csr-11005",
      "insurer": "New India Assurance",
      "claimsReceived": 205,
      "claimsPaid": 178,
      "avgDays": 31
    }
  ],
  "ins-ncb": [
    {
      "id": "ncb-12001",
      "policy": "Commercial Motor — Tempo KA01AB1234",
      "basePremium": 96000,
      "claimFreeYears": 3
    },
    {
      "id": "ncb-12002",
      "policy": "Commercial Motor — Truck KA02CD5678",
      "basePremium": 128000,
      "claimFreeYears": 5
    },
    {
      "id": "ncb-12003",
      "policy": "Director's Car — KA03EF9012",
      "basePremium": 42000,
      "claimFreeYears": 2
    },
    {
      "id": "ncb-12004",
      "policy": "Forklift Cover — Plant",
      "basePremium": 31000,
      "claimFreeYears": 4
    }
  ],
  "ins-fleet": [
    {
      "id": "veh-13001",
      "regNo": "KA01AB1234",
      "type": "Goods Tempo",
      "idv": 850000,
      "premium": 96000,
      "expiry": "2027-02-28"
    },
    {
      "id": "veh-13002",
      "regNo": "KA02CD5678",
      "type": "Heavy Truck",
      "idv": 2400000,
      "premium": 128000,
      "expiry": "2026-11-30"
    },
    {
      "id": "veh-13003",
      "regNo": "KA03EF9012",
      "type": "Director Sedan",
      "idv": 1100000,
      "premium": 42000,
      "expiry": "2026-08-20"
    },
    {
      "id": "veh-13004",
      "regNo": "KA04GH3456",
      "type": "Delivery Van",
      "idv": 920000,
      "premium": 58000,
      "expiry": "2026-07-12"
    },
    {
      "id": "veh-13005",
      "regNo": "KA05IJ7890",
      "type": "Forklift",
      "idv": 650000,
      "premium": 31000,
      "expiry": "2027-01-15"
    }
  ],
  "ins-opd-claims": [
    {
      "id": "opd-14001",
      "head": "Rohan Mehta",
      "amount": 4200,
      "date": "2026-04-10"
    },
    {
      "id": "opd-14002",
      "head": "Priya Nair",
      "amount": 6800,
      "date": "2026-03-22"
    },
    {
      "id": "opd-14003",
      "head": "Sandeep Rao",
      "amount": 3100,
      "date": "2026-05-05"
    },
    {
      "id": "opd-14004",
      "head": "Anjali Gupta",
      "amount": 9500,
      "date": "2026-02-18"
    },
    {
      "id": "opd-14005",
      "head": "Vikram Shetty",
      "amount": 2400,
      "date": "2026-06-01"
    }
  ],
  "ins-opd-limit": 25000,
  "ins-riders": [
    {
      "id": "rdr-15001",
      "name": "Maternity benefit",
      "premium": 18000,
      "benefit": 75000,
      "useful": true
    },
    {
      "id": "rdr-15002",
      "name": "Critical illness top-up",
      "premium": 12000,
      "benefit": 2000000,
      "useful": true
    },
    {
      "id": "rdr-15003",
      "name": "OPD & wellness",
      "premium": 9000,
      "benefit": 25000,
      "useful": true
    },
    {
      "id": "rdr-15004",
      "name": "Room-rent waiver",
      "premium": 6500,
      "benefit": 50000,
      "useful": false
    },
    {
      "id": "rdr-15005",
      "name": "Personal accident add-on",
      "premium": 4200,
      "benefit": 1000000,
      "useful": true
    }
  ],
  "ins-claim-readiness": {
    "policydocs": true,
    "intimation": true,
    "fir": false,
    "photos": true,
    "estimate": true,
    "invoices": false,
    "kyc": true,
    "bankdetails": true
  },
  "esg-utility-log": [
    {
      "id": "ut-16001",
      "month": "2026-01",
      "kwh": 48200,
      "waterKl": 320,
      "cost": 412000
    },
    {
      "id": "ut-16002",
      "month": "2026-02",
      "kwh": 45100,
      "waterKl": 298,
      "cost": 386000
    },
    {
      "id": "ut-16003",
      "month": "2026-03",
      "kwh": 51800,
      "waterKl": 341,
      "cost": 441000
    },
    {
      "id": "ut-16004",
      "month": "2026-04",
      "kwh": 53600,
      "waterKl": 360,
      "cost": 458000
    },
    {
      "id": "ut-16005",
      "month": "2026-05",
      "kwh": 56200,
      "waterKl": 378,
      "cost": 481000
    },
    {
      "id": "ut-16006",
      "month": "2026-06",
      "kwh": 49900,
      "waterKl": 333,
      "cost": 426000
    }
  ],
  "esg-scorecard": {
    "e1": true,
    "e2": true,
    "e3": true,
    "e4": false,
    "s1": true,
    "s2": true,
    "s3": true,
    "s4": false,
    "g1": true,
    "g2": true,
    "g3": false,
    "g4": true
  },
  "esg-brsr-lite": {
    "b1": true,
    "b2": true,
    "b3": true,
    "b4": true,
    "b5": true,
    "b6": false,
    "b7": true,
    "b8": true,
    "b9": false,
    "b10": true,
    "b11": true,
    "b12": false
  },
  "esg-green-spend": [
    {
      "id": "gs-17001",
      "name": "Rooftop solar (120 kWp)",
      "amount": 5400000,
      "type": "Renewable energy"
    },
    {
      "id": "gs-17002",
      "name": "LED retrofit across plant",
      "amount": 480000,
      "type": "Energy efficiency"
    },
    {
      "id": "gs-17003",
      "name": "Effluent recycling unit",
      "amount": 1250000,
      "type": "Waste / recycling"
    },
    {
      "id": "gs-17004",
      "name": "Recycled-content packaging",
      "amount": 320000,
      "type": "Sustainable materials"
    },
    {
      "id": "gs-17005",
      "name": "Electric delivery van",
      "amount": 1800000,
      "type": "EV / clean transport"
    },
    {
      "id": "gs-17006",
      "name": "I-REC purchase FY26",
      "amount": 210000,
      "type": "Offsets / RECs"
    }
  ],
  "esg-suppliers": [
    {
      "id": "sup-18001",
      "name": "Bharat Steel Traders",
      "emissions": 2,
      "labour": 4,
      "governance": 3,
      "certified": false
    },
    {
      "id": "sup-18002",
      "name": "GreenPack Industries",
      "emissions": 5,
      "labour": 4,
      "governance": 5,
      "certified": true
    },
    {
      "id": "sup-18003",
      "name": "Karnataka Logistics Co.",
      "emissions": 3,
      "labour": 3,
      "governance": 4,
      "certified": false
    },
    {
      "id": "sup-18004",
      "name": "Sunrise Components Pvt Ltd",
      "emissions": 4,
      "labour": 5,
      "governance": 4,
      "certified": true
    },
    {
      "id": "sup-18005",
      "name": "Deccan Chemicals",
      "emissions": 2,
      "labour": 2,
      "governance": 3,
      "certified": false
    }
  ],
  "esg-goals": [
    {
      "id": "goal-19001",
      "name": "Cut Scope 1+2 emissions",
      "metric": "tCO2e/yr",
      "baseline": 520,
      "current": 438,
      "target": 312,
      "targetYear": "2030"
    },
    {
      "id": "goal-19002",
      "name": "Renewable electricity share",
      "metric": "% renewable",
      "baseline": 8,
      "current": 34,
      "target": 60,
      "targetYear": "2028"
    },
    {
      "id": "goal-19003",
      "name": "Reduce water intensity",
      "metric": "kL/₹cr",
      "baseline": 95,
      "current": 78,
      "target": 55,
      "targetYear": "2029"
    },
    {
      "id": "goal-19004",
      "name": "Waste diversion from landfill",
      "metric": "% recycled",
      "baseline": 42,
      "current": 61,
      "target": 85,
      "targetYear": "2027"
    },
    {
      "id": "goal-19005",
      "name": "Women in workforce",
      "metric": "% women",
      "baseline": 18,
      "current": 24,
      "target": 35,
      "targetYear": "2030"
    }
  ],
  "esg-commute": [
    {
      "id": "com-20001",
      "mode": "car",
      "employees": 12,
      "km": 22
    },
    {
      "id": "com-20002",
      "mode": "bike",
      "employees": 28,
      "km": 14
    },
    {
      "id": "com-20003",
      "mode": "bus",
      "employees": 35,
      "km": 18
    },
    {
      "id": "com-20004",
      "mode": "metro",
      "employees": 9,
      "km": 26
    },
    {
      "id": "com-20005",
      "mode": "auto",
      "employees": 6,
      "km": 8
    },
    {
      "id": "com-20006",
      "mode": "active",
      "employees": 10,
      "km": 3
    }
  ],
  "esg-waste": [
    {
      "id": "wst-21001",
      "stream": "Paper / cardboard",
      "generatedKg": 4200,
      "recycledKg": 3900
    },
    {
      "id": "wst-21002",
      "stream": "Plastic",
      "generatedKg": 2600,
      "recycledKg": 1700
    },
    {
      "id": "wst-21003",
      "stream": "E-waste",
      "generatedKg": 480,
      "recycledKg": 420
    },
    {
      "id": "wst-21004",
      "stream": "Metal",
      "generatedKg": 8800,
      "recycledKg": 8600
    },
    {
      "id": "wst-21005",
      "stream": "Hazardous",
      "generatedKg": 640,
      "recycledKg": 200
    },
    {
      "id": "wst-21006",
      "stream": "General / landfill",
      "generatedKg": 3100,
      "recycledKg": 0
    }
  ],
  "esg-diversity": {
    "totalEmp": "118",
    "women": "28",
    "mgmtTotal": "14",
    "mgmtWomen": "4",
    "pwd": "3",
    "contractual": "22",
    "trainingHrs": "1640",
    "safetyIncidents": "2"
  },
  "esg-governance": {
    "gv1": true,
    "gv2": true,
    "gv3": false,
    "gv4": true,
    "gv5": true,
    "gv6": false,
    "gv7": true,
    "gv8": true,
    "gv9": false,
    "gv10": true,
    "gv11": false,
    "gv12": true
  },
  "esg-cbam": [
    {
      "id": "cbm-22001",
      "good": "steel",
      "tonnes": 320
    },
    {
      "id": "cbm-22002",
      "good": "aluminium",
      "tonnes": 85
    },
    {
      "id": "cbm-22003",
      "good": "cement",
      "tonnes": 140
    },
    {
      "id": "cbm-22004",
      "good": "fertiliser",
      "tonnes": 60
    }
  ],
  "esg-epr": [
    {
      "id": "epr-23001",
      "category": "Plastic packaging",
      "obligationKg": 12000,
      "fulfilledKg": 9800
    },
    {
      "id": "epr-23002",
      "category": "E-waste",
      "obligationKg": 2400,
      "fulfilledKg": 2400
    },
    {
      "id": "epr-23003",
      "category": "Battery waste",
      "obligationKg": 800,
      "fulfilledKg": 520
    },
    {
      "id": "epr-23004",
      "category": "Used oil",
      "obligationKg": 1500,
      "fulfilledKg": 1500
    }
  ],
  "esg-greenloan": {
    "c1": true,
    "c2": true,
    "c3": true,
    "c4": true,
    "c5": true,
    "c6": false,
    "c7": true,
    "c8": false
  },
  "esg-supplier-survey": [
    {
      "id": "srv-24001",
      "supplier": "Bharat Steel Traders",
      "sentOn": "2026-03-10",
      "status": "responded"
    },
    {
      "id": "srv-24002",
      "supplier": "GreenPack Industries",
      "sentOn": "2026-03-10",
      "status": "verified"
    },
    {
      "id": "srv-24003",
      "supplier": "Karnataka Logistics Co.",
      "sentOn": "2026-04-02",
      "status": "sent"
    },
    {
      "id": "srv-24004",
      "supplier": "Sunrise Components Pvt Ltd",
      "sentOn": "2026-04-15",
      "status": "verified"
    },
    {
      "id": "srv-24005",
      "supplier": "Deccan Chemicals",
      "sentOn": "2026-05-01",
      "status": "not_sent"
    },
    {
      "id": "srv-24006",
      "supplier": "Sri Lakshmi Castings",
      "sentOn": "2026-05-20",
      "status": "responded"
    }
  ],
  "esg-report-sections": {
    "about": true,
    "footprint": true,
    "energy": true,
    "waste": true,
    "social": true,
    "governance": true,
    "targets": true,
    "green": false
  },
  "esg-climate-risk": {
    "flood": 2,
    "heat": 3,
    "cyclone": 1,
    "water": 2,
    "carbonprice": 3,
    "policy": 2,
    "market": 2,
    "tech": 1
  },
  "esg-procurement": [
    {
      "id": "prc-25001",
      "category": "Raw materials (steel/alloys)",
      "spend": 18500000,
      "sustainable": 6200000
    },
    {
      "id": "prc-25002",
      "category": "Packaging",
      "spend": 2400000,
      "sustainable": 1800000
    },
    {
      "id": "prc-25003",
      "category": "Logistics & freight",
      "spend": 5600000,
      "sustainable": 1100000
    },
    {
      "id": "prc-25004",
      "category": "Office & IT",
      "spend": 1300000,
      "sustainable": 900000
    },
    {
      "id": "prc-25005",
      "category": "Energy & utilities",
      "spend": 4900000,
      "sustainable": 2700000
    }
  ],
  "esg-csr": [
    {
      "id": "csrp-26001",
      "project": "Govt school digital lab",
      "theme": "Education",
      "spend": 850000,
      "beneficiaries": 420
    },
    {
      "id": "csrp-26002",
      "project": "Community RO water plant",
      "theme": "Water & sanitation",
      "spend": 1200000,
      "beneficiaries": 1800
    },
    {
      "id": "csrp-26003",
      "project": "Skill training for women",
      "theme": "Livelihood",
      "spend": 640000,
      "beneficiaries": 95
    },
    {
      "id": "csrp-26004",
      "project": "Urban tree plantation drive",
      "theme": "Environment",
      "spend": 310000,
      "beneficiaries": 5000
    },
    {
      "id": "csrp-26005",
      "project": "Free health camp",
      "theme": "Healthcare",
      "spend": 480000,
      "beneficiaries": 760
    }
  ],
  "esg-energy-savings": [
    {
      "id": "sav-27001",
      "measure": "Rooftop solar 120 kWp",
      "capex": 5400000,
      "annualSaving": 1380000,
      "co2Saving": 118
    },
    {
      "id": "sav-27002",
      "measure": "LED lighting retrofit",
      "capex": 480000,
      "annualSaving": 264000,
      "co2Saving": 22
    },
    {
      "id": "sav-27003",
      "measure": "VFD on compressors",
      "capex": 320000,
      "annualSaving": 198000,
      "co2Saving": 17
    },
    {
      "id": "sav-27004",
      "measure": "Waste-heat recovery",
      "capex": 1100000,
      "annualSaving": 410000,
      "co2Saving": 34
    },
    {
      "id": "sav-27005",
      "measure": "Power-factor correction",
      "capex": 180000,
      "annualSaving": 96000,
      "co2Saving": 8
    }
  ],
  "esg-certifications": {
    "c1": "held",
    "c2": "progress",
    "c3": "none",
    "c4": "progress",
    "c5": "held",
    "c6": "held",
    "c7": "none",
    "c8": "progress"
  },
  "esg-rating-plan": {
    "r1": true,
    "r2": true,
    "r3": false,
    "r4": true,
    "r5": true,
    "r6": true,
    "r7": false,
    "r8": true,
    "r9": false,
    "r10": false
  },
  "voice-language": "Hindi",
  "voice-a11y-large-text": true,
  "voice-a11y-high-contrast": false,
  "voice-number-indian": true,
  "voice-audio-statement": [
    {
      "id": "asl-1",
      "text": "This statement covers 142 transactions for Acme Manufacturing Pvt Ltd."
    },
    {
      "id": "asl-2",
      "text": "Total revenue recorded is 1.85 crore rupees."
    },
    {
      "id": "asl-3",
      "text": "Total expenses recorded is 1.12 crore rupees."
    },
    {
      "id": "asl-4",
      "text": "The closing net position is 73.4 lakh rupees."
    },
    {
      "id": "asl-5",
      "text": "Outstanding receivables stand at 18.6 lakh rupees across nine customers."
    }
  ],
  "voice-auth-hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "voice-scratchpad": "Call Ramesh Traders about pending PO-2294 dispatch on Monday. Confirm GST rate on new HSN 8479 pumps is 18 percent. Ask CA to file GSTR-3B before 20th. Negotiate 45-day credit terms with Sunrise Polymers. Pay electricity bill 28,400 by 25th June. Follow up Bharat Steel cheque clearance.",
  "voice-reminders": [
    {
      "id": "rem-1",
      "text": "Pay GST challan for May before due date",
      "when": "2026-06-20T11:00:00.000Z",
      "created": "2026-06-14T09:30:00.000Z"
    },
    {
      "id": "rem-2",
      "text": "Call Sharma Distributors for overdue payment",
      "when": "2026-06-22T05:30:00.000Z",
      "created": "2026-06-18T14:10:00.000Z"
    },
    {
      "id": "rem-3",
      "text": "Review payroll sheet for June with HR",
      "when": "2026-06-25T04:00:00.000Z",
      "created": "2026-06-19T08:00:00.000Z"
    },
    {
      "id": "rem-4",
      "text": "Renew factory insurance policy",
      "when": "2026-07-01T06:00:00.000Z",
      "created": "2026-06-15T12:45:00.000Z"
    },
    {
      "id": "rem-5",
      "text": "Submit TDS return 24Q quarterly",
      "when": "2026-07-07T05:00:00.000Z",
      "created": "2026-06-20T10:15:00.000Z"
    }
  ],
  "voice-work-log": [
    {
      "id": "wl-1",
      "at": "2026-06-21T03:30:00.000Z",
      "text": "Dispatched 120 cartons to Ramesh Traders against PO-2294."
    },
    {
      "id": "wl-2",
      "at": "2026-06-20T11:15:00.000Z",
      "text": "Reconciled HDFC current account, balance matches ledger."
    },
    {
      "id": "wl-3",
      "at": "2026-06-20T06:45:00.000Z",
      "text": "Approved reimbursement claims for sales team travel."
    },
    {
      "id": "wl-4",
      "at": "2026-06-19T13:20:00.000Z",
      "text": "Filed GSTR-1 for May 2026 on the GST portal."
    },
    {
      "id": "wl-5",
      "at": "2026-06-18T09:05:00.000Z",
      "text": "Met Sunrise Polymers, finalised 45-day credit terms."
    },
    {
      "id": "wl-6",
      "at": "2026-06-17T15:40:00.000Z",
      "text": "Raised invoice INV-2026-0188 to Bharat Steel for 4.2 lakh."
    }
  ],
  "esop-pool-size": 250000,
  "esop-fmv": 185,
  "esop-strike": 12,
  "esop-grants": [
    {
      "id": "g-1",
      "name": "Priya Nair",
      "options": 12000,
      "grantDate": "2024-04-01",
      "vestingYears": 4,
      "cliffMonths": 12
    },
    {
      "id": "g-2",
      "name": "Arjun Mehta",
      "options": 8000,
      "grantDate": "2024-07-15",
      "vestingYears": 4,
      "cliffMonths": 12
    },
    {
      "id": "g-3",
      "name": "Sneha Iyer",
      "options": 5000,
      "grantDate": "2025-01-10",
      "vestingYears": 3,
      "cliffMonths": 12
    },
    {
      "id": "g-4",
      "name": "Rahul Verma",
      "options": 15000,
      "grantDate": "2023-10-01",
      "vestingYears": 4,
      "cliffMonths": 12
    },
    {
      "id": "g-5",
      "name": "Kavya Reddy",
      "options": 3500,
      "grantDate": "2025-09-01",
      "vestingYears": 4,
      "cliffMonths": 6
    },
    {
      "id": "g-6",
      "name": "Imran Shaikh",
      "options": 6000,
      "grantDate": "2025-04-01",
      "vestingYears": 4,
      "cliffMonths": 12
    }
  ],
  "payroll-attendance": [
    {
      "id": "att-1",
      "empId": "EMP-001",
      "month": "2026-05",
      "payableDays": 31,
      "present": 28,
      "lop": 1,
      "compOff": 1,
      "leaveEncash": 0
    },
    {
      "id": "att-2",
      "empId": "EMP-002",
      "month": "2026-05",
      "payableDays": 31,
      "present": 30,
      "lop": 0,
      "compOff": 0,
      "leaveEncash": 1
    },
    {
      "id": "att-3",
      "empId": "EMP-003",
      "month": "2026-05",
      "payableDays": 31,
      "present": 26,
      "lop": 3,
      "compOff": 0,
      "leaveEncash": 0
    },
    {
      "id": "att-4",
      "empId": "EMP-004",
      "month": "2026-05",
      "payableDays": 31,
      "present": 31,
      "lop": 0,
      "compOff": 2,
      "leaveEncash": 0
    },
    {
      "id": "att-5",
      "empId": "EMP-005",
      "month": "2026-05",
      "payableDays": 31,
      "present": 29,
      "lop": 0,
      "compOff": 0,
      "leaveEncash": 2
    },
    {
      "id": "att-6",
      "empId": "EMP-006",
      "month": "2026-05",
      "payableDays": 31,
      "present": 27,
      "lop": 2,
      "compOff": 1,
      "leaveEncash": 0
    }
  ],
  "payroll-reimbursements": [
    {
      "id": "clm-1",
      "empId": "EMP-001",
      "date": "2026-06-05",
      "category": "Travel",
      "amount": 8400,
      "description": "Client visit Chennai cab and toll",
      "status": "approved"
    },
    {
      "id": "clm-2",
      "empId": "EMP-002",
      "date": "2026-06-08",
      "category": "Internet",
      "amount": 1200,
      "description": "Home broadband reimbursement",
      "status": "approved"
    },
    {
      "id": "clm-3",
      "empId": "EMP-003",
      "date": "2026-06-10",
      "category": "Meals",
      "amount": 2350,
      "description": "Team lunch with vendor",
      "status": "pending"
    },
    {
      "id": "clm-4",
      "empId": "EMP-004",
      "date": "2026-06-12",
      "category": "Fuel",
      "amount": 4600,
      "description": "Site supervision local travel",
      "status": "approved"
    },
    {
      "id": "clm-5",
      "empId": "EMP-005",
      "date": "2026-06-14",
      "category": "Stationery",
      "amount": 980,
      "description": "Office printing supplies",
      "status": "rejected"
    },
    {
      "id": "clm-6",
      "empId": "EMP-006",
      "date": "2026-06-18",
      "category": "Travel",
      "amount": 15200,
      "description": "Trade fair Mumbai flight and hotel",
      "status": "pending"
    }
  ],
  "payroll-contractor-payouts": [
    {
      "id": "cp-1",
      "name": "Krishna Fabrication Works",
      "pan": "ABKPK4567L",
      "section": "194C",
      "date": "2026-06-03",
      "gross": 185000,
      "hasPan": true
    },
    {
      "id": "cp-2",
      "name": "Deepak Consulting Services",
      "pan": "AFTPD8912R",
      "section": "194J",
      "date": "2026-06-07",
      "gross": 95000,
      "hasPan": true
    },
    {
      "id": "cp-3",
      "name": "Sai Logistics",
      "pan": "AAGCS3344K",
      "section": "194C",
      "date": "2026-06-11",
      "gross": 62000,
      "hasPan": true
    },
    {
      "id": "cp-4",
      "name": "Meena Designs",
      "pan": "",
      "section": "194J",
      "date": "2026-06-15",
      "gross": 48000,
      "hasPan": false
    },
    {
      "id": "cp-5",
      "name": "Vijay Electricals",
      "pan": "BNZPV1278M",
      "section": "194C",
      "date": "2026-06-19",
      "gross": 132000,
      "hasPan": true
    }
  ],
  "payroll-appraisal-hikes": {
    "EMP-001": 12,
    "EMP-002": 8,
    "EMP-003": 15,
    "EMP-004": 10,
    "EMP-005": 6,
    "EMP-006": 18
  },
  "payroll-planned-hires": [
    {
      "id": "ph-1",
      "role": "Production Supervisor",
      "monthlyCtc": 55000,
      "startMonth": 2
    },
    {
      "id": "ph-2",
      "role": "Accounts Executive",
      "monthlyCtc": 38000,
      "startMonth": 1
    },
    {
      "id": "ph-3",
      "role": "Sales Manager",
      "monthlyCtc": 85000,
      "startMonth": 4
    },
    {
      "id": "ph-4",
      "role": "Quality Inspector",
      "monthlyCtc": 42000,
      "startMonth": 3
    },
    {
      "id": "ph-5",
      "role": "Warehouse Assistant",
      "monthlyCtc": 28000,
      "startMonth": 2
    }
  ],
  "payroll-it-declarations": {
    "EMP-001": true,
    "EMP-002": true,
    "EMP-003": false,
    "EMP-004": true,
    "EMP-005": false,
    "EMP-006": true
  },
  "payroll-leave-balances": {
    "EMP-001": {
      "earned": 18,
      "availed": 6
    },
    "EMP-002": {
      "earned": 18,
      "availed": 11
    },
    "EMP-003": {
      "earned": 15,
      "availed": 3
    },
    "EMP-004": {
      "earned": 21,
      "availed": 14
    },
    "EMP-005": {
      "earned": 12,
      "availed": 2
    }
  },
  "payroll-salary-advances": [
    {
      "id": "adv-1",
      "empId": "EMP-001",
      "principal": 50000,
      "emi": 10000,
      "paid": 30000,
      "date": "2026-03-01"
    },
    {
      "id": "adv-2",
      "empId": "EMP-003",
      "principal": 25000,
      "emi": 5000,
      "paid": 5000,
      "date": "2026-05-15"
    },
    {
      "id": "adv-3",
      "empId": "EMP-004",
      "principal": 80000,
      "emi": 16000,
      "paid": 48000,
      "date": "2026-02-10"
    },
    {
      "id": "adv-4",
      "empId": "EMP-006",
      "principal": 30000,
      "emi": 7500,
      "paid": 0,
      "date": "2026-06-05"
    }
  ],
  "payroll-monthly-revenue": 1850000,
  "payroll-attrition-assumptions": {
    "recruitPct": 8.33,
    "rampMonths": 3,
    "rampLossPct": 50,
    "backfillDays": 45
  },
  "payroll-incentive-plan": {
    "ratePct": 5,
    "capPct": 30
  },
  "payroll-incentive-achievement": {
    "EMP-001": {
      "target": 500000,
      "actual": 620000
    },
    "EMP-002": {
      "target": 400000,
      "actual": 350000
    },
    "EMP-004": {
      "target": 600000,
      "actual": 720000
    },
    "EMP-006": {
      "target": 450000,
      "actual": 480000
    }
  },
  "collections-contacted": {
    "INV-2026-0142": true,
    "INV-2026-0156": true,
    "INV-2026-0163": false,
    "INV-2026-0171": true,
    "INV-2026-0188": false
  },
  "collections-promise-to-pay": [
    {
      "id": "ptp-1",
      "customer": "Ramesh Traders",
      "amount": 125000,
      "promiseDate": "2026-06-28",
      "note": "Confirmed via call, will pay after receiving GST credit",
      "status": "open",
      "createdAt": "2026-06-18T09:00:00.000Z"
    },
    {
      "id": "ptp-2",
      "customer": "Sharma Distributors",
      "amount": 84500,
      "promiseDate": "2026-06-15",
      "note": "Cheque to be couriered",
      "status": "kept",
      "createdAt": "2026-06-08T11:30:00.000Z"
    },
    {
      "id": "ptp-3",
      "customer": "Bharat Steel Co",
      "amount": 412000,
      "promiseDate": "2026-06-10",
      "note": "Awaiting fund release from their bank",
      "status": "broken",
      "createdAt": "2026-06-01T08:15:00.000Z"
    },
    {
      "id": "ptp-4",
      "customer": "Sunrise Polymers",
      "amount": 67800,
      "promiseDate": "2026-07-02",
      "note": "Part payment promised by month end",
      "status": "open",
      "createdAt": "2026-06-19T14:20:00.000Z"
    },
    {
      "id": "ptp-5",
      "customer": "Galaxy Enterprises",
      "amount": 198000,
      "promiseDate": "2026-06-25",
      "note": "Approved in their system, payment in process",
      "status": "open",
      "createdAt": "2026-06-16T10:45:00.000Z"
    }
  ],
  "collections-agents": [
    {
      "id": "ag-1",
      "name": "Anil Kumar",
      "target": 500000
    },
    {
      "id": "ag-2",
      "name": "Pooja Singh",
      "target": 400000
    },
    {
      "id": "ag-3",
      "name": "Suresh Patel",
      "target": 350000
    },
    {
      "id": "ag-4",
      "name": "Lakshmi Rao",
      "target": 600000
    }
  ],
  "collections-agent-assignments": {
    "Ramesh Traders": "ag-1",
    "Sharma Distributors": "ag-2",
    "Bharat Steel Co": "ag-1",
    "Sunrise Polymers": "ag-3",
    "Galaxy Enterprises": "ag-4"
  },
  "collections-settlements": [
    {
      "id": "set-1",
      "customer": "Bharat Steel Co",
      "original": 412000,
      "type": "settlement",
      "discountPct": 15,
      "reason": "Long overdue, agreed lump-sum settlement",
      "status": "proposed",
      "createdAt": "2026-06-12T09:00:00.000Z"
    },
    {
      "id": "set-2",
      "customer": "Old Vendor Mart",
      "original": 56000,
      "type": "writeoff",
      "discountPct": 100,
      "reason": "Business closed, unrecoverable",
      "status": "approved",
      "createdAt": "2026-05-28T13:30:00.000Z"
    },
    {
      "id": "set-3",
      "customer": "Galaxy Enterprises",
      "original": 198000,
      "type": "settlement",
      "discountPct": 8,
      "reason": "Disputed shortfall, negotiated discount",
      "status": "rejected",
      "createdAt": "2026-06-05T10:10:00.000Z"
    },
    {
      "id": "set-4",
      "customer": "Metro Hardware",
      "original": 92000,
      "type": "settlement",
      "discountPct": 10,
      "reason": "Early clearance incentive",
      "status": "approved",
      "createdAt": "2026-06-15T11:45:00.000Z"
    }
  ],
  "col-disputes": [
    {
      "id": "dsp-1",
      "invoiceId": "INV-2026-0163",
      "customer": "Galaxy Enterprises",
      "ref": "INV-2026-0163",
      "disputed": 22000,
      "reason": "Quantity short-supplied vs PO",
      "status": "open",
      "createdAt": "2026-06-10T09:30:00.000Z"
    },
    {
      "id": "dsp-2",
      "invoiceId": "INV-2026-0142",
      "customer": "Ramesh Traders",
      "ref": "INV-2026-0142",
      "disputed": 5400,
      "reason": "GST rate applied incorrectly",
      "status": "resolved",
      "createdAt": "2026-05-22T08:00:00.000Z"
    },
    {
      "id": "dsp-3",
      "invoiceId": "INV-2026-0188",
      "customer": "Bharat Steel Co",
      "ref": "INV-2026-0188",
      "disputed": 41000,
      "reason": "Pricing not as per agreed contract",
      "status": "open",
      "createdAt": "2026-06-18T14:15:00.000Z"
    },
    {
      "id": "dsp-4",
      "invoiceId": "INV-2026-0156",
      "customer": "Sunrise Polymers",
      "ref": "INV-2026-0156",
      "disputed": 3200,
      "reason": "Freight charge not agreed",
      "status": "resolved",
      "createdAt": "2026-06-02T10:20:00.000Z"
    }
  ],
  "col-ab-variants": {
    "a": {
      "subject": "Friendly reminder: invoice due",
      "body": "Hi, just a gentle reminder that your invoice is pending. Please let us know if you need any details. Thanks!"
    },
    "b": {
      "subject": "Action needed: payment overdue",
      "body": "Dear customer, your payment is now overdue. Kindly clear it at the earliest to keep your account in good standing."
    }
  },
  "col-ab-results": [
    {
      "id": "abr-1",
      "variant": "A",
      "customer": "Ramesh Traders",
      "sentAt": "2026-06-10T09:00:00.000Z",
      "paid": true
    },
    {
      "id": "abr-2",
      "variant": "B",
      "customer": "Sharma Distributors",
      "sentAt": "2026-06-11T09:00:00.000Z",
      "paid": true
    },
    {
      "id": "abr-3",
      "variant": "A",
      "customer": "Galaxy Enterprises",
      "sentAt": "2026-06-12T09:00:00.000Z",
      "paid": false
    },
    {
      "id": "abr-4",
      "variant": "B",
      "customer": "Bharat Steel Co",
      "sentAt": "2026-06-13T09:00:00.000Z",
      "paid": false
    },
    {
      "id": "abr-5",
      "variant": "A",
      "customer": "Sunrise Polymers",
      "sentAt": "2026-06-14T09:00:00.000Z",
      "paid": true
    },
    {
      "id": "abr-6",
      "variant": "B",
      "customer": "Metro Hardware",
      "sentAt": "2026-06-15T09:00:00.000Z",
      "paid": true
    }
  ],
  "col-interest-invoices": [
    {
      "id": "ii-1",
      "customer": "Bharat Steel Co",
      "ref": "INT-2026-001",
      "principal": 412000,
      "days": 65,
      "rate": 18,
      "interest": 13208,
      "createdAt": "2026-06-12T09:00:00.000Z"
    },
    {
      "id": "ii-2",
      "customer": "Galaxy Enterprises",
      "ref": "INT-2026-002",
      "principal": 198000,
      "days": 40,
      "rate": 18,
      "interest": 3905,
      "createdAt": "2026-06-14T09:00:00.000Z"
    },
    {
      "id": "ii-3",
      "customer": "Ramesh Traders",
      "ref": "INT-2026-003",
      "principal": 125000,
      "days": 22,
      "rate": 15,
      "interest": 1130,
      "createdAt": "2026-06-16T09:00:00.000Z"
    }
  ],
  "col-nach-mandates": [
    {
      "id": "nach-1",
      "customer": "Ramesh Traders",
      "umrn": "HDFC0000012345678901",
      "maxAmount": 200000,
      "frequency": "monthly",
      "nextDebit": "2026-07-05",
      "status": "active",
      "createdAt": "2026-01-15T09:00:00.000Z"
    },
    {
      "id": "nach-2",
      "customer": "Sunrise Polymers",
      "umrn": "ICIC0000098765432109",
      "maxAmount": 150000,
      "frequency": "as-presented",
      "nextDebit": "2026-07-01",
      "status": "active",
      "createdAt": "2026-03-10T09:00:00.000Z"
    },
    {
      "id": "nach-3",
      "customer": "Metro Hardware",
      "umrn": "SBIN0000045678912340",
      "maxAmount": 100000,
      "frequency": "monthly",
      "nextDebit": "2026-07-10",
      "status": "pending",
      "createdAt": "2026-06-01T09:00:00.000Z"
    },
    {
      "id": "nach-4",
      "customer": "Galaxy Enterprises",
      "umrn": "AXIS0000076543210987",
      "maxAmount": 250000,
      "frequency": "quarterly",
      "nextDebit": "2026-09-01",
      "status": "rejected",
      "createdAt": "2026-05-20T09:00:00.000Z"
    }
  ],
  "col-customer-owners": {
    "Ramesh Traders": "Anil Kumar",
    "Sharma Distributors": "Pooja Singh",
    "Bharat Steel Co": "Anil Kumar",
    "Sunrise Polymers": "Suresh Patel",
    "Galaxy Enterprises": "Lakshmi Rao"
  },
  "col-partial-payments": [
    {
      "id": "pp-1",
      "invoiceId": "INV-2026-0142",
      "amount": 60000,
      "date": "2026-06-08",
      "note": "First instalment by NEFT"
    },
    {
      "id": "pp-2",
      "invoiceId": "INV-2026-0142",
      "amount": 40000,
      "date": "2026-06-16",
      "note": "Second instalment"
    },
    {
      "id": "pp-3",
      "invoiceId": "INV-2026-0156",
      "amount": 30000,
      "date": "2026-06-12",
      "note": "Part payment against dispute resolution"
    },
    {
      "id": "pp-4",
      "invoiceId": "INV-2026-0188",
      "amount": 100000,
      "date": "2026-06-18",
      "note": "Advance against pending balance"
    }
  ],
  "col-credit-limits": {
    "Ramesh Traders": 500000,
    "Sharma Distributors": 300000,
    "Bharat Steel Co": 800000,
    "Sunrise Polymers": 250000,
    "Galaxy Enterprises": 600000
  },
  "col-monthly-goals": {
    "2026-04": 1500000,
    "2026-05": 1650000,
    "2026-06": 1800000,
    "2026-07": 1900000
  },
  "debt-covenants": [
    {
      "id": "cov-1",
      "name": "HDFC term loan",
      "metric": "dscr",
      "operator": ">=",
      "threshold": 1.25
    },
    {
      "id": "cov-2",
      "name": "ICICI working capital",
      "metric": "icr",
      "operator": ">=",
      "threshold": 2
    },
    {
      "id": "cov-3",
      "name": "SBI machinery loan",
      "metric": "leverage",
      "operator": "<=",
      "threshold": 3
    },
    {
      "id": "cov-4",
      "name": "Axis cash credit",
      "metric": "dscr",
      "operator": ">=",
      "threshold": 1.4
    }
  ],
  "debt-refi-offers": [
    {
      "id": "off-1",
      "lender": "HDFC Bank",
      "rate": 11.5,
      "tenureMonths": 48,
      "processingPct": 1,
      "otherFees": 5000
    },
    {
      "id": "off-2",
      "lender": "ICICI Bank",
      "rate": 12,
      "tenureMonths": 60,
      "processingPct": 0.75,
      "otherFees": 3500
    },
    {
      "id": "off-3",
      "lender": "Axis Bank",
      "rate": 11.25,
      "tenureMonths": 48,
      "processingPct": 1.25,
      "otherFees": 8000
    },
    {
      "id": "off-4",
      "lender": "Bajaj Finserv",
      "rate": 13.5,
      "tenureMonths": 36,
      "processingPct": 2,
      "otherFees": 2000
    }
  ],
  "debt-ladder-horizon": 24,
  "debt-optimizer-budget": "75000",
  "debt-foreclosure-penalty": "4",
  "debt-subvention-pct": "2",
  "debt-reset-bps": 25,
  "debt-icr-shock-bps": 200,
  "debt-prepay-penalty-pct": "2",
  "debt-de-equity": "5000000",
  "debt-premiumfin-lump": "350000",
  "debt-premiumfin-rate": "16",
  "debt-refundbridge-amt": "240000",
  "tok-erupee-opening": 850000,
  "tok-erupee-entries": [
    {
      "id": "er-1",
      "date": "2026-01-12",
      "direction": "in",
      "amount": 500000,
      "note": "CBDC pilot top-up from HDFC e-rupee wallet"
    },
    {
      "id": "er-2",
      "date": "2026-02-03",
      "direction": "out",
      "amount": 175000,
      "note": "Vendor payment to Shakti Steel Traders"
    },
    {
      "id": "er-3",
      "date": "2026-03-18",
      "direction": "in",
      "amount": 320000,
      "note": "Collection from Tata Motors (INV-2041)"
    },
    {
      "id": "er-4",
      "date": "2026-04-09",
      "direction": "out",
      "amount": 96000,
      "note": "GST tranche settlement"
    },
    {
      "id": "er-5",
      "date": "2026-05-21",
      "direction": "in",
      "amount": 410000,
      "note": "Advance from Bosch India"
    },
    {
      "id": "er-6",
      "date": "2026-06-10",
      "direction": "out",
      "amount": 248000,
      "note": "Contractor milestone payout — Phase 1"
    }
  ],
  "tok-rules": [
    {
      "id": "rule-1",
      "vendor": "Shakti Steel Traders Pvt Ltd",
      "amount": 450000,
      "trigger": "delivery",
      "condition": "MS plate consignment delivered & QC-passed at Peenya plant",
      "purpose": "raw-material purchase only"
    },
    {
      "id": "rule-2",
      "vendor": "Precision Tooling Works",
      "amount": 275000,
      "trigger": "milestone",
      "condition": "Die-set Phase-2 inspection signed off",
      "purpose": ""
    },
    {
      "id": "rule-3",
      "vendor": "Nandi Logistics",
      "amount": 132000,
      "trigger": "delivery",
      "condition": "POD uploaded for Bengaluru-Chennai dispatch",
      "purpose": "freight settlement"
    },
    {
      "id": "rule-4",
      "vendor": "Karnataka Power Solutions",
      "amount": 88000,
      "trigger": "approval",
      "condition": "Plant manager signs off DG-set service completion",
      "purpose": ""
    },
    {
      "id": "rule-5",
      "vendor": "Acme Packaging LLP",
      "amount": 64000,
      "trigger": "date",
      "condition": "Net-30 terms reach 2026-07-15",
      "purpose": "packaging consumables"
    }
  ],
  "tok-escrows": [
    {
      "id": "esc-1",
      "payer": "Acme Manufacturing Pvt Ltd",
      "payee": "Maruti Fabricators",
      "amount": 1200000,
      "arbiter": "S. Iyer & Co (CA)",
      "conditions": "Fabricated assembly delivered & inspected within 30 days",
      "status": "funded"
    },
    {
      "id": "esc-2",
      "payer": "Acme Manufacturing Pvt Ltd",
      "payee": "Visionary Automation Systems",
      "amount": 850000,
      "arbiter": "none",
      "conditions": "PLC commissioning report accepted by plant head",
      "status": "draft"
    },
    {
      "id": "esc-3",
      "payer": "Bosch India Ltd",
      "payee": "Acme Manufacturing Pvt Ltd",
      "amount": 2000000,
      "arbiter": "ICAI-empanelled arbiter",
      "conditions": "First lot of 5,000 units passes incoming QC",
      "status": "released"
    },
    {
      "id": "esc-4",
      "payer": "Acme Manufacturing Pvt Ltd",
      "payee": "GreenBuild Infra",
      "amount": 640000,
      "arbiter": "Project consultant",
      "conditions": "Warehouse civil work milestone-3 certified",
      "status": "draft"
    }
  ],
  "tok-assets": [
    {
      "id": "asset-1",
      "name": "INV-2041 (Tata Motors)",
      "kind": "invoice",
      "faceValue": 1850000,
      "tokenCount": 1850,
      "date": "2026-03-04"
    },
    {
      "id": "asset-2",
      "name": "Finished-goods lot FG-118",
      "kind": "inventory",
      "faceValue": 920000,
      "tokenCount": 920,
      "date": "2026-04-15"
    },
    {
      "id": "asset-3",
      "name": "Series-A preference pool",
      "kind": "equity",
      "faceValue": 5000000,
      "tokenCount": 5000,
      "date": "2026-02-20"
    },
    {
      "id": "asset-4",
      "name": "INV-2107 (Bosch India)",
      "kind": "invoice",
      "faceValue": 2400000,
      "tokenCount": 2400,
      "date": "2026-05-28"
    },
    {
      "id": "asset-5",
      "name": "Raw-material stock RM-44",
      "kind": "inventory",
      "faceValue": 560000,
      "tokenCount": 560,
      "date": "2026-06-02"
    }
  ],
  "tok-milestones": [
    {
      "id": "ms-1",
      "name": "Design sign-off",
      "pct": 20
    },
    {
      "id": "ms-2",
      "name": "Material procurement complete",
      "pct": 25
    },
    {
      "id": "ms-3",
      "name": "Fabrication & assembly",
      "pct": 30
    },
    {
      "id": "ms-4",
      "name": "Factory acceptance test",
      "pct": 15
    },
    {
      "id": "ms-5",
      "name": "Final delivery & commissioning",
      "pct": 10
    }
  ],
  "tok-captable-issued": 10000,
  "tok-captable-holders": [
    {
      "id": "h-1",
      "name": "Rajesh Mehta (Founder)",
      "tokens": 4500
    },
    {
      "id": "h-2",
      "name": "Priya Nair (Co-founder)",
      "tokens": 2500
    },
    {
      "id": "h-3",
      "name": "Blume Ventures (Investor)",
      "tokens": 1800
    },
    {
      "id": "h-4",
      "name": "ESOP Pool",
      "tokens": 900
    },
    {
      "id": "h-5",
      "name": "Angel Syndicate",
      "tokens": 300
    }
  ],
  "tok-readiness": [
    "erupee-wallet",
    "kyc-binding",
    "bank-rail",
    "accounting"
  ],
  "cop-actions-dismissed": [
    "concentration"
  ],
  "cop-guardrails": {
    "perActionLimit": 50000,
    "dailyLimit": 250000,
    "requireApprovalOver": 25000,
    "allowlistOnly": true,
    "quietHours": true
  },
  "cop-autopilot": {
    "brief": true,
    "collections": true,
    "spend": true,
    "compliance": true,
    "forecast": false
  },
  "cop-audit-log": [
    {
      "id": "log-1",
      "ts": "2026-06-20T09:14:00.000Z",
      "text": "Chased 3 overdue invoices after the daily brief — Tata Motors, Bosch, Ashok Leyland"
    },
    {
      "id": "log-2",
      "ts": "2026-06-18T15:42:00.000Z",
      "text": "Trimmed two SaaS subscriptions flagged by Savings Finder"
    },
    {
      "id": "log-3",
      "ts": "2026-06-16T11:05:00.000Z",
      "text": "Arranged ₹15L working-capital OD with ICICI per runway planner"
    },
    {
      "id": "log-4",
      "ts": "2026-06-12T08:30:00.000Z",
      "text": "Filed GSTR-3B for May after compliance digest reminder"
    }
  ],
  "cop-close-checklist": [
    "bank",
    "payroll"
  ],
  "cop-pay-reserve": 300000,
  "cop-savings-cut": [
    "Zoho Subscriptions",
    "AWS India"
  ],
  "cop-kpi-targets": {
    "runwayMonths": 12,
    "marginPct": 24,
    "dsoDays": 40,
    "healthScore": 75
  },
  "cop-collect-first-done": [
    "inv-2041",
    "inv-2098"
  ],
  "cop-this-week-done": [
    "gst-filing",
    "chase-overdue"
  ],
  "stm-eps-face-value": 10,
  "stm-eps-potential-shares": 12000,
  "stm-proj-rev-growth": 14,
  "stm-proj-cost-growth": 9,
  "stm-proj-horizon-months": 12,
  "stm-be-fixed-opex-pct": 68,
  "stm-budget-targets": {
    "revenue": 48000000,
    "cogs": 28000000,
    "payroll": 9000000,
    "otherOpex": 6000000
  },
  "stm-related-parties": {
    "Rajesh Mehta (Director)": true,
    "Mehta Family Trust": true,
    "Acme Holdings Pvt Ltd": true,
    "Shakti Steel Traders Pvt Ltd": false
  },
  "stm-contingent-items": [
    {
      "id": "ci-1",
      "particulars": "Bank guarantee to Karnataka State Pollution Control Board",
      "type": "guarantee",
      "amount": 500000,
      "likelihood": "possible"
    },
    {
      "id": "ci-2",
      "particulars": "GST demand under dispute (FY 2022-23 ITC mismatch)",
      "type": "litigation",
      "amount": 1250000,
      "likelihood": "possible"
    },
    {
      "id": "ci-3",
      "particulars": "Capital commitment for new CNC machine (PO placed)",
      "type": "commitment",
      "amount": 3200000,
      "likelihood": "probable"
    },
    {
      "id": "ci-4",
      "particulars": "Pending labour-court claim by ex-employee",
      "type": "litigation",
      "amount": 420000,
      "likelihood": "remote"
    }
  ],
  "stm-provisions-manual": [
    {
      "label": "Gratuity provision",
      "opening": 850000,
      "additions": 220000,
      "utilisation": 60000
    },
    {
      "label": "Warranty provision",
      "opening": 340000,
      "additions": 180000,
      "utilisation": 95000
    },
    {
      "label": "Provision for doubtful debts",
      "opening": 500000,
      "additions": 150000,
      "utilisation": 0
    }
  ],
  "trez-goals": [
    {
      "id": "g-1",
      "name": "Advance-tax (Q1 FY26)",
      "target": 1200000,
      "saved": 450000,
      "deadline": "2026-09-15",
      "rate": 7
    },
    {
      "id": "g-2",
      "name": "GST reserve",
      "target": 800000,
      "saved": 600000,
      "deadline": "2026-07-20",
      "rate": 6.8
    },
    {
      "id": "g-3",
      "name": "Diwali bonus pool",
      "target": 1500000,
      "saved": 400000,
      "deadline": "2026-10-25",
      "rate": 7.2
    },
    {
      "id": "g-4",
      "name": "Capex — CNC machine",
      "target": 3500000,
      "saved": 1200000,
      "deadline": "2027-03-31",
      "rate": 7.5
    }
  ],
  "trez-sweepfd-rules": [
    {
      "id": "sf-1",
      "account": "ICICI Current A/c",
      "floor": 1500000,
      "sweepTo": 500000,
      "chunk": 50000
    },
    {
      "id": "sf-2",
      "account": "HDFC Current A/c",
      "floor": 1000000,
      "sweepTo": 300000,
      "chunk": 25000
    }
  ],
  "trez-corpfd": [
    {
      "id": "seed-1",
      "issuer": "Bank FD (SBI)",
      "rating": "Sovereign-ish",
      "rate": 6.8,
      "tenure": 24
    },
    {
      "id": "seed-2",
      "issuer": "Bajaj Finance",
      "rating": "AAA",
      "rate": 7.9,
      "tenure": 24
    },
    {
      "id": "seed-3",
      "issuer": "Shriram Finance",
      "rating": "AA+",
      "rate": 8.5,
      "tenure": 24
    },
    {
      "id": "cfd-4",
      "issuer": "LIC Housing Finance",
      "rating": "AAA",
      "rate": 7.75,
      "tenure": 36
    },
    {
      "id": "cfd-5",
      "issuer": "Mahindra Finance",
      "rating": "AAA",
      "rate": 8.05,
      "tenure": 18
    }
  ],
  "trez-income": [
    {
      "id": "inc-1",
      "source": "ICICI Bank FD",
      "type": "FD interest",
      "amount": 42000,
      "tds": 4200,
      "date": "2026-03-31"
    },
    {
      "id": "inc-2",
      "source": "SBI Liquid Fund",
      "type": "Dividend",
      "amount": 18500,
      "tds": 0,
      "date": "2026-04-30"
    },
    {
      "id": "inc-3",
      "source": "Bajaj Finance Corp FD",
      "type": "FD interest",
      "amount": 31600,
      "tds": 3160,
      "date": "2026-05-31"
    },
    {
      "id": "inc-4",
      "source": "T-Bill 182d",
      "type": "Discount gain",
      "amount": 9800,
      "tds": 0,
      "date": "2026-06-10"
    },
    {
      "id": "inc-5",
      "source": "Embassy REIT",
      "type": "REIT distribution",
      "amount": 12400,
      "tds": 1240,
      "date": "2026-06-15"
    }
  ],
  "trez-rebalance": [
    {
      "id": "seed-1",
      "name": "Liquid / cash",
      "current": 600000,
      "target": 30
    },
    {
      "id": "seed-2",
      "name": "Debt funds",
      "current": 800000,
      "target": 40
    },
    {
      "id": "seed-3",
      "name": "Equity funds",
      "current": 600000,
      "target": 30
    }
  ],
  "trez-xirr": [
    {
      "id": "cf-1",
      "date": "2025-04-01",
      "amount": -1000000,
      "note": "Initial liquid-fund deployment"
    },
    {
      "id": "cf-2",
      "date": "2025-10-01",
      "amount": -500000,
      "note": "Top-up after Q2 surplus"
    },
    {
      "id": "cf-3",
      "date": "2026-01-15",
      "amount": 250000,
      "note": "Partial redemption for GST"
    },
    {
      "id": "cf-4",
      "date": "2026-06-21",
      "amount": 1380000,
      "note": "Current market value of holdings"
    }
  ],
  "trez-mtm": [
    {
      "id": "mtm-1",
      "name": "ICICI Pru Liquid Fund",
      "units": "12450.32",
      "cost": "100.50",
      "price": "108.20"
    },
    {
      "id": "mtm-2",
      "name": "HDFC Short Term Debt Fund",
      "units": "8200.00",
      "cost": "28.40",
      "price": "30.15"
    },
    {
      "id": "mtm-3",
      "name": "Nippon Index ETF (Nifty 50)",
      "units": "1500.00",
      "cost": "210.00",
      "price": "246.50"
    },
    {
      "id": "mtm-4",
      "name": "SGB 2023-24 Series",
      "units": "300.00",
      "cost": "5920.00",
      "price": "7480.00"
    }
  ],
  "trez-dicgc": [
    {
      "id": "be-1",
      "bank": "ICICI Bank",
      "amount": 1800000
    },
    {
      "id": "be-2",
      "bank": "HDFC Bank",
      "amount": 950000
    },
    {
      "id": "be-3",
      "bank": "State Bank of India",
      "amount": 480000
    },
    {
      "id": "be-4",
      "bank": "Axis Bank",
      "amount": 320000
    }
  ],
  "trez-policy": {
    "bufferWeeks": 6,
    "minRating": "AAA",
    "maxIssuerPct": 20,
    "maxSingleBankPct": 25,
    "allowEquity": false,
    "dualApprovalAbove": "1000000",
    "allowedInstruments": [
      "Liquid funds",
      "Overnight funds",
      "Short-duration debt",
      "Bank FD",
      "T-Bills / G-Secs"
    ]
  },
  "trez-almatch": [
    {
      "id": "al-1",
      "kind": "liability",
      "name": "GSTR-3B payment",
      "amount": "320000",
      "date": "2026-07-20"
    },
    {
      "id": "al-2",
      "kind": "liability",
      "name": "Term-loan EMI (ICICI)",
      "amount": "185000",
      "date": "2026-07-05"
    },
    {
      "id": "al-3",
      "kind": "asset",
      "name": "ICICI FD maturity",
      "amount": "1000000",
      "date": "2026-07-12"
    },
    {
      "id": "al-4",
      "kind": "liability",
      "name": "Advance tax Q1",
      "amount": "450000",
      "date": "2026-09-15"
    },
    {
      "id": "al-5",
      "kind": "asset",
      "name": "Bosch invoice collection",
      "amount": "2400000",
      "date": "2026-08-10"
    }
  ],
  "forecast-min-balance-floor": 1500000,
  "fc-rev-growth-pct": 12,
  "fc-planned-roles": [
    {
      "id": "pr-1",
      "title": "Production Supervisor",
      "monthlyCost": 65000,
      "startMonth": 2,
      "count": 2
    },
    {
      "id": "pr-2",
      "title": "Quality Engineer",
      "monthlyCost": 55000,
      "startMonth": 1,
      "count": 1
    },
    {
      "id": "pr-3",
      "title": "Sales Executive",
      "monthlyCost": 45000,
      "startMonth": 3,
      "count": 3
    },
    {
      "id": "pr-4",
      "title": "Accounts Manager",
      "monthlyCost": 70000,
      "startMonth": 4,
      "count": 1
    }
  ],
  "fc-capex-items": [
    {
      "id": "cx-1",
      "name": "CNC milling machine",
      "amount": 3200000,
      "month": 3,
      "loanPct": 60
    },
    {
      "id": "cx-2",
      "name": "Warehouse racking system",
      "amount": 850000,
      "month": 5,
      "loanPct": 0
    },
    {
      "id": "cx-3",
      "name": "Solar rooftop installation",
      "amount": 1400000,
      "month": 8,
      "loanPct": 70
    },
    {
      "id": "cx-4",
      "name": "Delivery vehicle (Tata Ace)",
      "amount": 620000,
      "month": 2,
      "loanPct": 50
    }
  ],
  "fc-owner-draw-pct": 45,
  "fc-products": [
    {
      "id": "pl-1",
      "name": "Precision gears",
      "units": 1200,
      "price": 850,
      "growth": 3
    },
    {
      "id": "pl-2",
      "name": "Sheet-metal enclosures",
      "units": 600,
      "price": 2400,
      "growth": 2
    },
    {
      "id": "pl-3",
      "name": "Machined shafts",
      "units": 1800,
      "price": 420,
      "growth": 4
    },
    {
      "id": "pl-4",
      "name": "Assembly contract work",
      "units": 90,
      "price": 18000,
      "growth": 5
    }
  ],
  "fc-weekly-opening-cash": 2850000,
  "fc-vendor-payments": [
    {
      "id": "vp-1",
      "vendor": "Shakti Steel Traders",
      "amount": 450000,
      "offsetDays": 15
    },
    {
      "id": "vp-2",
      "vendor": "Precision Tooling Works",
      "amount": 275000,
      "offsetDays": 30
    },
    {
      "id": "vp-3",
      "vendor": "Nandi Logistics",
      "amount": 132000,
      "offsetDays": 7
    },
    {
      "id": "vp-4",
      "vendor": "Karnataka Power Solutions",
      "amount": 88000,
      "offsetDays": 45
    },
    {
      "id": "vp-5",
      "vendor": "Acme Packaging LLP",
      "amount": 64000,
      "offsetDays": 60
    }
  ],
  "fc-gst-rev-growth": 10,
  "fc-pipeline-deals": [
    {
      "id": "pd-1",
      "name": "Bosch India — annual rate contract",
      "value": 4800000,
      "winPct": 70
    },
    {
      "id": "pd-2",
      "name": "Ashok Leyland — component supply",
      "value": 3200000,
      "winPct": 50
    },
    {
      "id": "pd-3",
      "name": "TVS Motor — tooling order",
      "value": 1800000,
      "winPct": 40
    },
    {
      "id": "pd-4",
      "name": "Mahindra — prototype batch",
      "value": 950000,
      "winPct": 60
    }
  ],
  "spend-card-entries": [
    {
      "id": "ce-1",
      "holder": "Rajesh Mehta",
      "kind": "card",
      "limit": 200000,
      "spent": 142000,
      "note": "Travel & client meetings"
    },
    {
      "id": "ce-2",
      "holder": "Priya Nair",
      "kind": "card",
      "limit": 150000,
      "spent": 168000,
      "note": "Procurement card"
    },
    {
      "id": "ce-3",
      "holder": "Plant office",
      "kind": "petty",
      "limit": 50000,
      "spent": 31000,
      "note": "Daily consumables float"
    },
    {
      "id": "ce-4",
      "holder": "Sales team",
      "kind": "card",
      "limit": 100000,
      "spent": 58000,
      "note": "Fuel & local conveyance"
    }
  ],
  "spend-subscriptions": [
    {
      "id": "sub-1",
      "name": "Zoho Books + Inventory",
      "amount": 24000,
      "cycle": "annual",
      "renewal": "2026-08-12"
    },
    {
      "id": "sub-2",
      "name": "AWS India",
      "amount": 38000,
      "cycle": "monthly",
      "renewal": "2026-07-01"
    },
    {
      "id": "sub-3",
      "name": "Tally Prime (silver renewal)",
      "amount": 18000,
      "cycle": "annual",
      "renewal": "2026-11-30"
    },
    {
      "id": "sub-4",
      "name": "Microsoft 365 Business",
      "amount": 12600,
      "cycle": "quarterly",
      "renewal": "2026-07-15"
    },
    {
      "id": "sub-5",
      "name": "Razorpay subscriptions",
      "amount": 4500,
      "cycle": "monthly",
      "renewal": "2026-07-05"
    }
  ],
  "spend-cost-centers": [
    {
      "id": "cc-1",
      "name": "Production",
      "budget": 1800000,
      "matchCat": "expense"
    },
    {
      "id": "cc-2",
      "name": "Payroll",
      "budget": 950000,
      "matchCat": "payroll"
    },
    {
      "id": "cc-3",
      "name": "Statutory & tax",
      "budget": 400000,
      "matchCat": "tax"
    },
    {
      "id": "cc-4",
      "name": "Debt servicing",
      "budget": 185000,
      "matchCat": "loan"
    }
  ],
  "spd-monthly-budget": "2800000",
  "spd-policy-rules": [
    {
      "id": "po-1",
      "category": "expense",
      "cap": 100000
    },
    {
      "id": "po-2",
      "category": "payroll",
      "cap": 200000
    },
    {
      "id": "po-3",
      "category": "tax",
      "cap": 500000
    },
    {
      "id": "po-4",
      "category": "transfer",
      "cap": 300000
    }
  ],
  "spd-approval-queue": [
    {
      "id": "aq-1",
      "vendor": "Precision Tooling Works",
      "amount": 275000,
      "requester": "Suresh K (Production)",
      "note": "Die-set replacement",
      "status": "pending",
      "created": "2026-06-18T10:20:00.000Z"
    },
    {
      "id": "aq-2",
      "vendor": "AWS India",
      "amount": 38000,
      "requester": "Priya Nair",
      "note": "Monthly cloud hosting",
      "status": "approved",
      "created": "2026-06-15T08:00:00.000Z"
    },
    {
      "id": "aq-3",
      "vendor": "GreenBuild Infra",
      "amount": 640000,
      "requester": "Rajesh Mehta",
      "note": "Warehouse civil milestone-3",
      "status": "pending",
      "created": "2026-06-19T14:35:00.000Z"
    },
    {
      "id": "aq-4",
      "vendor": "Lavish Events",
      "amount": 220000,
      "requester": "Sales team",
      "note": "Annual dealer meet",
      "status": "rejected",
      "created": "2026-06-10T09:10:00.000Z"
    }
  ],
  "spd-itc-rate": "18",
  "spd-approval-decided": {
    "aq-2": "2026-06-15T11:30:00.000Z",
    "aq-4": "2026-06-11T16:45:00.000Z"
  },
  "lender-covenants": [
    {
      "id": "c1",
      "label": "Min DSCR",
      "metric": "dscr",
      "op": "min",
      "threshold": 1.25
    },
    {
      "id": "c2",
      "label": "Min Current Ratio",
      "metric": "currentRatio",
      "op": "min",
      "threshold": 1.1
    },
    {
      "id": "c3",
      "label": "Max Leverage",
      "metric": "leverage",
      "op": "max",
      "threshold": 3.5
    },
    {
      "id": "c4",
      "label": "Min Interest Coverage",
      "metric": "interestCover",
      "op": "min",
      "threshold": 2
    },
    {
      "id": "c5",
      "label": "Max Debt/EBITDA (term loan)",
      "metric": "leverage",
      "op": "max",
      "threshold": 3
    }
  ],
  "lender-mis-cadence": "monthly",
  "lnd-shortlist": [
    {
      "id": "l1",
      "name": "HDFC Bank",
      "type": "Bank",
      "indicativeRate": 12.5,
      "maxTicket": 10000000,
      "turnaroundDays": 14,
      "relationship": 4
    },
    {
      "id": "l2",
      "name": "Lendingkart",
      "type": "Fintech",
      "indicativeRate": 18,
      "maxTicket": 5000000,
      "turnaroundDays": 3,
      "relationship": 2
    },
    {
      "id": "l3",
      "name": "Bajaj Finserv",
      "type": "NBFC",
      "indicativeRate": 15,
      "maxTicket": 7500000,
      "turnaroundDays": 7,
      "relationship": 3
    },
    {
      "id": "l4",
      "name": "ICICI Bank",
      "type": "Bank",
      "indicativeRate": 12.9,
      "maxTicket": 12000000,
      "turnaroundDays": 12,
      "relationship": 5
    },
    {
      "id": "l5",
      "name": "Tata Capital",
      "type": "NBFC",
      "indicativeRate": 14.25,
      "maxTicket": 8000000,
      "turnaroundDays": 6,
      "relationship": 3
    },
    {
      "id": "l6",
      "name": "FlexiLoans",
      "type": "Fintech",
      "indicativeRate": 19.5,
      "maxTicket": 4000000,
      "turnaroundDays": 2,
      "relationship": 1
    }
  ],
  "lnd-app-tracker": [
    {
      "id": "a1",
      "lender": "HDFC Bank",
      "amount": 5000000,
      "stage": "underwriting",
      "appliedOn": "2026-05-28"
    },
    {
      "id": "a2",
      "lender": "Lendingkart",
      "amount": 2500000,
      "stage": "sanctioned",
      "appliedOn": "2026-06-02"
    },
    {
      "id": "a3",
      "lender": "ICICI Bank",
      "amount": 7500000,
      "stage": "docs",
      "appliedOn": "2026-06-09"
    },
    {
      "id": "a4",
      "lender": "Bajaj Finserv",
      "amount": 3000000,
      "stage": "disbursed",
      "appliedOn": "2026-04-15"
    },
    {
      "id": "a5",
      "lender": "Tata Capital",
      "amount": 4000000,
      "stage": "submitted",
      "appliedOn": "2026-06-18"
    },
    {
      "id": "a6",
      "lender": "FlexiLoans",
      "amount": 1500000,
      "stage": "declined",
      "appliedOn": "2026-05-10"
    }
  ],
  "lnd-disbursement": [
    {
      "id": "t1",
      "date": "2026-06-20",
      "amount": 2000000,
      "note": "Initial draw"
    },
    {
      "id": "t2",
      "date": "2026-08-01",
      "amount": 1500000,
      "note": "Inventory build-up"
    },
    {
      "id": "t3",
      "date": "2026-09-15",
      "amount": 1000000,
      "note": "Festive-season working capital"
    },
    {
      "id": "t4",
      "date": "2026-11-01",
      "amount": 500000,
      "note": "Final tranche on milestone"
    }
  ],
  "lnd-syndication": [
    {
      "id": "s1",
      "lender": "Lead Bank (HDFC)",
      "sharePct": 45,
      "rate": 12.5
    },
    {
      "id": "s2",
      "lender": "NBFC participant (Bajaj)",
      "sharePct": 30,
      "rate": 15
    },
    {
      "id": "s3",
      "lender": "Fintech participant (Lendingkart)",
      "sharePct": 15,
      "rate": 17
    },
    {
      "id": "s4",
      "lender": "ICICI co-lender",
      "sharePct": 10,
      "rate": 13.25
    }
  ],
  "lnd-collateral-register": [
    {
      "id": "k1",
      "asset": "Factory premises, Peenya",
      "type": "Property",
      "value": 9000000,
      "haircutPct": 25
    },
    {
      "id": "k2",
      "asset": "CNC machinery",
      "type": "Plant & Machinery",
      "value": 3000000,
      "haircutPct": 40
    },
    {
      "id": "k3",
      "asset": "Finished goods stock",
      "type": "Stock",
      "value": 2500000,
      "haircutPct": 30
    },
    {
      "id": "k4",
      "asset": "Trade receivables (hypothecated)",
      "type": "Receivables",
      "value": 4000000,
      "haircutPct": 40
    },
    {
      "id": "k5",
      "asset": "HDFC fixed deposit",
      "type": "Fixed Deposit",
      "value": 1500000,
      "haircutPct": 10
    }
  ],
  "lnd-relationship-crm": [
    {
      "id": "r1",
      "lender": "HDFC Bank",
      "contact": "RM — Priya Nair",
      "lastContacted": "2026-06-05",
      "nextAction": "Submit Q1 stock statement",
      "nextDate": "2026-06-12"
    },
    {
      "id": "r2",
      "lender": "Bajaj Finserv",
      "contact": "Credit — Amit Shah",
      "lastContacted": "2026-06-10",
      "nextAction": "Renewal review call",
      "nextDate": "2026-06-25"
    },
    {
      "id": "r3",
      "lender": "ICICI Bank",
      "contact": "RM — Rohan Mehta",
      "lastContacted": "2026-06-14",
      "nextAction": "Share audited FY26 financials",
      "nextDate": "2026-06-28"
    },
    {
      "id": "r4",
      "lender": "Tata Capital",
      "contact": "Sales — Deepa Rao",
      "lastContacted": "2026-06-08",
      "nextAction": "Negotiate rate reset",
      "nextDate": "2026-07-02"
    }
  ],
  "lnd-utilization-trend": [
    {
      "id": "u1",
      "month": "2026-01",
      "sanctioned": 5000000,
      "drawn": 2800000
    },
    {
      "id": "u2",
      "month": "2026-02",
      "sanctioned": 5000000,
      "drawn": 3200000
    },
    {
      "id": "u3",
      "month": "2026-03",
      "sanctioned": 5000000,
      "drawn": 4100000
    },
    {
      "id": "u4",
      "month": "2026-04",
      "sanctioned": 5000000,
      "drawn": 3600000
    },
    {
      "id": "u5",
      "month": "2026-05",
      "sanctioned": 6000000,
      "drawn": 4500000
    },
    {
      "id": "u6",
      "month": "2026-06",
      "sanctioned": 6000000,
      "drawn": 5200000
    }
  ],
  "investor-data-room": [
    {
      "id": "dr-0",
      "category": "Corporate",
      "label": "Certificate of Incorporation",
      "status": "ready"
    },
    {
      "id": "dr-1",
      "category": "Corporate",
      "label": "Memorandum & Articles of Association",
      "status": "ready"
    },
    {
      "id": "dr-2",
      "category": "Corporate",
      "label": "Shareholders' Agreement",
      "status": "in_progress"
    },
    {
      "id": "dr-3",
      "category": "Corporate",
      "label": "Board & shareholder resolutions",
      "status": "in_progress"
    },
    {
      "id": "dr-4",
      "category": "Cap Table",
      "label": "Current cap table",
      "status": "ready"
    },
    {
      "id": "dr-5",
      "category": "Cap Table",
      "label": "ESOP pool & grant register",
      "status": "in_progress"
    },
    {
      "id": "dr-6",
      "category": "Financials",
      "label": "Audited financial statements (3 yrs)",
      "status": "ready"
    },
    {
      "id": "dr-7",
      "category": "Financials",
      "label": "Management accounts (latest)",
      "status": "ready"
    },
    {
      "id": "dr-8",
      "category": "Financials",
      "label": "Financial model / projections",
      "status": "in_progress"
    },
    {
      "id": "dr-9",
      "category": "Tax",
      "label": "GST returns & registration",
      "status": "ready"
    },
    {
      "id": "dr-10",
      "category": "Tax",
      "label": "Income tax returns (3 yrs)",
      "status": "ready"
    },
    {
      "id": "dr-11",
      "category": "Legal",
      "label": "Material customer contracts",
      "status": "in_progress"
    },
    {
      "id": "dr-12",
      "category": "Legal",
      "label": "Key vendor / supplier agreements",
      "status": "missing"
    },
    {
      "id": "dr-13",
      "category": "Legal",
      "label": "IP assignments & trademarks",
      "status": "missing"
    },
    {
      "id": "dr-14",
      "category": "HR",
      "label": "Employment agreements & policies",
      "status": "in_progress"
    },
    {
      "id": "dr-15",
      "category": "HR",
      "label": "Founder employment / vesting terms",
      "status": "ready"
    }
  ],
  "investor-exit-waterfall": [
    {
      "id": "sc-1",
      "name": "Series A Preferred",
      "type": "pref",
      "invested": 50000000,
      "shares": 2000000,
      "multiple": 1
    },
    {
      "id": "sc-2",
      "name": "Seed Preferred",
      "type": "pref",
      "invested": 15000000,
      "shares": 1500000,
      "multiple": 1
    },
    {
      "id": "sc-3",
      "name": "Founders (Common)",
      "type": "common",
      "invested": 0,
      "shares": 6000000,
      "multiple": 1
    },
    {
      "id": "sc-4",
      "name": "ESOP Pool (Common)",
      "type": "common",
      "invested": 0,
      "shares": 500000,
      "multiple": 1
    },
    {
      "id": "sc-5",
      "name": "Angel (Common)",
      "type": "common",
      "invested": 5000000,
      "shares": 800000,
      "multiple": 1
    }
  ],
  "ir-fundraise-pipeline": [
    {
      "id": "fp-1",
      "name": "Anita Desai",
      "firm": "Sequoia SE Asia",
      "stage": "diligence",
      "check": 30000000,
      "nextStep": "Send data-room access"
    },
    {
      "id": "fp-2",
      "name": "Vikram Rao",
      "firm": "Blume Ventures",
      "stage": "pitched",
      "check": 15000000,
      "nextStep": "Follow up on deck"
    },
    {
      "id": "fp-3",
      "name": "Meera Iyer",
      "firm": "Angel — ex-CFO",
      "stage": "term_sheet",
      "check": 5000000,
      "nextStep": "Review terms with counsel"
    },
    {
      "id": "fp-4",
      "name": "Sanjay Gupta",
      "firm": "Accel India",
      "stage": "intro",
      "check": 40000000,
      "nextStep": "Schedule intro call"
    },
    {
      "id": "fp-5",
      "name": "Kavya Reddy",
      "firm": "Elevation Capital",
      "stage": "closed",
      "check": 25000000,
      "nextStep": "Onboard to cap table"
    },
    {
      "id": "fp-6",
      "name": "Arjun Nair",
      "firm": "Peak XV",
      "stage": "passed",
      "check": 0,
      "nextStep": "Revisit next round"
    }
  ],
  "ir-board-meeting-date": "2026-06-28",
  "ir-board-agenda": [
    {
      "id": "ag-1",
      "topic": "Review of previous minutes",
      "minutes": 10,
      "owner": "Chair",
      "done": true
    },
    {
      "id": "ag-2",
      "topic": "CEO update & KPIs",
      "minutes": 20,
      "owner": "portfolio",
      "done": true
    },
    {
      "id": "ag-3",
      "topic": "Financials & runway",
      "minutes": 15,
      "owner": "CFO",
      "done": false
    },
    {
      "id": "ag-4",
      "topic": "Fundraise plan",
      "minutes": 20,
      "owner": "CEO",
      "done": false
    },
    {
      "id": "ag-5",
      "topic": "AOB & next meeting",
      "minutes": 10,
      "owner": "Chair",
      "done": false
    }
  ],
  "ir-board-minutes": "Board confirmed quorum. Previous minutes approved unanimously. CEO presented June KPIs: MRR up 14% MoM, net burn reduced to within plan. CFO flagged runway of ~9 months and recommended opening the Series A process by August. Board approved the ESOP pool top-up to 12% and authorised the CFO to circulate an updated cap table within 14 days.",
  "ir-board-actions": [
    {
      "id": "ac-1",
      "task": "Circulate updated cap table",
      "owner": "CFO",
      "due": "2026-07-05",
      "done": false
    },
    {
      "id": "ac-2",
      "task": "Open Series A data room",
      "owner": "CEO",
      "due": "2026-07-15",
      "done": false
    },
    {
      "id": "ac-3",
      "task": "Finalise FY26 audited accounts",
      "owner": "CFO",
      "due": "2026-07-20",
      "done": true
    },
    {
      "id": "ac-4",
      "task": "Draft ESOP top-up resolution",
      "owner": "Company Secretary",
      "due": "2026-07-10",
      "done": false
    }
  ],
  "ir-esop-pool-size": 1200000,
  "ir-esop-grants": [
    {
      "id": "es-1",
      "grantee": "Head of Eng",
      "options": 180000,
      "vestMonths": 48,
      "cliffMonths": 12,
      "grantDate": "2024-04-01"
    },
    {
      "id": "es-2",
      "grantee": "VP Sales",
      "options": 120000,
      "vestMonths": 48,
      "cliffMonths": 12,
      "grantDate": "2024-10-01"
    },
    {
      "id": "es-3",
      "grantee": "Early team pool",
      "options": 90000,
      "vestMonths": 48,
      "cliffMonths": 6,
      "grantDate": "2023-07-01"
    },
    {
      "id": "es-4",
      "grantee": "Head of Finance",
      "options": 75000,
      "vestMonths": 48,
      "cliffMonths": 12,
      "grantDate": "2025-01-15"
    },
    {
      "id": "es-5",
      "grantee": "Product Lead",
      "options": 60000,
      "vestMonths": 48,
      "cliffMonths": 12,
      "grantDate": "2025-06-01"
    }
  ],
  "wc-mpbf-other-ca": "350000",
  "wc-mpbf-other-cl": "180000",
  "wc-stockstmt-stock-margin": "25",
  "wc-stockstmt-debtor-margin": "40",
  "wc-stockstmt-excl90": "yes",
  "wc-stockstmt-creditors": "1850000",
  "wc-debtorfin-advance": "80",
  "wc-debtorfin-rate": "13",
  "wa-sales-capture": [
    {
      "id": "ws1",
      "date": "2026-06-18",
      "customer": "Sharma Hardware",
      "item": "MS Angle 50mm — 200 kg",
      "amount": 14500
    },
    {
      "id": "ws2",
      "date": "2026-06-19",
      "customer": "Verma Constructions",
      "item": "TMT Bars Fe500 — 1 tonne",
      "amount": 62000
    },
    {
      "id": "ws3",
      "date": "2026-06-19",
      "customer": "Lakshmi Fabricators",
      "item": "GI Sheet 2mm — 50 units",
      "amount": 38750
    },
    {
      "id": "ws4",
      "date": "2026-06-20",
      "customer": "Reddy Interiors",
      "item": "Aluminium Section — 80 m",
      "amount": 21200
    },
    {
      "id": "ws5",
      "date": "2026-06-20",
      "customer": "Bengaluru Steel Mart",
      "item": "MS Plate 10mm — 500 kg",
      "amount": 47500
    },
    {
      "id": "ws6",
      "date": "2026-06-21",
      "customer": "Khan Engineering Works",
      "item": "Welding consumables (bulk)",
      "amount": 9800
    }
  ],
  "wa-approvals": [
    {
      "id": "ap1",
      "type": "invoice",
      "reference": "INV-2026-0142",
      "amount": 285000,
      "requestedBy": "Sales — Ramesh",
      "status": "pending"
    },
    {
      "id": "ap2",
      "type": "payment",
      "reference": "PO-2026-0098 (vendor)",
      "amount": 120000,
      "requestedBy": "Purchase — Sunita",
      "status": "approved"
    },
    {
      "id": "ap3",
      "type": "expense",
      "reference": "Travel reimbursement — Mumbai",
      "amount": 18500,
      "requestedBy": "Field — Arjun",
      "status": "pending"
    },
    {
      "id": "ap4",
      "type": "payment",
      "reference": "Electricity bill — Peenya unit",
      "amount": 64200,
      "requestedBy": "Admin — Deepa",
      "status": "approved"
    },
    {
      "id": "ap5",
      "type": "invoice",
      "reference": "INV-2026-0139",
      "amount": 92000,
      "requestedBy": "Sales — Ramesh",
      "status": "rejected"
    },
    {
      "id": "ap6",
      "type": "expense",
      "reference": "Office supplies",
      "amount": 7600,
      "requestedBy": "Admin — Deepa",
      "status": "pending"
    }
  ],
  "wa-price-list": [
    {
      "id": "pl1",
      "name": "TMT Bars Fe500",
      "price": 62000,
      "unit": "per tonne"
    },
    {
      "id": "pl2",
      "name": "MS Angle 50mm",
      "price": 72,
      "unit": "per kg"
    },
    {
      "id": "pl3",
      "name": "GI Sheet 2mm",
      "price": 775,
      "unit": "per unit"
    },
    {
      "id": "pl4",
      "name": "MS Plate 10mm",
      "price": 95,
      "unit": "per kg"
    },
    {
      "id": "pl5",
      "name": "Aluminium Section",
      "price": 265,
      "unit": "per metre"
    },
    {
      "id": "pl6",
      "name": "Welding rod (3.2mm)",
      "price": 480,
      "unit": "per packet"
    }
  ],
  "wa-service-reminders": [
    {
      "id": "sr1",
      "customer": "Verma Constructions",
      "service": "Annual rate-contract renewal",
      "dueDate": "2026-07-01",
      "amount": 0
    },
    {
      "id": "sr2",
      "customer": "Sharma Hardware",
      "service": "Quarterly stock replenishment",
      "dueDate": "2026-07-10",
      "amount": 45000
    },
    {
      "id": "sr3",
      "customer": "Reddy Interiors",
      "service": "Pending balance follow-up",
      "dueDate": "2026-06-25",
      "amount": 21200
    },
    {
      "id": "sr4",
      "customer": "Lakshmi Fabricators",
      "service": "AMC for fabrication tools",
      "dueDate": "2026-08-05",
      "amount": 12000
    },
    {
      "id": "sr5",
      "customer": "Khan Engineering Works",
      "service": "Credit limit review",
      "dueDate": "2026-07-18",
      "amount": 0
    }
  ],
  "wa-loyalty-members": [
    {
      "id": "lm1",
      "name": "Sharma Hardware",
      "points": 1840
    },
    {
      "id": "lm2",
      "name": "Verma Constructions",
      "points": 3260
    },
    {
      "id": "lm3",
      "name": "Lakshmi Fabricators",
      "points": 920
    },
    {
      "id": "lm4",
      "name": "Reddy Interiors",
      "points": 540
    },
    {
      "id": "lm5",
      "name": "Bengaluru Steel Mart",
      "points": 2710
    },
    {
      "id": "lm6",
      "name": "Khan Engineering Works",
      "points": 1150
    }
  ],
  "wa-quick-replies": [
    {
      "id": "qr1",
      "title": "Order received",
      "body": "Thank you for your order! We have received it and will confirm dispatch shortly."
    },
    {
      "id": "qr2",
      "title": "Payment reminder",
      "body": "Gentle reminder: an amount is pending on your account. Kindly clear it at your earliest convenience."
    },
    {
      "id": "qr3",
      "title": "Share price list",
      "body": "Please find our latest price list attached. Prices are valid for 7 days and exclusive of GST."
    },
    {
      "id": "qr4",
      "title": "Dispatch confirmation",
      "body": "Your order has been dispatched. Expected delivery in 2-3 working days. Tracking details to follow."
    },
    {
      "id": "qr5",
      "title": "GST invoice",
      "body": "Your GST invoice is attached. GSTIN: 29ABCDE1234F1Z5. Please confirm receipt."
    }
  ],
  "frnt-alert-rules": [
    {
      "id": "fr1",
      "name": "Low cash warning",
      "event": "low_balance",
      "threshold": 500000,
      "channel": "whatsapp",
      "enabled": true
    },
    {
      "id": "fr2",
      "name": "Large expense flag",
      "event": "large_expense",
      "threshold": 200000,
      "channel": "in_app",
      "enabled": true
    },
    {
      "id": "fr3",
      "name": "Overdue invoice alert",
      "event": "invoice_overdue",
      "threshold": 15,
      "channel": "email",
      "enabled": true
    },
    {
      "id": "fr4",
      "name": "Big revenue inflow",
      "event": "new_revenue",
      "threshold": 500000,
      "channel": "whatsapp",
      "enabled": false
    },
    {
      "id": "fr5",
      "name": "EMI due soon",
      "event": "debt_due",
      "threshold": 5,
      "channel": "in_app",
      "enabled": true
    }
  ],
  "frnt-ambient-rules": [
    {
      "id": "am1",
      "metric": "cash",
      "op": "<",
      "threshold": 400000,
      "action": "Notify owner on WhatsApp and pause discretionary spend"
    },
    {
      "id": "am2",
      "metric": "runway",
      "op": "<",
      "threshold": 90,
      "action": "Trigger fundraise checklist and alert CFO"
    },
    {
      "id": "am3",
      "metric": "monthly_net",
      "op": "<",
      "threshold": 0,
      "action": "Flag negative month in dashboard and email founders"
    },
    {
      "id": "am4",
      "metric": "debt_outstanding",
      "op": ">",
      "threshold": 8000000,
      "action": "Hold new credit applications pending review"
    }
  ],
  "frnt-pqc-done": [
    "tls13",
    "key-rotation",
    "vault-encryption"
  ],
  "frnt-radar": {
    "ai": 3,
    "realtime": 3,
    "tokenization": 2,
    "quantum": 1
  },
  "frnt-treasury-policy": {
    "minBuffer": "500000",
    "maxSweep": "70",
    "yieldFloor": "6.5",
    "autoDraw": false,
    "autoSweep": true
  },
  "fd-rd": [
    {
      "id": "fd1",
      "kind": "FD",
      "bank": "HDFC Bank",
      "principal": 2000000,
      "rate": 7.25,
      "tenure": 24,
      "tenureUnit": "months",
      "startDate": "2025-09-01",
      "tdsApplied": true
    },
    {
      "id": "fd2",
      "kind": "FD",
      "bank": "ICICI Bank",
      "principal": 1500000,
      "rate": 7,
      "tenure": 12,
      "tenureUnit": "months",
      "startDate": "2026-01-15",
      "tdsApplied": true
    },
    {
      "id": "rd1",
      "kind": "RD",
      "bank": "SBI",
      "principal": 600000,
      "rate": 6.75,
      "tenure": 36,
      "tenureUnit": "months",
      "startDate": "2025-06-01",
      "monthlyRd": 50000,
      "tdsApplied": false
    },
    {
      "id": "fd3",
      "kind": "FD",
      "bank": "Axis Bank",
      "principal": 1000000,
      "rate": 7.4,
      "tenure": 3,
      "tenureUnit": "years",
      "startDate": "2024-12-01",
      "tdsApplied": true
    }
  ],
  "credit-cards": [
    {
      "id": "cc1",
      "name": "Business Platinum",
      "bank": "HDFC Bank",
      "limit": 500000,
      "balance": 182000,
      "dueDate": "2026-07-05",
      "minDue": 9100
    },
    {
      "id": "cc2",
      "name": "Corporate Card",
      "bank": "ICICI Bank",
      "limit": 300000,
      "balance": 47500,
      "dueDate": "2026-07-02",
      "minDue": 2400
    },
    {
      "id": "cc3",
      "name": "Fuel & Travel",
      "bank": "Axis Bank",
      "limit": 200000,
      "balance": 96300,
      "dueDate": "2026-07-12",
      "minDue": 4800
    },
    {
      "id": "cc4",
      "name": "SmartBuy Rewards",
      "bank": "SBI Card",
      "limit": 150000,
      "balance": 21000,
      "dueDate": "2026-07-08",
      "minDue": 1050
    }
  ],
  "cap-table": [
    {
      "id": "ct1",
      "name": "Acme Manufacturing (Founders)",
      "shareClass": "Founder",
      "sharesHeld": 8000000,
      "amountInvested": 1000000
    },
    {
      "id": "ct2",
      "name": "ESOP Pool",
      "shareClass": "ESOP Pool",
      "sharesHeld": 1200000,
      "amountInvested": 0
    },
    {
      "id": "ct3",
      "name": "Angel Round (Meera Iyer)",
      "shareClass": "Angel",
      "sharesHeld": 1000000,
      "amountInvested": 5000000
    },
    {
      "id": "ct4",
      "name": "Seed — Blume Ventures",
      "shareClass": "VC",
      "sharesHeld": 1500000,
      "amountInvested": 15000000
    },
    {
      "id": "ct5",
      "name": "Co-founder (CTO)",
      "shareClass": "Founder",
      "sharesHeld": 2000000,
      "amountInvested": 250000
    }
  ],
  "commercial-credit-score": [
    {
      "id": "rd1",
      "date": "2026-01-10",
      "bureau": "CIBIL Rank",
      "score": 6,
      "note": "CMR-6 at year start; moderate leverage"
    },
    {
      "id": "rd2",
      "date": "2026-03-12",
      "bureau": "CRIF Highmark",
      "score": 685,
      "note": "Improved after EMI regularisation"
    },
    {
      "id": "rd3",
      "date": "2026-04-20",
      "bureau": "Experian",
      "score": 712,
      "note": "On-time GST filing reflected"
    },
    {
      "id": "rd4",
      "date": "2026-05-15",
      "bureau": "CIBIL Rank",
      "score": 5,
      "note": "CMR-5 — moved up one tier"
    },
    {
      "id": "rd5",
      "date": "2026-06-10",
      "bureau": "CRIF Highmark",
      "score": 724,
      "note": "Lower utilisation, cleaner track"
    }
  ],
  "invoice-discounting": [
    {
      "id": "id1",
      "buyer": "Verma Constructions",
      "invoiceNo": "INV-2026-0142",
      "amount": 285000,
      "dueDate": "2026-08-15",
      "discountRate": 13.5,
      "tenureDays": 55,
      "status": "listed"
    },
    {
      "id": "id2",
      "buyer": "Reddy Interiors",
      "invoiceNo": "INV-2026-0128",
      "amount": 156000,
      "dueDate": "2026-07-20",
      "discountRate": 14,
      "tenureDays": 30,
      "status": "funded"
    },
    {
      "id": "id3",
      "buyer": "Bengaluru Steel Mart",
      "invoiceNo": "INV-2026-0151",
      "amount": 420000,
      "dueDate": "2026-09-01",
      "discountRate": 12.75,
      "tenureDays": 72,
      "status": "listed"
    },
    {
      "id": "id4",
      "buyer": "Lakshmi Fabricators",
      "invoiceNo": "INV-2026-0133",
      "amount": 98000,
      "dueDate": "2026-07-10",
      "discountRate": 13,
      "tenureDays": 19,
      "status": "funded"
    },
    {
      "id": "id5",
      "buyer": "Sharma Hardware",
      "invoiceNo": "INV-2026-0147",
      "amount": 67500,
      "dueDate": "2026-08-05",
      "discountRate": 15,
      "tenureDays": 45,
      "status": "listed"
    }
  ],
  "loan-doc-pack": {
    "pan": true,
    "aadhaar": true,
    "gst-reg": true,
    "bank-stmt": true,
    "itr": true,
    "financials": true,
    "gst-returns": true,
    "debt-sheet": false,
    "stock-debtor": false,
    "proj-fin": false
  },
  "cr-scoreplan-done": {
    "consistency": true,
    "buffer": true,
    "gst": true,
    "diversify": false,
    "dsr": false,
    "age": false
  },
  "cr-offercmp": [
    {
      "lender": "HDFC Bank",
      "amount": "5000000",
      "rate": "12.5",
      "months": "36",
      "fee": "1",
      "insurance": "0.5"
    },
    {
      "lender": "Bajaj Finserv",
      "amount": "5000000",
      "rate": "15",
      "months": "36",
      "fee": "1.5",
      "insurance": "0"
    },
    {
      "lender": "Lendingkart",
      "amount": "5000000",
      "rate": "18",
      "months": "24",
      "fee": "2",
      "insurance": "0"
    }
  ],
  "capital-use-of-funds": [
    {
      "id": "uf1",
      "category": "Product & Engineering",
      "committed": 12000000,
      "deployed": 7500000
    },
    {
      "id": "uf2",
      "category": "Sales & Marketing",
      "committed": 8000000,
      "deployed": 4200000
    },
    {
      "id": "uf3",
      "category": "Working Capital",
      "committed": 6000000,
      "deployed": 5100000
    },
    {
      "id": "uf4",
      "category": "Capex — Machinery",
      "committed": 5000000,
      "deployed": 3000000
    },
    {
      "id": "uf5",
      "category": "Team & G&A",
      "committed": 4000000,
      "deployed": 2600000
    }
  ],
  "capital-total-raised": "35000000",
  "dashboard-kpi-board": [
    "balance",
    "runway",
    "revenueMtd",
    "alerts",
    "netMtd",
    "burn"
  ],
  "dashboard-goals": [
    {
      "id": "g1",
      "metric": "revenue",
      "label": "Hit ₹50L monthly revenue",
      "target": 5000000,
      "period": "2026-09"
    },
    {
      "id": "g2",
      "metric": "profit",
      "label": "Reach ₹10L monthly net profit",
      "target": 1000000,
      "period": "2026-12"
    },
    {
      "id": "g3",
      "metric": "balance",
      "label": "Build ₹1Cr cash buffer",
      "target": 10000000,
      "period": "2027-03"
    },
    {
      "id": "g4",
      "metric": "revenue",
      "label": "Cross ₹6Cr ARR run-rate",
      "target": 6000000,
      "period": "2026-12"
    }
  ],
  "val-dilution-waterfall": [
    {
      "id": "r1",
      "name": "Seed",
      "raise": 15000000,
      "preMoney": 60000000
    },
    {
      "id": "r2",
      "name": "Series A",
      "raise": 60000000,
      "preMoney": 240000000
    },
    {
      "id": "r3",
      "name": "Series B",
      "raise": 150000000,
      "preMoney": 600000000
    }
  ],
  "ts-readiness-checklist": [
    {
      "id": "valuation",
      "label": "Agreed pre-money valuation and round size",
      "done": true
    },
    {
      "id": "liqpref",
      "label": "Liquidation preference capped at 1× non-participating",
      "done": true
    },
    {
      "id": "antidilution",
      "label": "Anti-dilution is broad-based weighted-average (not full-ratchet)",
      "done": true
    },
    {
      "id": "board",
      "label": "Board composition keeps founder/independent majority",
      "done": false
    },
    {
      "id": "pool",
      "label": "Option pool sized to hiring plan and pool-shuffle understood",
      "done": true
    },
    {
      "id": "vetoes",
      "label": "Protective provisions narrowed to genuinely major events",
      "done": false
    },
    {
      "id": "vesting",
      "label": "Founder reverse-vesting terms reviewed (credit time served)",
      "done": true
    },
    {
      "id": "drag",
      "label": "Drag-along threshold and price floor acceptable",
      "done": false
    },
    {
      "id": "fema",
      "label": "FEMA / instrument type (CCPS vs SAFE) confirmed for India",
      "done": false
    },
    {
      "id": "angeltax",
      "label": "Section 56(2)(viib) angel-tax exposure checked",
      "done": true
    },
    {
      "id": "lawyer",
      "label": "Definitive agreements reviewed by a lawyer",
      "done": false
    }
  ],
  "pred-scenarios": [
    {
      "id": "optimistic",
      "name": "Optimistic",
      "revDelta": 20,
      "costDelta": 5
    },
    {
      "id": "base",
      "name": "Base",
      "revDelta": 0,
      "costDelta": 0
    },
    {
      "id": "recession",
      "name": "Recession",
      "revDelta": -30,
      "costDelta": -10
    },
    {
      "id": "festive",
      "name": "Festive Surge",
      "revDelta": 35,
      "costDelta": 12
    },
    {
      "id": "supply-shock",
      "name": "Supply Shock",
      "revDelta": -15,
      "costDelta": 18
    }
  ],
  "health-fitness-trend": [
    {
      "month": "2026-01",
      "score": 62,
      "topDriver": "Revenue growth",
      "topDrag": "Receivables ageing"
    },
    {
      "month": "2026-02",
      "score": 65,
      "topDriver": "Cash buffer",
      "topDrag": "High leverage"
    },
    {
      "month": "2026-03",
      "score": 68,
      "topDriver": "Profitability",
      "topDrag": "Receivables ageing"
    },
    {
      "month": "2026-04",
      "score": 71,
      "topDriver": "Profitability",
      "topDrag": "Inventory days"
    },
    {
      "month": "2026-05",
      "score": 74,
      "topDriver": "Cash buffer",
      "topDrag": "Inventory days"
    },
    {
      "month": "2026-06",
      "score": 78,
      "topDriver": "Revenue growth",
      "topDrag": "High leverage"
    }
  ],
  "bmk-headcount": 42,
  "cfo-deck-slides": {
    "summary": true,
    "pnl": true,
    "cashflow": true,
    "runway": true,
    "ar-ageing": false,
    "debt": true,
    "alerts": false
  },
  "cfo-actions-done": {
    "collect-overdue-ar": true,
    "sweep-idle-cash": false,
    "review-runway": true,
    "clear-alerts": false
  },
  "cfo-whatchanged-baseline": {
    "takenAt": "2026-05-21T09:00:00Z",
    "balance": 4820000,
    "runway": 268,
    "revenueMtd": 4350000,
    "netMtd": 720000,
    "openAr": 3950000,
    "overdueAr": 1180000,
    "totalDebt": 7600000
  }
};
