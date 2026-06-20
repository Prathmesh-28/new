// §3.2 — the public surface of the books module. Everything OUTSIDE the module
// must interact only through here (never the ledger tables directly).
const engine = require("./posting-engine");
const reports = require("./reports");
const mappers = require("./mappers");
const documents = require("./documents");
const inventory = require("./inventory");
const gst = require("./gst");
const recon = require("./recon");
const payments = require("./payments");
const fx = require("./fx");
const assets = require("./assets");
const { seedBooks, ledgerIdByName } = require("./seed");

module.exports = {
  postVoucher: engine.postVoucher,
  reverseVoucher: engine.reverseVoucher,
  PostError: engine.PostError,
  ...reports,
  ...mappers,
  ...documents,
  ...inventory,
  ...gst,
  ...recon,
  ...assets,
  payments,
  fx,
  seedBooks,
  ledgerIdByName,
  router: require("./http"),
};
