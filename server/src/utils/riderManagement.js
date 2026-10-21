// is_available is a manual duty preference, never a GPS/presence signal.
export const riderManagementSelect=`SELECT r.*,u.username,u.must_change_password,u.rider_security_locked,u.rider_failed_attempts,u.rider_security_locked_at,
  (r.status='active' AND u.status='active' AND u.role='rider') IS TRUE AS account_enabled,
  (SELECT COUNT(*)::int FROM orders o WHERE o.rider_id=r.id AND o.status NOT IN ('Delivered','Cancelled')) AS active_assignments
  FROM riders r LEFT JOIN users u ON u.id=r.user_id`;
export function riderAvailability(row) {
  if(!row.account_enabled)return 'Offline';
  if(Number(row.active_assignments)>0)return 'Busy';
  return row.is_available&&!row.must_change_password&&!row.rider_security_locked?'Available':'Offline';
}
export const riderAvailabilitySql=`CASE WHEN NOT account_enabled THEN 'Offline'
  WHEN active_assignments>0 THEN 'Busy' WHEN is_available AND NOT must_change_password AND NOT rider_security_locked THEN 'Available' ELSE 'Offline' END`;
export const riderHistory=`SELECT a.id::text AS record_id,a.order_id,a.assigned_at,a.accepted_at,
  CASE WHEN a.status='Delivered' THEN a.completed_at END AS delivered_at,a.status,o.customer_name,
  'assignment'::text AS source FROM order_rider_assignments a JOIN orders o ON o.id=a.order_id WHERE a.rider_id=$1
  UNION ALL SELECT 'current-'||o.id,o.id,o.driver_assigned_at,o.driver_accepted_at,NULL::timestamptz,o.status,o.customer_name,
  'current order; completion time not recorded' FROM orders o WHERE o.rider_id=$1
    AND NOT EXISTS(SELECT 1 FROM order_rider_assignments a WHERE a.order_id=o.id AND a.rider_id=$1)`;
