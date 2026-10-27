export {orderSummary} from '../../shared/orderSummary.js';

export function manilaDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const get = type => parts.find(p=>p.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function filterOrders(orders, {search='',status='All',fromDate='',toDate=''} = {}) {
  const query = search.trim().toLowerCase();
  return orders.filter(o => {
    const day = manilaDate(o.createdAt);
    return (status === 'All' || o.status === status) && (!fromDate || day >= fromDate) && (!toDate || (day && day <= toDate)) &&
      (!query || [o.id,o.orderCode,o.customerName,o.gmail,o.mobileNumber,o.location,o.courierName,o.riderName,o.trackingCode,o.trackingStatus,o.status].join(' ').toLowerCase().includes(query));
  }).sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||Number(b.id)-Number(a.id));
}

export function orderTimeline(order) {
  // Snapshots are not a complete audit log; do not infer missing intermediate states.
  return [
    ['Order Placed',order.createdAt,'Customer','Checkout recorded'],
    ['Order Confirmed',order.adminConfirmedAt,'Belfiore Team','Confirmation recorded'],
    ['Online Payment Verified',order.paymongoPaidAt,'Payment system','Verified payment timestamp'],
    ['Rider Assigned',order.driverAssignedAt,'Not recorded','Rider assignment timestamp'],
    ['Rider Accepted',order.driverAcceptedAt,'Assigned rider','Rider acceptance recorded'],
    ['Cancellation Requested',order.cancellationRequestedAt,'Customer',order.cancelReason],
    ['Cancelled',order.cancelledAt,order.cancelledBy || 'Not recorded',order.cancelReason],
    [order.status,order.statusUpdatedAt,'Not recorded','Latest recorded status snapshot; earlier transitions are not available'],
  ].filter(([,time])=>time && !Number.isNaN(Date.parse(time))).sort((a,b)=>Date.parse(a[1])-Date.parse(b[1]));
}
// Payment alone is not administrator acceptance of the order request.
export function canShowCustomerInvoice(order) {
  return Boolean(order?.adminConfirmedAt) && Number.isFinite(Date.parse(order.adminConfirmedAt));
}
