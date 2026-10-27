import {notifyOperationsChanged} from '../utils/operationsSync';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const STORAGE_KEYS = {
  adminToken: 'adminToken',
  adminUser: 'adminUser',
  customerToken: 'customerToken',
  customerUser: 'customerUser',
  riderToken: 'riderToken',
  riderUser: 'riderUser',
};
const CUSTOMER_SESSION_EVENT = 'belfiore-customer-session-changed';
export async function apiStaffManagement(path='',body,method=body?'POST':'GET') {
 const res=await fetch(`${API_URL}/api/admin/staff${path}`,{method,headers:{...getAuthHeader(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Unable to manage staff');return data;
}

function notifyCustomerSessionChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CUSTOMER_SESSION_EVENT));
  }
}

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.adminToken);
}

function getCustomerToken() {
  const token=localStorage.getItem(STORAGE_KEYS.customerToken);
  if(!token)return null;
  try {
    const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if(payload.role==='customer'&&Number(payload.exp)*1000>Date.now())return token;
  }catch { /* Discard malformed or incompatible legacy sessions. */ }
  clearCustomerToken();
  return null;
}

function getRiderToken() {
  return localStorage.getItem(STORAGE_KEYS.riderToken);
}

function getAuthHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiAdminReport(filters, signal) {
  const res=await fetch(`${API_URL}/api/admin/reports?${new URLSearchParams(filters)}`,{headers:getAuthHeader(),signal});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Unable to load reports');
  return data;
}
export async function apiExportReport(filters,format) {
  const res=await fetch(`${API_URL}/api/admin/reports/export?${new URLSearchParams({...filters,format})}`,{headers:getAuthHeader()});
  if(!res.ok) {const data=await res.json().catch(()=>({}));throw new Error(data.error||'Unable to export report');}
  const url=URL.createObjectURL(await res.blob());
  const link=document.createElement('a');link.href=url;
  link.download=res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||`Belfiore-report.${format}`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function getCustomerAuthHeader() {
  const token = getCustomerToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}
function getRiderAuthHeader() {
  const token = getRiderToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiLogin(email, password, workspace,loginContext) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workspace==='staff'?{identifier:email,password,workspace,loginContext}:{email,password}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  const roles=workspace==='staff'?['admin','rider','staff']:['customer'];
  if(!data.token||!roles.includes(data.user?.role)) {
    if(workspace!=='staff')clearCustomerToken();
    throw new Error('Invalid email or password.');
  }
  return data;
}

export async function apiPasswordRecovery(path,body) {
  const res=await fetch(`${API_URL}/api/auth/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||'Unable to process this request. Please try again.');
  return data;
}

export async function apiResetRiderPassword(id,body) {
  const res=await fetch(`${API_URL}/api/admin/riders/${id}/reset-password`,{method:'POST',headers:{...getAuthHeader(),'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Unable to reset rider credentials');return data;
}
export async function apiChangeRiderPassword(currentPassword,newPassword) {
  const res=await fetch(`${API_URL}/api/auth/password`,{method:'PATCH',headers:{...getRiderAuthHeader(),'Content-Type':'application/json'},body:JSON.stringify({currentPassword,newPassword})});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Unable to change password');return data;
}

export async function apiRegister(payload) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {const error=new Error(data.error || 'Registration failed');error.fields=data.errors;throw error;}
  return data;
}

export async function apiVerifyEmail(token) {
  const res = await fetch(`${API_URL}/api/auth/verify-email`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Email verification failed');
  return data;
}

export async function apiSendContactMessage(payload) {
  const res = await fetch(`${API_URL}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to send your message');
  return data;
}

export async function apiChangePassword(currentPassword, newPassword) {
  const token = getCustomerToken();
  if (!token) throw new Error('Please sign in again before changing your password');

  const res = await fetch(API_URL + '/api/auth/password', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to update password');
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

export async function apiCreateProduct(payload, options = {}) {
  if (payload instanceof FormData && options.onProgress) return uploadProduct('/api/products', payload, options);
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${API_URL}/api/products`, {
    method: 'POST',
    headers: isFormData ? { ...getAuthHeader(), ...(options.requestKey ? { 'Idempotency-Key': options.requestKey } : {}) } : { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: isFormData ? payload : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create product');
  notifyOperationsChanged();
  return data;
}

function uploadProduct(path, payload, { requestKey, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL + path);
    Object.entries(getAuthHeader()).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    if (requestKey) xhr.setRequestHeader('Idempotency-Key', requestKey);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); }
      catch { return reject(new Error('Could not confirm the upload result. Retry this unchanged submission to safely retrieve the result.')); }
      if (xhr.status >= 200 && xhr.status < 300) {notifyOperationsChanged();resolve(data);}
      else reject(Object.assign(new Error(data.error || 'Upload failed. No products were created.'), { confirmedFailure: [400, 409, 502].includes(xhr.status) }));
    };
    xhr.onerror = () => reject(new Error('Connection interrupted; the result could not be confirmed. Retry this unchanged submission to avoid duplicate products.'));
    xhr.onabort = () => reject(new Error('Upload interrupted. Retry this unchanged submission to confirm the result safely.'));
    xhr.send(payload);
  });
}

export async function apiCreateProductsBulk(payload, options = {}) {
  if (options.onProgress) return uploadProduct('/api/products/bulk', payload, options);
  const res = await fetch(`${API_URL}/api/products/bulk`, {
    method: 'POST',
    headers: { ...getAuthHeader(), ...(options.requestKey ? { 'Idempotency-Key': options.requestKey } : {}) },
    body: payload,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create products');
  notifyOperationsChanged();
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
  notifyOperationsChanged();
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

export async function apiDashboard(filters = {}, signal) {
  const res = await fetch(`${API_URL}/api/admin/dashboard?${new URLSearchParams(filters)}`, {
    headers: getAuthHeader(),
    signal,
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

export async function apiDeliveryHistory(id,page=1) {
  const res=await fetch(`${API_URL}/api/admin/orders/${encodeURIComponent(id)}/delivery-history?page=${page}`,{headers:getAuthHeader()});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load delivery history');return data;
}

export async function apiNotifications({page=1,limit=10}={}) {
  const res=await fetch(`${API_URL}/api/admin/notifications?page=${page}&limit=${limit}`,{headers:getAuthHeader()});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load notifications');return data;
}
export async function apiNotificationCount() {
  const res=await fetch(`${API_URL}/api/admin/notifications/unread-count`,{headers:getAuthHeader()});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load notifications');return data;
}
export async function apiReadNotification(id) {
  const res=await fetch(`${API_URL}/api/admin/notifications/${encodeURIComponent(id)}/read`,{method:'POST',headers:getAuthHeader()});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to mark notification read');return data;
}
export async function apiReadAllNotifications(throughId) {
  const res=await fetch(`${API_URL}/api/admin/notifications/read-all`,{method:'POST',headers:{...getAuthHeader(),'Content-Type':'application/json'},body:JSON.stringify({throughId})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to mark notifications read');return data;
}

export async function apiAdminLogs(limit = 250) {
  const res = await fetch(`${API_URL}/api/admin/logs?limit=${encodeURIComponent(limit)}`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load system logs');
  return data;
}

export async function apiDeleteSoldProduct(orderId, itemId) {
  const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/items/${itemId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to remove sold product');
  }
}

export async function apiAdminRiders() {
  const res = await fetch(`${API_URL}/api/admin/riders`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load riders');
  return data;
}

export async function apiRiderManagement(path='manage',params={},method='GET',body) {
  const res=await fetch(`${API_URL}/api/admin/riders/${path}?${new URLSearchParams(params)}`,{method,
    headers:{...getAuthHeader(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load or update rider data');return data;
}

export async function apiAdminCustomers() {
  const res = await fetch(`${API_URL}/api/admin/customers`, {
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load customers');
  return data;
}

export async function apiCustomerManagement(path='manage',params={}) {
  const res=await fetch(`${API_URL}/api/admin/customers/${path}?${new URLSearchParams(params)}`,{headers:getAuthHeader()});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load customer data');return data;
}

export function customerAccountStorageKey(name){return `${name}:${getCustomerUser()?.id||'signed-out'}`;}
export function cacheCustomerAccount(data){
  if(data.profile)localStorage.setItem(customerAccountStorageKey('customerProfile'),JSON.stringify(data.profile));
  if(data.addresses)localStorage.setItem(customerAccountStorageKey('customerAddresses'),JSON.stringify(data.addresses));
}
export async function apiCustomerAccount(path='',method='GET',body){
  const res=await fetch(`${API_URL}/api/customer/account${path?'/'+path:''}`,{method,headers:{...getCustomerAuthHeader(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load or save account data');return data;
}

export async function apiUpdateCustomerStatus(id, status, confirmation = {}) {
  const res = await fetch(`${API_URL}/api/admin/customers/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ status, ...confirmation }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update customer status');
  return data;
}

export async function apiCreateRider(payload) {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${API_URL}/api/admin/riders`, {
    method: 'POST',
    headers: isFormData ? getAuthHeader() : { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: isFormData ? payload : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create rider');
  return data;
}

export async function apiUpdateRider(id, payload) {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${API_URL}/api/admin/riders/${id}`, {
    method: 'PATCH',
    headers: isFormData ? getAuthHeader() : { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: isFormData ? payload : JSON.stringify(payload),
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
  notifyOperationsChanged();
  return data;
}

export async function apiConfirmOrder(id) {
  const res = await fetch(`${API_URL}/api/admin/orders/${id}/confirm`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to confirm order');
  notifyOperationsChanged();
  return data;
}

export async function apiConfirmCodRemittance(id) {
  const res = await fetch(`${API_URL}/api/admin/orders/${id}/confirm-cod-remittance`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to confirm COD payment received');
  return data;
}


export async function apiVerifyOnlinePayment(id) {
  const res = await fetch(API_URL + '/api/orders/' + id + '/payment/verify', {
    method: 'POST',
    headers: getCustomerAuthHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to verify online payment');
  return data;
}
export async function apiCustomerOrders(ids) {
  const res = await fetch(`${API_URL}/api/orders/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getCustomerAuthHeader() },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load your orders');
  return data;
}

export async function apiCancelCustomerOrder(id, reason) {
  const res = await fetch(`${API_URL}/api/orders/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getCustomerAuthHeader() },
    body: JSON.stringify({ reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to cancel order');
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

export async function apiLocationBarangays(countryCode, province, city) {
  const endpoint = new URL(`${API_URL}/api/location/${encodeURIComponent(countryCode)}/barangays`);
  endpoint.searchParams.set('province', province);
  endpoint.searchParams.set('city', city);

  const res = await fetch(endpoint.toString());
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load barangays');
  return data;
}

export async function apiLocationPostalCode(countryCode, province, city) {
  const endpoint = new URL(`${API_URL}/api/location/${encodeURIComponent(countryCode)}/postal-code`);
  endpoint.searchParams.set('province', province);
  endpoint.searchParams.set('city', city);

  const res = await fetch(endpoint.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load postal code');
  return data;
}

export async function apiDriverOrder(token) {
  const res = await fetch(`${API_URL}/api/driver/orders/${token}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load driver order');
  return data;
}

export async function apiUpdateDriverOrder(token, payload) {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${API_URL}/api/driver/orders/${token}`, {
    method: 'PATCH',
    headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
    body: isFormData ? payload : JSON.stringify(payload),
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

export async function apiRiderLocation(payload) {
  const res = await fetch(`${API_URL}/api/riders/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getRiderAuthHeader() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to share rider location');
  return data;
}

export async function apiCustomerRiderLocation(riderId, orderId) {
  const endpoint = new URL(`${API_URL}/api/riders/${encodeURIComponent(riderId)}/location`);
  if (orderId != null) endpoint.searchParams.set('orderId', orderId);
  const res = await fetch(endpoint.toString(), { headers: getCustomerAuthHeader() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Failed to load rider location');
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
    headers: { 'Content-Type': 'application/json', ...getCustomerAuthHeader() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to place order');
  return data;
}

export async function apiLogisticsUpdates(id) {
  const res = await fetch(`${API_URL}/api/orders/${id}/logistics-updates`,{headers:getCustomerAuthHeader()});
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
  if(!getCustomerToken())throw new Error('Please sign in with a customer account.');
  notifyCustomerSessionChanged();
}

export function setRiderToken(token) {
  localStorage.setItem(STORAGE_KEYS.riderToken, token);
}

// Each workspace owns its credentials. Signing in must not sign out another role.
export function saveWorkforceSession({token, user} = {}) {
  if (!token || !['admin', 'staff', 'rider'].includes(user?.role)) {
    throw new Error('This login is only for workforce accounts.');
  }
  if (user.role === 'staff') {
    localStorage.setItem('staffToken', token);
  } else if (user.role === 'admin') {
    setAdminUser(user);
    setToken(token);
  } else {
    setRiderUser(user);
    setRiderToken(token);
  }
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
  notifyCustomerSessionChanged();
}

export function getCustomerUser() {
  if(!getCustomerToken())return null;
  const user=getStoredValue(STORAGE_KEYS.customerUser);
  return user?.role==='customer'?user:null;
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
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('customerName');
  localStorage.removeItem('customerEmail');
  notifyCustomerSessionChanged();
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

async function inventoryRequest(path, options = {}) {
  const res = await fetch(API_URL + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Inventory request failed');
  if(options.method&&options.method!=='GET')notifyOperationsChanged();
  return data;
}
export function apiInventory() { return inventoryRequest('/api/admin/inventory'); }
export function apiInventoryHistory(params = {}) {
  return inventoryRequest('/api/admin/inventory/history?' + new URLSearchParams(params));
}
export function apiAdjustStock(id, payload) {
  const { requestKey, ...body } = payload;
  return inventoryRequest('/api/admin/inventory/' + id + '/adjust', { method: 'POST', headers: { 'Idempotency-Key': requestKey }, body: JSON.stringify(body) });
}
export function apiArchiveProduct(id, payload) {
  return inventoryRequest('/api/admin/inventory/' + id + '/archive', { method: 'POST', body: JSON.stringify(payload) });
}
export function apiRestoreProduct(id, payload) {
  return inventoryRequest('/api/admin/inventory/' + id + '/restore', { method: 'POST', body: JSON.stringify(payload) });
}
export function apiHarvestBatches(id) {return inventoryRequest('/api/admin/inventory/'+id+'/batches');}
export function apiHarvestAction(id,batchId,action,payload,requestKey) {
  const path='/api/admin/inventory/'+id+'/batches'+(batchId?'/'+batchId:'')+(action==='adjust'||action==='dispose'?'/'+action:'');
  return inventoryRequest(path,{method:action==='update'?'PATCH':'POST',headers:{'Idempotency-Key':requestKey},body:JSON.stringify(payload)});
}

export async function apiResendVerification(email){const res=await fetch(API_URL+'/api/auth/resend-verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Unable to resend verification');return data;}

export async function apiSupply(path='',method='GET',body){const multipart=body instanceof FormData;const response=await fetch(API_URL+'/api/admin/supplies'+(path?'/'+path:''),{method,headers:{...getAuthHeader(),...(multipart?{}:{'Content-Type':'application/json'})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to update gardening supplies');if(method!=='GET')notifyOperationsChanged();return data;}

export async function apiLettuceStock(id,body,key){
 const res=await fetch(API_URL+'/api/admin/inventory/'+id+'/lettuce-stock',{method:'POST',headers:{...getAuthHeader(),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 const data=await res.json().catch(()=>({}));if(!res.ok){const error=new Error(data.error||'Unable to record lettuce stock.');error.affectedOrderIds=data.affectedOrderIds||[];throw error;}notifyOperationsChanged();return data;
}
