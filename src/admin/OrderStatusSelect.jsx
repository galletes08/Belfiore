import {ORDER_STATUSES} from '../../shared/orderStatus';

export default function OrderStatusSelect({value,onChange,options=ORDER_STATUSES,disabled=false,terminal=false}){
 return <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">Order Status</span><select value={value} onChange={event=>onChange(event.target.value)} disabled={disabled} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43] disabled:opacity-60">{options.map(option=><option key={option} value={option} disabled={terminal&&option!==value}>{option}</option>)}</select></label>;
}
