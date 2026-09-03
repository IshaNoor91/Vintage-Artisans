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
    }),

  getShipStationCarriers: () => request("/admin/shipstation/carriers"),
  getShipStationServices: (carrierCode) =>
    request(`/admin/shipstation/carriers/${encodeURIComponent(carrierCode)}/services`),
  getShipStationPackages: (carrierCode) =>
    request(`/admin/shipstation/carriers/${encodeURIComponent(carrierCode)}/packages`),
  purchaseShippingLabel: (orderId, payload) =>
    request(`/admin/orders/${orderId}/purchase-label`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  // countryCode: 2-letter ISO code (e.g. "GB"). Pass regularPrice: null to
  // clear an override — the product then falls back to live currency
  // conversion for that country again.
  updateProductPriceOverride: (productId, payload) =>
    request(`/admin/products/${productId}/price-overrides`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),

  getFeatureFlags: () => request("/admin/feature-flags"),
  updateFeatureFlag: (key, enabled) =>
    request(`/admin/feature-flags/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ enabled })
    }),

  getStores: () => request("/admin/stores"),

  // Team (Super Admin only — the backend also enforces this).
  getUsers: () => request("/admin/users"),
  createUser: (payload) =>
    request("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) =>
    request(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteUser: (id) =>
    request(`/admin/users/${id}`, { method: "DELETE" })
};