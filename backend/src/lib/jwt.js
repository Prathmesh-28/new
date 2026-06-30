const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const DEV_SECRET  = "dev-secret-change-in-prod";
const isProd = process.env.NODE_ENV === "production";

const SECRET = process.env.JWT_SECRET || DEV_SECRET;
// Refresh tokens MUST use a secret distinct from access tokens. If JWT_REFRESH
// isn't set, derive a strong, non-public one from JWT_SECRET (never fall back to
// a hardcoded constant - that allowed forged refresh tokens).
const REFRESH = process.env.JWT_REFRESH
  || (process.env.JWT_SECRET ? crypto.createHash("sha256").update("hr-refresh:" + process.env.JWT_SECRET).digest("hex") : "dev-refresh-change-in-prod");

// Fail fast in production rather than booting with guessable secrets.
if (isProd && (!process.env.JWT_SECRET || SECRET === DEV_SECRET)) {
  throw new Error("FATAL: JWT_SECRET must be set to a strong, unique value in production.");
}

function signAccess(payload)  { return jwt.sign({ ...payload, typ: "access" },  SECRET,  { expiresIn: "15m" }); }
function signRefresh(payload) { return jwt.sign({ ...payload, typ: "refresh" }, REFRESH, { expiresIn: "7d"  }); }

function verifyAccess(token) {
  const p = jwt.verify(token, SECRET);
  if (p.typ && p.typ !== "access") throw new Error("Wrong token type");
  return p;
}
function verifyRefresh(token) {
  const p = jwt.verify(token, REFRESH);
  if (p.typ && p.typ !== "refresh") throw new Error("Wrong token type");
  return p;
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
