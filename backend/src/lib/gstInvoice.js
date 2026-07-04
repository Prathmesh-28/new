"use strict";
// GST presentation helpers for the standalone invoice document: the official GSTIN state-code
// map and the intra/inter-state tax split. The GL bridge (lib/invoiceGl.js) already posts
// CGST/SGST vs IGST correctly — this makes the CUSTOMER-FACING document say the same thing,
// so the tax invoice an SMB hands over is s.31/Rule 46 presentable (split tax + place of supply).
const GST_STATES = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const stateOf = (gstin) => (typeof gstin === "string" && /^\d{2}/.test(gstin.trim()) ? gstin.trim().slice(0, 2) : null);
const stateName = (code) => (code && GST_STATES[code]) || null;

// Split an invoice's GST for display. Mirrors lib/invoiceGl.js: inter-state only when BOTH
// party states are known and differ; otherwise intra (CGST+SGST halves, SGST takes the odd
// paise so the two always sum exactly to the GST amount).
//   → { interState, placeOfSupply: {code,name}|null, lines: [{label, amount}] }
function taxSplit({ gstAmount, gstRate, buyerGstin, sellerGstin }) {
  const gst = round2(gstAmount);
  const rate = Number(gstRate) || 0;
  const buyer = stateOf(buyerGstin);
  const seller = stateOf(sellerGstin);
  const interState = !!(buyer && seller && buyer !== seller);
  const posCode = buyer || seller || null;
  const placeOfSupply = posCode ? { code: posCode, name: stateName(posCode) } : null;
  if (gst <= 0) return { interState, placeOfSupply, lines: [] };
  if (interState) return { interState, placeOfSupply, lines: [{ label: `IGST (${rate}%)`, amount: gst }] };
  const cgst = round2(gst / 2);
  return {
    interState, placeOfSupply,
    lines: [
      { label: `CGST (${round2(rate / 2)}%)`, amount: cgst },
      { label: `SGST (${round2(rate / 2)}%)`, amount: round2(gst - cgst) },
    ],
  };
}

module.exports = { GST_STATES, stateOf, stateName, taxSplit };
