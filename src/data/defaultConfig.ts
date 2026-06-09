import type { AppStore } from "./types";

const today = new Date();
const d = (offset: number) => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().split("T")[0];
};
const ts = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString();

export const defaultConfig: AppStore = {
  firm: {
    name: "Headroom",
    legalName: "Headroom Financial Technologies Pvt. Ltd.",
    industry: "SaaS / Fintech",
    foundedYear: 2023,
  },

  roles: [
    {
      id: "super_admin",
      label: "Super Admin",
      accessibleTabs: ["dashboard", "forecast", "credit", "capital", "settings", "admin"],
      visibleTabs:    ["dashboard", "forecast", "credit", "capital", "settings", "admin"],
      canExport: true,
      canAddNotes: true,
      namespaces: ["app", "forecast", "credit", "capital"],
    },
    {
      id: "owner",
      label: "Business Owner",
      accessibleTabs: ["dashboard", "forecast", "credit", "capital", "settings"],
      visibleTabs:    ["dashboard", "forecast", "credit", "capital", "settings"],
      canExport: true,
      canAddNotes: true,
      namespaces: ["app", "forecast", "credit", "capital"],
    },
    {
      id: "accountant",
      label: "Accountant",
      accessibleTabs: ["dashboard", "forecast"],
      visibleTabs:    ["dashboard", "forecast"],
      canExport: true,
      canAddNotes: false,
      namespaces: ["app", "forecast"],
    },
    {
      id: "investor",
      label: "Investor",
      accessibleTabs: ["capital"],
      visibleTabs:    ["capital"],
      canExport: false,
      canAddNotes: false,
      namespaces: ["app", "capital"],
    },
  ],

  bankAccounts:       [],
  transactions:       [],
  alerts:             [],
  forecast:           [],
  scenarios:          [],
  obligations:        [],
  creditApplications: [],
  creditOffers:       [],
  capitalRaises:      [],
  capitalInvestments: [],
};
