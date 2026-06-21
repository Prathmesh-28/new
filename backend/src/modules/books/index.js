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
const costcentres = require("./costcentres");
const billwise = require("./billwise");
const tds = require("./tds");
const ewaybill = require("./ewaybill");
const importer = require("./importer");
const closing = require("./closing");
const ledgersadmin = require("./ledgersadmin");
const items = require("./items");
const vouchertools = require("./vouchertools");
const taxfiling = require("./taxfiling");
const incometax = require("./incometax");
const taxrules = require("./taxrules");
const pricing = require("./pricing");
const payterms = require("./payterms");
const subscriptions = require("./subscriptions");
const importers = require("./importers");
const usage = require("./usage");
const demoseed = require("./demoseed");
const itr = require("./itr");
const billofentry = require("./billofentry");
const reposting = require("./reposting");
const landedcost = require("./landedcost");
const rules = require("./rules");
const importcfg = require("./importconfig");
const dunning = require("./dunning");
const integrity = require("./integrity");
const settlement = require("./settlement");
const recurrence = require("./recurrence");
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
  ...costcentres,
  ...billwise,
  ...tds,
  ...importer,
  ...closing,
  ...ledgersadmin,
  ...items,
  ...vouchertools,
  ...taxfiling,
  ...incometax,
  taxrules,
  ...pricing,
  ...payterms,
  ...subscriptions,
  ...importers,
  ...usage,
  ...billofentry,
  ...reposting,
  ...landedcost,
  ...importcfg,
  ...dunning,
  itr,
  rules,
  integrity,
  settlement,
  recurrence,
  ewaybill,
  payments,
  fx,
  einvoice,
  ocr,
  gsp,
  signPortalToken: portal.signToken,
  verifyPortalToken: portal.verifyToken,
  seedBooks,
  seedDemo: demoseed.seedDemo,
  ledgerIdByName,
  router: require("./http"),
};
