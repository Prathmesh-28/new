"use strict";
// SSRF guard for outbound webhooks. Two layers: a fast literal check at registration, and the
// AUTHORITATIVE resolve-and-check at delivery (a public DNS name can still resolve to a private
// IP). Blocks loopback / private / link-local / ULA / CGNAT / cloud-metadata across IPv4 and
// IPv6 (incl. IPv4-mapped and NAT64). Residual DNS-rebinding TOCTOU (resolve→connect) is noted;
// closing it fully needs IP-pinned connections.
const dns = require("dns").promises;

function isPrivateIpv4(ip) {
  const p = ip.split(".").map((x) => Number(x));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → block
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;                 // this-host / private / loopback
  if (a === 169 && b === 254) return true;                          // link-local + 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;                 // private
  if (a === 192 && b === 168) return true;                          // private
  if (a === 100 && b >= 64 && b <= 127) return true;                // CGNAT
  if (a === 192 && b === 0) return true;                            // 192.0.0.0/24 (incl. NAT64 well-known)
  if (a >= 224) return true;                                        // multicast / reserved / broadcast
  return false;
}
function isPrivateIp(ipRaw) {
  const ip = String(ipRaw).toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, ""); // strip brackets + zone id
  if (ip.includes(".") && !ip.includes(":")) return isPrivateIpv4(ip);
  // IPv6
  if (ip === "::1" || ip === "::" || ip === "") return true;
  if (/^fe[89ab]/.test(ip)) return true;   // fe80::/10 link-local
  if (/^f[cd]/.test(ip)) return true;      // fc00::/7 ULA
  const mapped = ip.match(/(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped or NAT64
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (/^::ffff:[0-9a-f]/.test(ip)) return true; // mapped in hex form → be safe, block
  return false;
}
const isIpLiteral = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":");

// Literal fast-fail at registration. Real DNS names pass here (checked again at delivery).
function assertPublicUrl(u) {
  let host;
  try { const url = new URL(u); if (!/^https?:$/.test(url.protocol)) return { ok: false, reason: "URL must be http(s)" }; host = url.hostname.toLowerCase().replace(/^\[|\]$/g, ""); }
  catch { return { ok: false, reason: "invalid URL" }; }
  if (host === "localhost" || host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".localhost")) return { ok: false, reason: "private host" };
  if (isIpLiteral(host) && isPrivateIp(host)) return { ok: false, reason: "private IP" };
  return { ok: true };
}

// Authoritative check at delivery: resolve the host, reject if ANY resolved address is private.
async function resolveIsPublic(hostname) {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  if (isIpLiteral(h)) return !isPrivateIp(h);
  try {
    const addrs = await dns.lookup(h, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch { return false; } // unresolvable → block
}

module.exports = { isPrivateIp, assertPublicUrl, resolveIsPublic };
