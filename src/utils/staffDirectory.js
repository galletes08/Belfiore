export const staffName=staff=>[staff.first_name,staff.last_name].filter(Boolean).join(' ')||staff.username||`Staff #${staff.id}`;
export const staffInitials=staff=>staffName(staff).split(/\s+/).slice(0,2).map(part=>part.charAt(0)).join('').toUpperCase();
export const staffTimestamp=(value,empty='Not recorded')=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})+' PHT':empty;
export function staffDirectoryCounts(records){
 const staff=records.filter(s=>s.role==='staff');
 return {total:staff.length,active:staff.filter(s=>s.status==='active').length,inactive:staff.filter(s=>s.status==='disabled').length};
}
export function filterStaffDirectory(records,{query='',status='all',sort='name-asc'}={}){
 const term=query.trim().toLocaleLowerCase();
 const rows=records.filter(s=>s.role==='staff'&&(status==='all'||s.status===status)&&(!term||[staffName(s),s.username,String(s.id),'#'+s.id,'Staff #'+s.id].some(value=>String(value||'').toLocaleLowerCase().includes(term))));
 return rows.sort((a,b)=>sort==='recent'?((Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)):sort==='login'?((Date.parse(b.last_login_at)||0)-(Date.parse(a.last_login_at)||0)):(sort==='name-desc'?-1:1)*staffName(a).localeCompare(staffName(b),'en',{sensitivity:'base',numeric:true})||Number(a.id)-Number(b.id));
}
