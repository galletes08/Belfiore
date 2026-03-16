const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const STORAGE_KEYS = {
  adminToken: 'adminToken',
  adminUser: 'adminUser',
  customerToken: 'customerToken',
  customerUser: 'customerUser',
  riderToken: 'riderToken',
  riderUser: 'riderUser',
};

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.adminToken);
}

function getCustomerToken() {
  return localStorage.getItem(STORAGE_KEYS.customerToken);
}

function getRiderToken() {
  return localStorage.getItem(STORAGE_KEYS.riderToken);
}

function getAuthHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getCustomerAuthHeader() {
  const token = getCustomerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getRiderAuthHeader() {
  const token = getRiderToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function apiRegister(payload) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function apiProducts() {
  const res = await fetch(`${API_URL}/api/products`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load products');
  return data;
}

export async function apiCreateProduct(payload) {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${API_URL}/api/products`, {
    method: 'POST',
    headers: isFormData ? getAuthHeader() : { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: isFormData ? payload : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create product');
  return data;
}

export async function apiUpdateProduct(id, payload) {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${API_URL}/api/products/${id}`, {
    method: 'PATCH',
    headers: isFormData ? getAuthHeader() : { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: isFormData ? payload : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update product');
  return data;
}

export async function apiDeleteProduct(id) {
  const res = await fetch(`${API_URL}/api/products/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete');
  }
}

export async function apiDashboard() {
  const res = await fetch(`${API_URL}/api/admin/dashboard`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load dashboard');
  return data;
}

export async function apiAdminOrders() {
  const res = await fetch(`${API_URL}/api/admin/orders`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load orders');
  return data;
}

export async function apiAdminRiders() {
  const res = await fetch(`${API_URL}/api/admin/riders`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load riders');
  return data;
}

export async function apiCreateRider(payload) {
  const res = await fetch(`${API_URL}/api/admin/riders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create rider');
  return data;
}

export async function apiUpdateRider(id, payload) {
  const res = await fetch(`${API_URL}/api/admin/riders/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update rider');
  return data;
}

export async function apiUpdateOrder(id, payload) {
  const res = await fetch(`${API_URL}/api/admin/orders/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update order');
  return data;
}

export async function apiCustomerOrders(ids) {
  const res = await fetch(`${API_URL}/api/orders/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load your orders');
  return data;
}

export async function apiDriverOrder(token) {
  const res = await fetch(`${API_URL}/api/driver/orders/${token}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load driver order');
  return data;
}

export async function apiUpdateDriverOrder(token, payload) {
  const res = await fetch(`${API_URL}/api/driver/orders/${token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update driver order');
  return data;
}

export async function apiRiderOrders() {
  const res = await fetch(`${API_URL}/api/rider/orders`, {
    headers: getRiderAuthHeader(),
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load rider orders');
  return data;
}

export async function apiPlaceOrder(payload) {
  const res = await fetch(`${API_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to place order');
  return data;
}

export function getImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${API_URL}${imageUrl}`;
}

export function setToken(token) {
  localStorage.setItem(STORAGE_KEYS.adminToken, token);
}

export function setCustomerToken(token) {
  localStorage.setItem(STORAGE_KEYS.customerToken, token);
}

export function setRiderToken(token) {
  localStorage.setItem(STORAGE_KEYS.riderToken, token);
}

function setStoredValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value || null));
}

function getStoredValue(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

export function setAdminUser(user) {
  setStoredValue(STORAGE_KEYS.adminUser, user);
}

export function getAdminUser() {
  return getStoredValue(STORAGE_KEYS.adminUser);
}

export function setCustomerUser(user) {
  setStoredValue(STORAGE_KEYS.customerUser, user);
}

export function getCustomerUser() {
  return getStoredValue(STORAGE_KEYS.customerUser);
}

export function setRiderUser(user) {
  setStoredValue(STORAGE_KEYS.riderUser, user);
}

export function getRiderUser() {
  return getStoredValue(STORAGE_KEYS.riderUser);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEYS.adminToken);
  localStorage.removeItem(STORAGE_KEYS.adminUser);
}

export function clearCustomerToken() {
  localStorage.removeItem(STORAGE_KEYS.customerToken);
  localStorage.removeItem(STORAGE_KEYS.customerUser);
}

export function clearRiderToken() {
  localStorage.removeItem(STORAGE_KEYS.riderToken);
  localStorage.removeItem(STORAGE_KEYS.riderUser);
}

export function hasToken() {
  return !!getToken();
}

export function hasCustomerToken() {
  return !!getCustomerToken();
}

export function hasRiderToken() {
  return !!getRiderToken();
}

export function hasCustomerRole(role) {
  return getCustomerUser()?.role === role;
}

export function hasRiderRole(role) {
  return getRiderUser()?.role === role;
}
