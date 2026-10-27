// Shared display/authorization manifest. The backend remains authoritative.
export const STAFF_PERMISSIONS = new Set(['staff.dashboard.read','orders.operational.read','inventory.read','inventory.lettuce.stock_in','inventory.lettuce.dispose','inventory.supplies.stock_in','inventory.supplies.dispose','activity.own.read','profile.own.update']);
for(const permission of ['orders.accept','orders.status.update','orders.assign_rider','orders.delivery.manage','products.create','inventory.history.read'])STAFF_PERMISSIONS.add(permission);
