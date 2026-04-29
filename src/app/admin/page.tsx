"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, selectUser } from "@/lib/store";
import AdminDashboard from "./AdminDashboard";
import { Spinner } from "@/components/ui";

export default function AdminPage() {
  const router = useRouter();
  const user   = useAppStore(selectUser);

  useEffect(() => {
    if (user === null) router.push("/admin/login/");
  }, [user, router]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0f1505" }}>
        <Spinner size={32} />
      </div>
    );
  }

  return <AdminDashboard />;
}
