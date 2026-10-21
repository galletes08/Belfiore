export function validateManualDelivery(orderStatus, shipmentStatus, previousStatus) {
  const rank={'Pending':0,'Preparing':1,'Packed':2,'In Transit':3,'Out for Delivery':4,'Delivered':5};
  if(shipmentStatus==='Cancelled')return 'Cancel the order through the cancellation workflow instead of changing shipment status alone.';
  if(!(shipmentStatus in rank))return 'Unsupported delivery status.';
  if(previousStatus==='Cancelled'||(previousStatus in rank&&rank[shipmentStatus]<rank[previousStatus]))return 'Delivery status cannot move backwards through normal editing.';
  if((shipmentStatus==='Delivered')!==(orderStatus==='Delivered'))return 'Select Delivered for both order and delivery status to record confirmed delivery.';
  if(['In Transit','Out for Delivery'].includes(shipmentStatus)&&orderStatus!=='Out for Delivery')return 'Set Order Status to Out for Delivery when manually recording courier transit.';
  if(orderStatus==='Out for Delivery'&&!['In Transit','Out for Delivery','Delivered'].includes(shipmentStatus))return 'Select In Transit or Out for Delivery for a dispatched courier order.';
  return null;
}
