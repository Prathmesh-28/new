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

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000)   return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000)     return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

export function runwayDays(balances: number[], monthlyBurn: number): number {
  if (monthlyBurn <= 0) return 999;
  const dailyBurn = monthlyBurn / 30;
  const total = balances.reduce((a, b) => a + b, 0);
  return Math.max(0, Math.floor(total / dailyBurn));
}

export function monthlyBurn(transactions: { amount: number; date: string }[]): number {
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const expenses = transactions.filter(t => t.amount < 0 && t.date >= last30);
  return Math.abs(expenses.reduce((a, t) => a + t.amount, 0));
}

export function underwriteScore(inputs: {
  monthlyRevenue: number;
  monthlyBurn: number;
  runwayDays: number;
  businessAgeMonths: number;
}): { score: number; approved: number; recommendation: string } {
  const { monthlyRevenue, monthlyBurn, runwayDays: rd, businessAgeMonths } = inputs;
  let score = 50;
  if (monthlyRevenue > monthlyBurn * 1.5) score += 15;
  else if (monthlyRevenue > monthlyBurn)   score += 8;
  if (rd > 90) score += 10;
  else if (rd > 60) score += 5;
  else if (rd < 30) score -= 15;
  if (businessAgeMonths > 24) score += 10;
  else if (businessAgeMonths > 12) score += 5;
  score = Math.min(100, Math.max(0, score));
  const approved = score >= 70 ? monthlyRevenue * 6 : score >= 50 ? monthlyRevenue * 3 : 0;
  const recommendation = score >= 70 ? "term_loan" : score >= 50 ? "revenue_advance" : "none";
  return { score, approved, recommendation };
}
