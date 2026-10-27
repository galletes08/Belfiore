import {CreditCard,History,MoreHorizontal,Truck} from 'lucide-react';
import InventoryActionMenu from './InventoryActionMenu';

export default function OrderMoreMenu({order,onOpen}){
 return <InventoryActionMenu label="More" productName={order.orderCode} icon={MoreHorizontal} items={[
  {label:'Payment details',icon:CreditCard,action:()=>onOpen(order,'Payment')},
  {label:'Delivery & status',icon:Truck,action:()=>onOpen(order,'Delivery')},
  {label:'Order history',icon:History,action:()=>onOpen(order,'History')},
 ]}/>;
}
