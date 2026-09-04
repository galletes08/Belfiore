import { getCustomerUser, hasCustomerToken } from "../api/client";

const LEGACY_CART_STORAGE_KEYS = ["belfiore-cart", "customerCart"];
const CART_STORAGE_PREFIX = "belfiore-cart-v2";

export function isLettuceProduct(product) {
  const category = String(product?.category || "").trim().toLowerCase();
  const tag = String(product?.tag || "").trim().toLowerCase();
  const name = String(product?.name || "").trim().toLowerCase();

  return (
    category === "aquaponics" ||
    tag === "aquaponics" ||
    name.includes("lettuce")
  );
}

function normalizeCart(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (item) =>
      item &&
      item.id != null &&
      Number(item.qty) > 0 &&
      Number.isFinite(Number(item.price))
    )
    .map((item) => {
      const allowsMultipleQuantity =
        item.allowsMultipleQuantity === true || isLettuceProduct(item);
      const requestedQuantity = Math.max(1, Number(item.qty) || 1);
      const availableStock = Number(item.stock);
      const quantity =
        allowsMultipleQuantity && Number.isFinite(availableStock) && availableStock > 0
          ? Math.min(requestedQuantity, availableStock)
          : allowsMultipleQuantity
            ? requestedQuantity
            : 1;

      return {
        ...item,
        qty: quantity,
        allowsMultipleQuantity
      };
    });
}

export function hasAuthenticatedCustomer() {
  if (typeof window === "undefined") return false;
  const customer = getCustomerUser();
  return (
    window.localStorage.getItem("isLoggedIn") === "true" &&
    hasCustomerToken() &&
    Boolean(customer) &&
    (customer.role ?? "customer") === "customer"
  );
}

function getCustomerCartStorageKey() {
  if (!hasAuthenticatedCustomer()) return null;
  const customer = getCustomerUser();
  const customerId = customer?.id ?? customer?.userId;
  const normalizedEmail = String(customer?.email || "").trim().toLowerCase();
  const owner =
    customerId != null && String(customerId).trim()
      ? `id:${customerId}`
      : normalizedEmail
        ? `email:${normalizedEmail}`
        : "";

  return owner
    ? `${CART_STORAGE_PREFIX}:${encodeURIComponent(owner)}`
    : null;
}

export function loadCustomerCart() {
  if (typeof window === "undefined") return [];
  const storageKey = getCustomerCartStorageKey();
  if (!storageKey) return [];

  try {
    // Retire old shared keys so they can never be assigned to another customer.
    LEGACY_CART_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    const savedCart = window.localStorage.getItem(storageKey);
    return savedCart === null ? [] : normalizeCart(JSON.parse(savedCart));
  } catch {
    return [];
  }
}

export function saveCustomerCart(items) {
  if (typeof window === "undefined") return;
  const storageKey = getCustomerCartStorageKey();
  if (!storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(normalizeCart(items)));
}

export function clearCustomerCart() {
  if (typeof window === "undefined") return;
  const storageKey = getCustomerCartStorageKey();
  if (!storageKey) return;
  window.localStorage.removeItem(storageKey);
}
