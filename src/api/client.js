import { getSupabaseConfig, isSupabaseConfigured } from "../lib/supabase";

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

function getRiderAuthHeader() {
  const token = getRiderToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeProductRow(row) {
  return {
    id: row.id,
    category: row.category || '',
    name: row.name,
    tag: row.tag || '',
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    description: row.description || '',
    imageUrl: row.image_url || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function fetchSupabaseProducts() {
  if (!isSupabaseConfigured()) return null;

  const { url, anonKey } = getSupabaseConfig();
  const endpoint = new URL('/rest/v1/products', url);
  endpoint.searchParams.set('select', 'id,category,name,tag,stock,price,description,image_url,created_at,updated_at');
  endpoint.searchParams.set('order', 'id.desc');

  const res = await fetch(endpoint.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json().catch(() => ([]));
  if (!res.ok) {
    const message = Array.isArray(data) ? 'Failed to load products' : (data.message || data.error || 'Failed to load products');
    throw new Error(message);
  }

  return Array.isArray(data) ? data.map(normalizeProductRow) : [];
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
  try {
    const supabaseProducts = await fetchSupabaseProducts();
    if (supabaseProducts) {
      return supabaseProducts;
    }
  } catch (error) {
    console.warn('Supabase products lookup failed, falling back to API:', error);
  }

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

export async function apiAdminCustomers() {
  const res = await fetch(`${API_URL}/api/admin/customers`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load customers');
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

export async function apiSyncOrderTrack123(id) {
  const res = await fetch(`${API_URL}/api/admin/orders/${id}/track123/sync`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to sync Track123 tracking');
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

export async function apiLocationCountries() {
  const res = await fetch(`${API_URL}/api/location/countries`);
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load countries');
  return data;
}

export async function apiLocationProvinces(countryCode) {
  const res = await fetch(`${API_URL}/api/location/${encodeURIComponent(countryCode)}/provinces`);
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load provinces');
  return data;
}

export async function apiLocationCities(countryCode, provinceCode = '') {
  const endpoint = new URL(`${API_URL}/api/location/${encodeURIComponent(countryCode)}/cities`);
  if (provinceCode) {
    endpoint.searchParams.set('provinceCode', provinceCode);
  }

  const res = await fetch(endpoint.toString());
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load cities');
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

export async function apiRiderProfile() {
  const res = await fetch(`${API_URL}/api/rider/profile`, {
    headers: getRiderAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load rider profile');
  return data;
}

export async function apiUpdateRiderProfile(payload) {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${API_URL}/api/rider/profile`, {
    method: 'PATCH',
    headers: isFormData ? getRiderAuthHeader() : { 'Content-Type': 'application/json', ...getRiderAuthHeader() },
    body: isFormData ? payload : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update rider profile');
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

export async function apiLogisticsUpdates(id) {
  const res = await fetch(`${API_URL}/api/orders/${id}/logistics-updates`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load logistics updates');
  return data;
}

export function getImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  const normalizedBase = String(API_URL || '').replace(/\/$/, '');
  const normalizedPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${normalizedBase}${normalizedPath}`;
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
