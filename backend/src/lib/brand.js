"use strict";
// Brand-kit generators (#184): a company round stamp/seal and a letterhead band, rendered as
// self-contained SVG from the tenant's persisted brand fields. Purely cosmetic — a legally-binding
// e-signature/DSC stays gated behind a real provider; this produces a visual seal/letterhead for
// documents. No external deps.
function esc(s) { return String(s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])); }

// Round company seal: name curved along the top arc, GSTIN/city along the bottom, star in centre.
function stampSvg({ companyName = "Company", gstin = "", city = "", primary = "#1f6feb" } = {}) {
  const top = String(companyName).toUpperCase().slice(0, 42);
  const bottom = String(gstin || "").toUpperCase().slice(0, 42);
  const mid = String(city || "").toUpperCase().slice(0, 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300" role="img" aria-label="Company seal">
  <defs>
    <path id="seal-top" d="M 45 150 A 105 105 0 0 1 255 150"/>
    <path id="seal-bot" d="M 58 150 A 92 92 0 0 0 242 150"/>
  </defs>
  <circle cx="150" cy="150" r="142" fill="none" stroke="${primary}" stroke-width="3"/>
  <circle cx="150" cy="150" r="116" fill="none" stroke="${primary}" stroke-width="1.5"/>
  <text fill="${primary}" font-family="Georgia, serif" font-size="17" font-weight="700" letter-spacing="1.5">
    <textPath href="#seal-top" startOffset="50%" text-anchor="middle">${esc(top)}</textPath>
  </text>
  <text fill="${primary}" font-family="Georgia, serif" font-size="12" letter-spacing="1.5">
    <textPath href="#seal-bot" startOffset="50%" text-anchor="middle">${esc(bottom)}</textPath>
  </text>
  <text x="150" y="132" text-anchor="middle" fill="${primary}" font-size="22" font-weight="700">★</text>
  <text x="150" y="162" text-anchor="middle" fill="${primary}" font-family="Georgia, serif" font-size="13" letter-spacing="1">${esc(mid)}</text>
  <text x="150" y="182" text-anchor="middle" fill="${primary}" font-family="Georgia, serif" font-size="9">SEAL</text>
</svg>`;
}

// Letterhead band: logo slot + company name + address/GSTIN line, in brand colours.
function letterheadSvg({ companyName = "Company", legalName = "", address = "", gstin = "", phone = "", website = "", primary = "#1f6feb", accent = "#0d1117" } = {}) {
  const sub = [legalName, address].filter(Boolean).join(" · ").slice(0, 90);
  const contact = [gstin ? `GSTIN ${gstin}` : "", phone, website].filter(Boolean).join("  |  ").slice(0, 90);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 110" width="800" height="110" role="img" aria-label="Letterhead">
  <rect x="0" y="0" width="800" height="110" fill="#ffffff"/>
  <rect x="0" y="0" width="8" height="110" fill="${primary}"/>
  <text x="28" y="46" fill="${accent}" font-family="Georgia, serif" font-size="26" font-weight="700">${esc(companyName)}</text>
  <text x="28" y="70" fill="#555" font-family="Arial, sans-serif" font-size="12">${esc(sub)}</text>
  <text x="28" y="90" fill="${primary}" font-family="Arial, sans-serif" font-size="11">${esc(contact)}</text>
  <line x1="28" y1="100" x2="772" y2="100" stroke="${primary}" stroke-width="1.5"/>
</svg>`;
}

module.exports = { stampSvg, letterheadSvg };
