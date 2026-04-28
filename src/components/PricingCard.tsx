"use client";

import { useState } from "react";

interface PricingCardProps {
  plan: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  href?: string;
  featured?: boolean;
  badge?: string;
}

export default function PricingCard({
  plan,
  price,
  period = "/mo",
  description,
  features,
  cta,
  featured = false,
  badge,
}: PricingCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    const planKey = plan.toLowerCase();
    if (!["starter", "growth", "pro"].includes(planKey)) {
      window.location.href = "/dashboard";
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  }
  return (
    <div
      className="relative rounded-2xl p-8 flex flex-col"
      style={
        featured
          ? {
              backgroundColor: "var(--olive-deepest)",
              border: "2px solid var(--gold)",
              boxShadow: "0 8px 40px rgba(201,162,39,0.18)",
            }
          : {
              backgroundColor: "var(--white)",
              border: "1px solid var(--olive-wash)",
            }
      }
    >
      {badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span
            className="px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
            style={{
              backgroundColor: "var(--gold)",
              color: "var(--olive-deepest)",
            }}
          >
            {badge}
          </span>
        </div>
      )}

      <p
        className="text-sm font-semibold uppercase tracking-widest mb-4"
        style={{ color: featured ? "var(--olive-pale)" : "var(--olive-bright)" }}
      >
        {plan}
      </p>

      <div className="flex items-baseline gap-1 mb-3">
        <span
          className="text-4xl font-bold font-serif"
          style={{ color: featured ? "var(--gold-light)" : "var(--text-dark)" }}
        >
          {price}
        </span>
        {price !== "Free" && (
          <span
            className="text-sm"
            style={{ color: featured ? "var(--olive-pale)" : "var(--text-muted)" }}
          >
            {period}
          </span>
        )}
      </div>

      <p
        className="text-sm leading-relaxed mb-8"
        style={{ color: featured ? "var(--olive-pale)" : "var(--text-muted)" }}
      >
        {description}
      </p>

      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full block text-center py-3.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90 mb-8 disabled:opacity-60 cursor-pointer"
        style={
          featured
            ? {
                backgroundColor: "var(--gold)",
                color: "var(--olive-deepest)",
              }
            : {
                backgroundColor: "transparent",
                border: "1.5px solid var(--olive-mid)",
                color: "var(--text-mid)",
              }
        }
      >
        {loading ? "Loading…" : cta}
      </button>

      <ul className="space-y-3 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <svg
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              style={{
                color: featured ? "var(--olive-light)" : "var(--olive-bright)",
              }}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span
              className="text-sm"
              style={{ color: featured ? "var(--olive-pale)" : "var(--text-muted)" }}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
