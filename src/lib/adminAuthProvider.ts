import type { AuthProvider } from "react-admin";
import { useAppStore } from "./store";

export const adminAuthProvider: AuthProvider = {
  login: () => Promise.resolve(),

  logout: () => {
    useAppStore.getState().clearAuth();
    return Promise.resolve("/admin/login");
  },

  checkAuth: () => {
    const { token, user } = useAppStore.getState();
    if (token && (user?.role === "admin" || (user as any)?.is_staff)) {
      return Promise.resolve();
    }
    return Promise.reject({ redirectTo: "/admin/login" });
  },

  checkError: ({ status }: { status: number }) => {
    if (status === 401 || status === 403) return Promise.reject({ redirectTo: "/admin/login" });
    return Promise.resolve();
  },

  getIdentity: () => {
    const user = useAppStore.getState().user;
    return Promise.resolve({ id: user?.id ?? "", fullName: user?.email ?? "Admin" });
  },

  getPermissions: () => {
    const user = useAppStore.getState().user;
    return Promise.resolve(user?.role ?? "viewer");
  },
};
