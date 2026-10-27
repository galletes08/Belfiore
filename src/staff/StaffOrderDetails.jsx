import {useState} from 'react';
import OrderDetailsDrawer from '../admin/OrderDetailsDrawer';
import StaffOrderActions from './StaffOrderActions';
import StaffOrderStatus from './StaffOrderStatus';

export default function StaffOrderDetails({order,refresh,onError,onClose,initialTab='Overview'}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const reportError=message=>{setError(message);onError?.(message);};
 return <OrderDetailsDrawer order={order} initialTab={initialTab} onClose={onClose} busy={busy} error={error} allowDeliveryHistory={false} overviewContent={
  <StaffOrderActions key={order.id+':'+order.updated_at} order={order} refresh={refresh} onError={reportError} onBusyChange={setBusy}/>
 }><StaffOrderStatus key={order.id+':'+order.assignment_version} order={order} refresh={refresh} onError={reportError} onBusyChange={setBusy}/></OrderDetailsDrawer>;
}
