export function summarizeCustomerOrders(orders=[]) {
  const unique=[...new Map(orders.filter(order=>order?.id!=null).map(order=>[String(order.id),order])).values()];
  const timestamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
  const latest=[...unique].sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt)||Number(b.id)-Number(a.id))[0]||null;
  return {
    latest,total:unique.length,
    inTransit:unique.filter(order=>!['Delivered','Cancelled'].includes(order.status)&&
      (['Out for Delivery','In Transit'].includes(order.trackingStatus)||['Out for Delivery','In Transit'].includes(order.status))).length,
    delivered:unique.filter(order=>order.status==='Delivered').length,
  };
}
