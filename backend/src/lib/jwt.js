const jwt = require("jsonwebtoken");

const SECRET  = process.env.JWT_SECRET  || "dev-secret-change-in-prod";
const REFRESH = process.env.JWT_REFRESH || "dev-refresh-change-in-prod";

function signAccess(payload)  { return jwt.sign(payload, SECRET,  { expiresIn: "15m" }); }
function signRefresh(payload) { return jwt.sign(payload, REFRESH, { expiresIn: "7d"  }); }
function verifyAccess(token)  { return jwt.verify(token, SECRET);  }
function verifyRefresh(token) { return jwt.verify(token, REFRESH); }

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
