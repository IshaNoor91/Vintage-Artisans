const API_BASE = "https://vintage-artisans-production.up.railway.app/api";

function getToken() {
  return localStorage.getItem("adminToken");
}

async function request(path, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401) {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUsername");
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!response.ok || !data || data.success === false) {
    throw new Error((data && data.message) || `Request failed (${response.status})`);
  }

  return data;
}

export const api = {
  login: (username, password) =>
    request("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    }),

  getStats: () => request("/admin/stats"),

  getProducts: () => request("/admin/products"),
  getProduct: (id) => request(`/admin/products/${id}`),
  createProduct: (payload) =>
    request("/admin/products", { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (id, payload) =>
    request(`/admin/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProduct: (id) =>
    request(`/admin/products/${id}`, { method: "DELETE" }),

  getCategories: () => request("/categories"),
  createCategory: (payload) =>
    request("/admin/categories", { method: "POST", body: JSON.stringify(payload) }),
  updateCategory: (id, payload) =>
    request(`/admin/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCategory: (id) =>
    request(`/admin/categories/${id}`, { method: "DELETE" }),

  getOrders: () => request("/admin/orders"),
  getOrder: (id) => request(`/admin/orders/${id}`),
  updateOrderStatus: (id, status) =>
    request(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    })
};