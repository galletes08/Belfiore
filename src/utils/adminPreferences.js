export const ADMIN_PREFERENCES_KEY = "belfiore-admin-preferences";

export const DEFAULT_ADMIN_PREFERENCES = {
  compactMode: false,
  reduceMotion: false,
  confirmLogout: true,
  startPage: "/admin",
};

const VALID_START_PAGES = new Set([
  "/admin",
  "/admin/orders",
  "/admin/inventory",
  "/admin/customers",
  "/admin/riders",
  "/admin/reports",
]);

export function loadAdminPreferences() {
  if (typeof window === "undefined") return DEFAULT_ADMIN_PREFERENCES;

  try {
    const saved = JSON.parse(window.localStorage.getItem(ADMIN_PREFERENCES_KEY) || "{}");
    return {
      compactMode: saved.compactMode === true,
      reduceMotion: saved.reduceMotion === true,
      confirmLogout: saved.confirmLogout !== false,
      startPage: VALID_START_PAGES.has(saved.startPage) ? saved.startPage : "/admin",
    };
  } catch {
    return DEFAULT_ADMIN_PREFERENCES;
  }
}

export function saveAdminPreferences(preferences) {
  window.localStorage.setItem(ADMIN_PREFERENCES_KEY, JSON.stringify(preferences));
}
