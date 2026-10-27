import {useEffect,useRef,useState} from 'react';
import {X,ImagePlus,Trash2} from 'lucide-react';
import {StaffDialog} from '../admin/StaffAccountDrawer';
import StaffAvatar from '../components/StaffAvatar';
import {STAFF_PHOTO_MESSAGE} from '../../shared/staffPhotoPolicy';
import {staffPhotoFileError} from '../utils/staffAccountValidation';
import {staffApi} from './staffApi';
import {notifyStaffProfileChanged} from '../utils/staffProfileSync';

const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
export default function StaffPhotoDialog({profile,onClose,onSaved}){
 const [file,setFile]=useState(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmRemove,setConfirmRemove]=useState(false),[decoding,setDecoding]=useState(false);
 const pending=useRef(false),selection=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 const choose=async event=>{
  const selected=event.target.files?.[0],sequence=++selection.current;setError('');setFile(null);setPreview('');setConfirmRemove(false);
  if(!selected)return;
  const problem=staffPhotoFileError(selected);if(problem){setError(problem);event.target.value='';return;}
  setDecoding(true);const url=URL.createObjectURL(selected);
  try{
   await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth*image.naturalHeight<=16000000?resolve():reject(Error('Image dimensions are too large.'));image.onerror=()=>reject(Error('This image is invalid or damaged.'));image.src=url;});
   if(mounted.current&&sequence===selection.current){setPreview(url);setFile(selected);}else URL.revokeObjectURL(url);
  }catch(e){URL.revokeObjectURL(url);if(mounted.current&&sequence===selection.current)setError(e.message+' '+STAFF_PHOTO_MESSAGE);}
  finally{if(mounted.current&&sequence===selection.current)setDecoding(false);}
 };
 const save=async remove=>{
  if(pending.current||decoding||(!remove&&!file))return;pending.current=true;setBusy(true);setError('');
  try{
   let result;
   if(remove)result=await staffApi('/api/staff/profile/photo',{confirmed:true,expectedPhoto:profile.staff_profile_image_path||''},'DELETE');
   else{const data=new FormData();data.append('photo',file);data.append('expectedPhoto',profile.staff_profile_image_path||'');result=await staffApi('/api/staff/profile/photo',data);}
   notifyStaffProfileChanged(result.profile);onSaved(result.profile,result.message);onClose();
  }catch(e){setError(e.message);}finally{pending.current=false;if(mounted.current)setBusy(false);}
 };
 return <StaffDialog titleId="staff-photo-heading" onClose={onClose} busy={busy}><header className="flex items-center justify-between gap-3 border-b border-slate-100 p-5"><h2 id="staff-photo-heading" className="text-lg font-bold">Update Profile Picture</h2><button className={button} disabled={busy} onClick={onClose} aria-label="Close photo editor"><X size={17}/></button></header><div className="space-y-4 p-5"><div className="flex flex-wrap items-start justify-center gap-8"><div className="grid justify-items-center gap-2"><StaffAvatar staff={profile} large/><span className="text-xs text-slate-500">Current photo</span></div>{preview&&<div className="grid justify-items-center gap-2"><img src={preview} alt="Selected profile picture preview" className="h-24 w-24 rounded-full border border-emerald-100 object-cover"/><span className="text-xs text-slate-500">Preview — not saved</span></div>}</div><p className="text-xs leading-5 text-slate-500">{STAFF_PHOTO_MESSAGE} The saved photo is cropped to a square and displayed as a circular avatar.</p><label className="grid gap-2 text-sm font-medium"><span className="flex items-center gap-2"><ImagePlus size={16}/>Select Photo</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||decoding} onChange={choose} className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 p-2 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-emerald-900"/></label>{decoding&&<p role="status" className="text-xs text-slate-500">Checking image…</p>}{error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{confirmRemove?<section className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-sm">Remove your profile picture? Your initials will be shown instead.</p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>save(true)}>{busy?'Removing…':'Confirm Remove'}</button><button className={button} disabled={busy} onClick={()=>setConfirmRemove(false)}>Keep Photo</button></div></section>:<div className="flex flex-wrap gap-2"><button className="staff-primary" disabled={busy||decoding||!file} onClick={()=>save(false)}>{busy?'Saving…':'Save Photo'}</button><button className={button} disabled={busy} onClick={onClose}>Cancel</button>{profile.staff_profile_image_path&&<button className={button+' text-rose-700'} disabled={busy} onClick={()=>setConfirmRemove(true)}><Trash2 size={15}/>Remove Photo</button>}</div>}</div></StaffDialog>;
}
