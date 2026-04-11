"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--olive-deepest)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{
          backgroundColor: "var(--olive-deep)",
          border: "1px solid var(--olive-mid)",
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <span
            className="text-2xl font-bold font-serif text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Head<span style={{ color: "var(--gold)" }}>room</span>
          </span>
          <p className="text-sm mt-2" style={{ color: "var(--olive-wash)" }}>
            Admin Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
              style={{ color: "var(--olive-pale)" }}
            >
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
              style={{
                backgroundColor: "var(--olive-deepest)",
                border: "1px solid var(--olive-mid)",
                color: "var(--white)",
              }}
              placeholder="admin"
            />
          </div>

          <div>
            <label
              className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
              style={{ color: "var(--olive-pale)" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
              style={{
                backgroundColor: "var(--olive-deepest)",
                border: "1px solid var(--olive-mid)",
                color: "var(--white)",
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p
              className="text-xs rounded-lg px-3 py-2.5"
              style={{
                backgroundColor: "rgba(180,40,40,0.15)",
                border: "1px solid rgba(180,40,40,0.4)",
                color: "#f87171",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: "var(--gold)",
              color: "var(--olive-deepest)",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
