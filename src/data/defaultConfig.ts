import type { AppStore } from "./types";

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
      accessibleTabs: ["dashboard", "forecast", "credit", "capital", "operations", "settings", "admin", "advisor"],
      visibleTabs:    ["dashboard", "forecast", "credit", "capital", "operations", "settings", "admin"],
      canExport: true,
      canAddNotes: true,
      namespaces: ["app", "forecast", "credit", "capital", "operations"],
    },
    {
      id: "owner",
      label: "Business Owner",
      accessibleTabs: ["dashboard", "forecast", "credit", "capital", "operations", "settings"],
      visibleTabs:    ["dashboard", "forecast", "credit", "capital", "operations", "settings"],
      canExport: true,
      canAddNotes: true,
      namespaces: ["app", "forecast", "credit", "capital", "operations"],
    },
    {
      id: "accountant",
      label: "Accountant / CA / CFO",
      accessibleTabs: ["dashboard", "forecast", "operations", "advisor"],
      visibleTabs:    ["dashboard", "forecast", "operations", "advisor"],
      canExport: true,
      canAddNotes: false,
      namespaces: ["app", "forecast", "operations"],
    },
    {
      id: "investor",
      label: "Investor",
      accessibleTabs: ["investor"],
      visibleTabs:    ["investor"],
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
  connectors:         [],
  orders:             [],
  inventory:          [],
  procurement:        [],
};
