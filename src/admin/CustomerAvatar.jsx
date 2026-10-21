import {useEffect,useState} from 'react';
import {getImageUrl} from '../api/client';

export default function CustomerAvatar({customer,large=false}){
  const [broken,setBroken]=useState(false);
  const url=getImageUrl(customer?.profileImageUrl);
  useEffect(()=>setBroken(false),[url]);
  const name=customer?.fullName||'Customer';
  const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50 font-semibold text-emerald-800 ${large?'h-16 w-16 text-lg':'h-10 w-10 text-xs'}`}>
    {url&&!broken?<img src={url} alt={`${name} profile`} className="h-full w-full object-cover" onError={()=>setBroken(true)}/>:<span role="img" aria-label={`${name} initials`}>{initials}</span>}
  </span>;
}
