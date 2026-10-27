import {notifyOperationsChanged} from '../utils/operationsSync';
const base=import.meta.env.VITE_API_URL||'http://localhost:3001';
export function staffSession(){try{const token=localStorage.getItem('staffToken');const p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return p.role==='staff'&&p.exp*1000>Date.now()?{token,...p}:null;}catch{return null;}}
export function clearStaff(){localStorage.removeItem('staffToken');}
export async function staffApi(path,body,method=body?'POST':'GET',headers={}){
 const token=staffSession()?.token;const multipart=body instanceof FormData;
 const res=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token||''}`,...(!multipart?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));if(res.status===401){clearStaff();window.location.assign('/staff/login');}
 if(!res.ok)throw new Error(data.error||'Request failed');if(method!=='GET'&&/\/(inventory|supplies|orders|products)(\/|$)/.test(path))notifyOperationsChanged();return data;
}
