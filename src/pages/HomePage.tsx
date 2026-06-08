import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] text-center px-4">
      <h1 className="text-5xl font-bold mb-4">Head<span className="text-[var(--color-primary)]">room</span></h1>
      <p className="text-lg text-[var(--color-muted)] max-w-md mb-8">
        SMB cash flow forecasting, embedded credit, and capital raising — in one platform.
      </p>
      <button onClick={() => navigate("/login")}
        className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity">
        Get started →
      </button>
    </div>
  );
}
