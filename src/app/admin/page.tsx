import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const authed = await getAdminSession();
  if (!authed) redirect("/admin/login");

  return <AdminDashboard />;
}
