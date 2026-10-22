import type {
  AdminCategory,
  AdminSnapshot,
  AvailabilitySlot,
  CreateOrderInput,
  MenuProduct,
  PublicMenu,
  PublicSettings,
  OrderRecord,
} from "@/lib/types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!response.ok)
    throw new Error(
      payload.error || payload.message || `Request failed (${response.status}).`
    );
  return payload as T;
}

export function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString("en-NG")}`;
  }
}

export function getMenu() {
  return request<PublicMenu>("/api/menu");
}
export function getAvailability() {
  return request<AvailabilitySlot[]>("/api/availability");
}
export function createOrder(input: CreateOrderInput) {
  return request<{
    orderId: string;
    orderReference: string;
    whatsappUrl: string;
  }>("/api/orders", { method: "POST", body: JSON.stringify(input) });
}
export function getAdminSession() {
  return request<{ authenticated: boolean }>("/api/auth/me");
}
export function login(email: string, password: string) {
  return request<{ authenticated: true }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}
export function logout() {
  return request<{ success: true }>("/api/auth/logout", {
    method: "POST",
    body: "{}",
  });
}
export function getAdminData() {
  return request<AdminSnapshot>("/api/admin/dashboard");
}
export function createCategory(name: string) {
  return request<{ category: AdminCategory }>("/api/admin/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
export function updateCategory(id: string, name: string, isEnabled: boolean) {
  return request<{ category: AdminCategory }>(
    `/api/admin/categories/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ name, isEnabled }) }
  );
}
export function createProduct(product: MenuProduct) {
  return request<{ product: MenuProduct }>("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(product),
  });
}
export function updateProduct(id: string, product: MenuProduct) {
  return request<{ product: MenuProduct }>(
    `/api/admin/products/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(product) }
  );
}
export function updateSettings(settings: PublicSettings) {
  return request<{ settings: PublicSettings }>("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
export function addSlot(input: {
  serviceDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  fulfillment: string;
}) {
  return request<{ slot: AvailabilitySlot }>("/api/admin/availability", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function updateSlot(id: string, isOpen: boolean) {
  return request<{ slot: AvailabilitySlot }>(
    `/api/admin/availability/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ isOpen }) }
  );
}
export function updateOrder(id: string, status: string) {
  return request<{ order: OrderRecord }>(
    `/api/admin/orders/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  );
}
