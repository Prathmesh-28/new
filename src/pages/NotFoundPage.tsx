import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center">
      <p className="text-7xl font-black text-[var(--color-primary)] mb-2">404</p>
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-sm text-[var(--color-muted)] mb-8 max-w-xs">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/dashboard"
        className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
