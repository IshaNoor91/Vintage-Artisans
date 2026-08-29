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

// Separate from request() above: this sends multipart/form-data, not JSON,
// so it must NOT set a Content-Type header itself — the browser sets the
// multipart boundary automatically when given a FormData body.
async function uploadImages(files) {
  const token = getToken();

  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file);
  }

  const response = await fetch(`${API_BASE}/admin/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
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
    throw new Error((data && data.message) || `Upload failed (${response.status})`);
  }

  return data; // { success: true, urls: [...] }
}

export const api = {
  login: (username, password) =>
    request("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    }),

  uploadImages,

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
    }),
  sendOrderToShipStation: (id) =>
    request(`/admin/orders/${id}/send-to-shipstation`, { method: "POST" }),

  getShippingCountries: () => request("/admin/shipping-countries"),
  updateShippingCountries: (enabledIds) =>
    request("/admin/shipping-countries", {
      method: "PUT",
      body: JSON.stringify({ enabledIds })
    })
};