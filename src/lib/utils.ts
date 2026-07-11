import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function formatCurrency(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// Compact Indian format: ₹12.5L, ₹1.2Cr - use for stat cards, chart tooltips
export function formatAmount(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs  = Math.abs(n);
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function runwayDays(balances: number[], monthlyBurn: number): number {
  if (monthlyBurn <= 0) return 999;
  const dailyBurn = monthlyBurn / 30;
  const total = balances.reduce((a, b) => a + b, 0);
  return Math.max(0, Math.floor(total / dailyBurn));
}

export function monthlyBurn(transactions: { amount: number; date: string; category?: string }[]): number {
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const expenses = transactions.filter(t => t.amount < 0 && t.date >= last30 && t.category !== "transfer");
  return Math.abs(expenses.reduce((a, t) => a + t.amount, 0));
}

