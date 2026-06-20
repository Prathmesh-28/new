// §3.2 — the public surface of the books module. Everything OUTSIDE the module
// must interact only through here (never the ledger tables directly).
const engine = require("./posting-engine");
const reports = require("./reports");
const mappers = require("./mappers");
const documents = require("./documents");
const inventory = require("./inventory");
const { seedBooks, ledgerIdByName } = require("./seed");

module.exports = {
  postVoucher: engine.postVoucher,
  reverseVoucher: engine.reverseVoucher,
  PostError: engine.PostError,
  ...reports,
  ...mappers,
  ...documents,
  ...inventory,
  seedBooks,
  ledgerIdByName,
  router: require("./http"),
};
