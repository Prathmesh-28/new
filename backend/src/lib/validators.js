'use strict';

/**
 * India-identifier validators — pure functions, no DB, CommonJS.
 *
 * Validation logic ported (re-implemented in our own code) from:
 *   - mastermunj/format-utils (MIT) — Verhoeff algorithm tables + VPA format
 *   - srikanthlogic/gstin-validator (MIT) — GSTN modulus-36 checksum
 * We do not copy their distributable; only the underlying algorithms.
 */

// ---------------------------------------------------------------------------
// Regex-only identifiers
// ---------------------------------------------------------------------------

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// TAN: 4 letters, 5 digits, 1 letter (e.g. MUMR12345A)
const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
// CIN: U/L + 5-digit industry code + 2-letter state + 4-digit year +
//      3-letter ownership + 6-digit registration number (21 chars)
const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// VPA / UPI handle: 3+ [a-z0-9_.-] then @ then 3+ letters
const VPA_RE = /^[a-z0-9_.-]{3,}@[a-z]{3,}$/i;

function norm(s) {
  return typeof s === 'string' ? s.trim() : '';
}
function up(s) {
  return norm(s).toUpperCase();
}

function isValidPan(s) {
  return PAN_RE.test(up(s));
}

function isValidTan(s) {
  return TAN_RE.test(up(s));
}

function isValidCin(s) {
  return CIN_RE.test(up(s));
}

function isValidIfsc(s) {
  return IFSC_RE.test(up(s));
}

function isValidVpa(s) {
  const v = norm(s);
  if (v.length > 255) return false;
  return VPA_RE.test(v);
}

// ---------------------------------------------------------------------------
// Aadhaar — 12 digits + Verhoeff checksum
// (Verhoeff tables ported from mastermunj/format-utils, MIT)
// ---------------------------------------------------------------------------

// d table: dihedral group D5 multiplication
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// p table: permutation, indexed by (position mod 8)
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// inv table: multiplicative inverse (kept for completeness / generation use)
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

// Verhoeff: a number string is valid iff the running checksum collapses to 0.
function verhoeffValid(digitsStr) {
  let c = 0;
  const arr = digitsStr.split('').reverse();
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i].charCodeAt(0) - 48; // '0' => 0
    if (d < 0 || d > 9) return false;
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][d]];
  }
  return c === 0;
}

function isValidAadhaar(s) {
  const v = norm(s).replace(/\s/g, '');
  if (!/^[2-9][0-9]{11}$/.test(v)) return false; // 12 digits, cannot start 0/1
  return verhoeffValid(v);
}

// ---------------------------------------------------------------------------
// GSTIN — 15 chars + GSTN modulus-36 checksum
// (algorithm ported from srikanthlogic/gstin-validator, MIT)
// ---------------------------------------------------------------------------

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const GSTN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTN_MOD = GSTN_CHARS.length; // 36

// Compute the expected check character for the first 14 chars of a GSTIN.
function gstinCheckChar(gstin) {
  let factor = 2;
  let sum = 0;
  // iterate from the char just before the check digit, backward
  for (let i = gstin.length - 2; i >= 0; i--) {
    const codePoint = GSTN_CHARS.indexOf(gstin[i]);
    if (codePoint < 0) return null;
    let digit = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    digit = Math.floor(digit / GSTN_MOD) + (digit % GSTN_MOD);
    sum += digit;
  }
  const checkCodePoint = (GSTN_MOD - (sum % GSTN_MOD)) % GSTN_MOD;
  return GSTN_CHARS[checkCodePoint];
}

function isValidGstin(s) {
  const v = up(s);
  if (!GSTIN_RE.test(v)) return false;
  const expected = gstinCheckChar(v);
  return expected !== null && expected === v[14];
}

// Extract structured info from a GSTIN (returns valid:false if checksum fails).
function gstinInfo(s) {
  const v = up(s);
  if (!isValidGstin(v)) {
    return { valid: false, stateCode: null, pan: null, entityCode: null };
  }
  return {
    valid: true,
    stateCode: v.slice(0, 2), // first 2 = state code
    pan: v.slice(2, 12), // chars 3-12 = embedded PAN
    entityCode: v.slice(12, 13), // char 13 = entity/registration count code
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const VALIDATORS = {
  pan: isValidPan,
  tan: isValidTan,
  cin: isValidCin,
  ifsc: isValidIfsc,
  vpa: isValidVpa,
  upi: isValidVpa,
  aadhaar: isValidAadhaar,
  gstin: isValidGstin,
  gst: isValidGstin,
};

function validate(kind, value) {
  const fn = VALIDATORS[String(kind || '').toLowerCase()];
  if (!fn) return false;
  return fn(value);
}

module.exports = {
  isValidPan,
  isValidTan,
  isValidCin,
  isValidIfsc,
  isValidVpa,
  isValidAadhaar,
  isValidGstin,
  gstinInfo,
  validate,
};
