export const ORDER_STATUSES=['Pending','Preparing','Cancellation Requested','Out for Delivery','Delivered','Cancelled'];
export function staffNextOrderStatuses(status){
 return status==='Pending'?['Preparing']:status==='Preparing'?['Out for Delivery']:[];
}
