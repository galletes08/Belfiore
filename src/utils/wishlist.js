const WISHLIST_STORAGE_PREFIX = "belfiore-wishlist";

function getWishlistStorageKey() {
  if (typeof window === "undefined") {
    return `${WISHLIST_STORAGE_PREFIX}:guest`;
  }

  try {
    const customer = JSON.parse(
      window.localStorage.getItem("customerUser") || "null"
    );
    const owner =
      customer?.userId ||
      customer?.id ||
      String(customer?.email || "").trim().toLowerCase() ||
      "guest";

    return `${WISHLIST_STORAGE_PREFIX}:${encodeURIComponent(owner)}`;
  } catch {
    return `${WISHLIST_STORAGE_PREFIX}:guest`;
  }
}

export function getWishlistIds() {
  if (typeof window === "undefined") return [];

  try {
    const storedIds = JSON.parse(
      window.localStorage.getItem(getWishlistStorageKey()) || "[]"
    );

    if (!Array.isArray(storedIds)) return [];

    return [...new Set(
      storedIds
        .filter((id) => id != null)
        .map((id) => String(id))
    )];
  } catch {
    return [];
  }
}

export function saveWishlistIds(ids) {
  if (typeof window === "undefined") return;

  const normalizedIds = [...new Set(
    ids
      .filter((id) => id != null)
      .map((id) => String(id))
  )];

  window.localStorage.setItem(
    getWishlistStorageKey(),
    JSON.stringify(normalizedIds)
  );
}
