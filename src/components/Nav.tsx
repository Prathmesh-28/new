"use client";

import Link from "next/link";
import { useState } from "react";

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-olive-deepest border-b border-olive-deep">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <span
              className="text-xl font-bold font-serif text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              Head<span style={{ color: "var(--gold)" }}>room</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/features"
              className="text-sm text-olive-wash hover:text-white transition-colors"
            >
              Platform
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-olive-wash hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/credit"
              className="text-sm text-olive-wash hover:text-white transition-colors"
            >
              Credit rescue
            </Link>
            <Link
              href="/capital"
              className="text-sm text-olive-wash hover:text-white transition-colors"
            >
              Capital raise
            </Link>
            <Link
              href="#"
              className="text-sm text-olive-wash hover:text-white transition-colors"
            >
              For advisors
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              href="#"
              className="text-sm text-olive-wash hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/#trial"
              className="px-4 py-2 rounded-md text-sm font-semibold text-olive-deepest transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--gold)" }}
            >
              Start free trial
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-olive-wash hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-olive-deep border-t border-olive-mid px-4 py-4 flex flex-col gap-4">
          <Link
            href="/features"
            className="text-sm text-olive-wash hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            Platform
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-olive-wash hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            Pricing
          </Link>
          <Link
            href="/credit"
            className="text-sm text-olive-wash hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            Credit rescue
          </Link>
          <Link
            href="/capital"
            className="text-sm text-olive-wash hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            Capital raise
          </Link>
          <Link
            href="#"
            className="text-sm text-olive-wash hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            For advisors
          </Link>
          <Link
            href="/#trial"
            className="px-4 py-2 rounded-md text-sm font-semibold text-olive-deepest text-center"
            style={{ backgroundColor: "var(--gold)" }}
            onClick={() => setMobileOpen(false)}
          >
            Start free trial
          </Link>
        </div>
      )}
    </nav>
  );
}
