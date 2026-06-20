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
const automation = require("./automation");
const ops = require("./ops");
const einvoice = require("./einvoice");
const ocr = require("./ocr");
const gsp = require("./gsp");
const portal = require("./portal");
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
  ...automation,
  ...ops,
  payments,
  fx,
  einvoice,
  ocr,
  gsp,
  signPortalToken: portal.signToken,
  verifyPortalToken: portal.verifyToken,
  seedBooks,
  ledgerIdByName,
  router: require("./http"),
};
