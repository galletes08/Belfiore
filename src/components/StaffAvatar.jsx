import {useState} from 'react';
import {getImageUrl} from '../api/client';
import {staffInitials} from '../utils/staffDirectory';

export default function StaffAvatar({staff={},large=false}){
 const [failedSource,setFailedSource]=useState(null);
 return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-100 bg-emerald-50 font-bold text-emerald-900 ${large?'h-24 w-24 text-2xl':'h-10 w-10 text-xs'}`}>{staff.profile_image_url&&failedSource!==staff.profile_image_url?<img src={getImageUrl(staff.profile_image_url)} alt="" className="h-full w-full object-cover" onError={()=>setFailedSource(staff.profile_image_url)}/>:staffInitials(staff)}</span>;
}
