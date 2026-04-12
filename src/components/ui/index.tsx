/**
 * Shared UI primitives — Card, Badge, Button, Spinner, EmptyState.
 * All styled to Headroom's dark-green palette.
 */

"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx("rounded-xl p-5", className)}
      style={{ backgroundColor: "#1c2209", border: "1px solid #2e3a10" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeVariant = "green" | "gold" | "red" | "neutral";

const BADGE_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  green:   { bg: "rgba(107,133,38,0.2)",  color: "#96b83d" },
  gold:    { bg: "rgba(201,162,39,0.2)",  color: "#c9a227" },
  red:     { bg: "rgba(127,29,29,0.3)",   color: "#fca5a5" },
  neutral: { bg: "rgba(46,58,16,0.5)",    color: "#6b8526" },
};

export function Badge({
  children,
  variant = "green",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  const { bg, color } = BADGE_STYLES[variant];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

export function severityVariant(severity: string): BadgeVariant {
  if (severity === "critical") return "red";
  if (severity === "warning")  return "gold";
  return "green";
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BTN_STYLES: Record<ButtonVariant, string> = {
  primary:   "bg-[#4a5e1a] text-[#c4d97a] hover:bg-[#5a7020]",
  secondary: "bg-[#2e3a10] text-[#96b83d] hover:bg-[#3a4a14]",
  danger:    "bg-[#4a1a1a] text-[#fca5a5] hover:bg-[#5a2020]",
  ghost:     "bg-transparent text-[#96b83d] hover:bg-[#2e3a10]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        "rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BTN_STYLES[variant],
        className
      )}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 16} /> : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "inline-block" }}
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.3"
      />
      <path
        d="M12 2 a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <p className="text-sm text-center" style={{ color: "#6b8526" }}>
        {message}
      </p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-white">{title}</h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: "#6b8526" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: BadgeVariant;
}) {
  const valueColor =
    variant === "red"
      ? "#fca5a5"
      : variant === "gold"
      ? "#c9a227"
      : "white";

  return (
    <Card>
      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "#6b8526" }}
      >
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: valueColor }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: "#6b8526" }}>
          {sub}
        </p>
      )}
    </Card>
  );
}
