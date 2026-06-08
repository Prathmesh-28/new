import type { DataProvider } from "react-admin";
import { useAppStore } from "./store";

const BASE = () =>
  (process.env.NEXT_PUBLIC_DJANGO_API_URL ?? "http://localhost:8000") + "/admin-api";

function headers(): Record<string, string> {
  const token = useAppStore.getState().token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: headers() });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  if (res.status === 204) return {} as T;
  return res.json();
}

export const adminDataProvider: DataProvider = {
  getList: async (resource, { pagination, sort, filter }) => {
    const { page, perPage } = pagination;
    const ordering = sort.order === "ASC" ? sort.field : `-${sort.field}`;
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(perPage),
      ordering,
      ...Object.fromEntries(Object.entries(filter ?? {}).map(([k, v]) => [k, String(v)])),
    });
    const data = await req<{ count: number; results: any[] }>(
      `${BASE()}/${resource}/?${params}`
    );
    return { data: data.results, total: data.count };
  },

  getOne: async (resource, { id }) => {
    const data = await req<any>(`${BASE()}/${resource}/${id}/`);
    return { data };
  },

  getMany: async (resource, { ids }) => {
    const data = await Promise.all(ids.map((id) => req<any>(`${BASE()}/${resource}/${id}/`)));
    return { data };
  },

  getManyReference: async (resource, { target, id, pagination, sort }) => {
    const { page, perPage } = pagination;
    const ordering = sort.order === "ASC" ? sort.field : `-${sort.field}`;
    const params = new URLSearchParams({ [target]: String(id), page: String(page), page_size: String(perPage), ordering });
    const data = await req<{ count: number; results: any[] }>(`${BASE()}/${resource}/?${params}`);
    return { data: data.results, total: data.count };
  },

  create: async (resource, { data }) => {
    const result = await req<any>(`${BASE()}/${resource}/`, { method: "POST", body: JSON.stringify(data) });
    return { data: result };
  },

  update: async (resource, { id, data }) => {
    const result = await req<any>(`${BASE()}/${resource}/${id}/`, { method: "PUT", body: JSON.stringify(data) });
    return { data: result };
  },

  updateMany: async (resource, { ids, data }) => {
    await Promise.all(ids.map((id) => req(`${BASE()}/${resource}/${id}/`, { method: "PATCH", body: JSON.stringify(data) })));
    return { data: ids };
  },

  delete: async (resource, { id, previousData }) => {
    await req(`${BASE()}/${resource}/${id}/`, { method: "DELETE" });
    return { data: previousData as any };
  },

  deleteMany: async (resource, { ids }) => {
    await Promise.all(ids.map((id) => req(`${BASE()}/${resource}/${id}/`, { method: "DELETE" })));
    return { data: ids };
  },
};
