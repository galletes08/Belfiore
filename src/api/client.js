const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getToken() {
  return localStorage.getItem('adminToken');
}

function getAuthHeader() {
  const token = getToken();
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
  localStorage.setItem('adminToken', token);
}

export function clearToken() {
  localStorage.removeItem('adminToken');
}

export function hasToken() {
  return !!getToken();
}
