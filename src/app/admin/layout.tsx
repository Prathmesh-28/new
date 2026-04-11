import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Headroom",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // No Nav / Footer — admin has its own chrome
  return <>{children}</>;
}
