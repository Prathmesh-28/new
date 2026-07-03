"use strict";
// Regression tests for the security-critical, pure guards shipped this session: the SSRF
// IP/host classifier (a regression here = an SSRF hole) and the SSO signed-state (a regression =
// an auth-bypass/CSRF). DB-free. Run: node --test src/lib/security.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const ssrf = require("./ssrfGuard");
const sso = require("./sso");

test("ssrfGuard.isPrivateIp blocks every private/loopback/link-local/metadata form", () => {
  const blocked = ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.0.1", "172.31.255.255",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1",
    "::ffff:127.0.0.1", "64:ff9b::127.0.0.1", "255.255.255.255", "224.0.0.1"];
  for (const ip of blocked) assert.equal(ssrf.isPrivateIp(ip), true, `${ip} must be blocked`);
});

test("ssrfGuard.isPrivateIp allows genuine public IPs", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.114.5", "2606:4700:4700::1111"]) assert.equal(ssrf.isPrivateIp(ip), false, `${ip} should be allowed`);
});

test("ssrfGuard.assertPublicUrl rejects private/loopback + non-http, allows public https", () => {
  assert.equal(ssrf.assertPublicUrl("http://localhost/x").ok, false);
  assert.equal(ssrf.assertPublicUrl("http://127.0.0.1/x").ok, false);
  assert.equal(ssrf.assertPublicUrl("http://[::1]/x").ok, false);
  assert.equal(ssrf.assertPublicUrl("https://acme.internal/x").ok, false);
  assert.equal(ssrf.assertPublicUrl("ftp://example.com/x").ok, false, "non-http rejected");
  assert.equal(ssrf.assertPublicUrl("not a url").ok, false);
  assert.equal(ssrf.assertPublicUrl("https://hooks.example.com/headroom").ok, true);
});

test("ssrfGuard.resolveIsPublic on IP literals needs no DNS and matches the classifier", async () => {
  assert.equal(await ssrf.resolveIsPublic("127.0.0.1"), false);
  assert.equal(await ssrf.resolveIsPublic("8.8.8.8"), true);
});

test("sso signed state round-trips and rejects tampering", () => {
  const tok = sso.signState("tenant-abc");
  assert.equal(sso.verifyState(tok).tenant, "tenant-abc");
  assert.throws(() => sso.verifyState(tok + "x"), "tampered token must throw");
  assert.throws(() => sso.verifyState("not.a.jwt"), "garbage must throw");
});

test("sso.isPublicDomain blocks public mailbox providers, allows corporate", () => {
  for (const d of ["gmail.com", "outlook.com", "yahoo.com", "icloud.com"]) assert.equal(sso.isPublicDomain(d), true, `${d} is public`);
  for (const d of ["acme.com", "headroom.example"]) assert.equal(sso.isPublicDomain(d), false, `${d} is corporate`);
});

test("sso.isConfigured requires enabled + issuer + client_id + secret", () => {
  assert.equal(sso.isConfigured(null), false);
  assert.equal(sso.isConfigured({ enabled: true, issuer: "https://idp", client_id: "c" }), false, "no secret → not configured");
  assert.equal(sso.isConfigured({ enabled: false, issuer: "https://idp", client_id: "c", client_secret: "s" }), false, "disabled → not configured");
  assert.equal(sso.isConfigured({ enabled: true, issuer: "https://idp", client_id: "c", client_secret: "s" }), true);
});
