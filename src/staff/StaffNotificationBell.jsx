import NotificationBell from '../admin/NotificationBell';
import {staffApi} from './staffApi';

const base='/api/staff/notifications';
const notifications={
 list:({page,limit})=>staffApi(`${base}?page=${page}&limit=${limit}`),
 count:()=>staffApi(`${base}/unread-count`),
 read:id=>staffApi(`${base}/${encodeURIComponent(id)}/read`,{}),
 readAll:throughId=>staffApi(`${base}/read-all`,{throughId}),
};

export default function StaffNotificationBell(){
 return <NotificationBell api={notifications} ordersPath="/staff/orders"/>;
}
