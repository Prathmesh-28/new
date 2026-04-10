import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-olive-deepest text-olive-wash">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <Link href="/" className="inline-block mb-4">
              <span className="text-xl font-bold font-serif text-white">
                Head<span style={{ color: "var(--gold)" }}>room</span>
              </span>
            </Link>
            <p className="text-sm text-olive-pale leading-relaxed mb-4">
              Cash flow intelligence for SMBs with honest forecasting, embedded
              credit rescue, and capital readiness when timing matters.
            </p>
            <p className="text-xs text-olive-mid">
              Copyright {new Date().getFullYear()} Headroom
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4 tracking-wide uppercase">
              Product
            </h4>
            <ul className="space-y-3">
              {[
                { label: "Platform overview", href: "/features" },
                { label: "Forecasting", href: "/features" },
                { label: "Pricing", href: "/pricing" },
                { label: "Credit rescue", href: "/credit" },
                { label: "Capital raise", href: "/capital" },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-olive-pale hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4 tracking-wide uppercase">
              Platform
            </h4>
            <ul className="space-y-3">
              {[
                "90-day forecast",
                "Confidence bands",
                "Alert engine",
                "Credit rescue",
                "Repayment simulation",
                "Public capital workflows",
              ].map((item) => (
                <li key={item}>
                  <span className="text-sm text-olive-pale">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4 tracking-wide uppercase">
              Company
            </h4>
            <ul className="space-y-3">
              {[
                { label: "About", href: "#" },
                { label: "Blog", href: "#" },
                { label: "Careers", href: "#" },
                { label: "Privacy Policy", href: "#" },
                { label: "Terms of Service", href: "#" },
                { label: "Contact", href: "#" },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-olive-pale hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-olive-deep flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-olive-mid">
            Built for SMB operators who need clearer cash decisions before they
            need emergency financing.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="#"
              className="text-xs text-olive-mid hover:text-olive-pale transition-colors"
            >
              Twitter / X
            </Link>
            <Link
              href="#"
              className="text-xs text-olive-mid hover:text-olive-pale transition-colors"
            >
              LinkedIn
            </Link>
            <Link
              href="#"
              className="text-xs text-olive-mid hover:text-olive-pale transition-colors"
            >
              Instagram
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
