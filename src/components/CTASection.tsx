"use client";

import { useState } from "react";

export default function CTASection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
    }
  }

  return (
    <section
      id="trial"
      className="py-20 relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at center, #2E3A10 0%, #1C2209 70%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(201,162,39,0.25), transparent)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-4"
          style={{ color: "var(--gold)" }}
        >
          Free for your first 90 days
        </p>
        <h2
          className="text-3xl sm:text-4xl font-bold font-serif mb-5 text-white"
        >
          Get your first Headroom forecast
        </h2>
        <p
          className="text-lg mb-10 max-w-xl mx-auto"
          style={{ color: "var(--olive-pale)" }}
        >
          Connect your accounts, get your first 90-day forecast, and find out
          your runway in under 5 minutes. No credit card required.
        </p>

        {submitted ? (
          <div
            className="inline-flex items-center gap-3 px-6 py-4 rounded-xl"
            style={{
              backgroundColor: "rgba(150,184,61,0.2)",
              border: "1px solid rgba(150,184,61,0.4)",
            }}
          >
            <svg
              className="w-5 h-5"
              style={{ color: "var(--olive-light)" }}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-olive-light font-medium">
              You&apos;re on the list. We&apos;ll be in touch shortly.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 px-4 py-3.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gold"
              style={{
                backgroundColor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "var(--white)",
              }}
            />
            <button
              type="submit"
              className="px-6 py-3.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90 whitespace-nowrap"
              style={{
                backgroundColor: "var(--gold)",
                color: "var(--olive-deepest)",
              }}
            >
              Get my forecast
            </button>
          </form>
        )}

        <p className="mt-5 text-xs" style={{ color: "var(--olive-mid)" }}>
          No credit card | Cancel any time | Connect only the accounts you choose
        </p>
      </div>
    </section>
  );
}
