export const STAFF_PROFILE_EVENT='belfiore-staff-profile-changed';
export const STAFF_PROFILE_STORAGE='belfiore-staff-profile-version';
export function publishStaffProfile(profile){
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(STAFF_PROFILE_EVENT,{detail:profile}));
}
export function notifyStaffProfileChanged(profile){
 if(typeof window==='undefined')return;
 // Profile data stays in this window; other tabs receive only an invalidation marker.
 publishStaffProfile(profile);
 try{window.localStorage.setItem(STAFF_PROFILE_STORAGE,String(Date.now()));}catch{/* Focus and normal refresh remain available. */}
}
