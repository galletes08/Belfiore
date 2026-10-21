import {Router} from 'express';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {pool} from '../config/db.js';
import {verifyRequestToken,rejectDisabledCustomer} from '../utils/auth.js';
import {storeUploadedImage,usesSupabaseStorage} from '../utils/storage.js';
import {validateDeliveryAddress} from './locations.js';
import {resolveCheckoutAddress,checkoutQuote} from '../utils/checkout.js';

const router=Router();
router.use('/api/customer/account',rejectDisabledCustomer,async(req,res,next)=>{
  try{const user=verifyRequestToken(req);if(user.role!=='customer'||!Number.isSafeInteger(Number(user.userId)))return res.status(403).json({error:'Customer access only'});req.accountUser=user;next();}catch(error){res.status(error.status||401).json({error:error.message});}
});
const safe=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Unable to save or load account data. Please retry.'});}};
const invalid=message=>Object.assign(new Error(message),{status:400});
const text=(value,max=300)=>{if(value==null)return '';if(typeof value!=='string'||value.length>max)throw invalid('Invalid profile or address field');return value.trim();};
const account=async id=>(await pool.query("SELECT email,first_name,last_name,customer_profile,saved_addresses FROM users WHERE id=$1 AND role='customer'",[id])).rows[0];
router.get('/api/customer/account',safe(async(req,res)=>{
  const row=await account(req.accountUser.userId);if(!row)return res.status(404).json({error:'Account unavailable'});
  res.json({profile:{...row.customer_profile,name:row.customer_profile.name||[row.first_name,row.last_name].filter(Boolean).join(' '),email:row.email},profileStored:Object.keys(row.customer_profile).length>0,addresses:row.saved_addresses});
}));
router.patch('/api/customer/account/profile',safe(async(req,res)=>{
  const row=await account(req.accountUser.userId);if(!row)return res.status(404).json({error:'Account unavailable'});
  const body=req.body||{},profile={};
  for(const key of ['username','name','phone','gender','birthDate'])profile[key]=text(body[key]);
  profile.email=row.email;profile.image=row.customer_profile.image||'';
  if(body.image!==undefined&&body.image!==profile.image){
    if(body.image==='')profile.image='';
    else{
      const match=String(body.image).match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/);
      if(!match)throw invalid('Upload a JPG or PNG profile image');
      const buffer=Buffer.from(match[2],'base64');
      if(!buffer.length||buffer.length>1024*1024)throw invalid('Profile image must be 1 MB or less');
      const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
      if((match[1]==='png'&&!png)||(match[1]==='jpeg'&&!jpeg))throw invalid('Invalid image contents');
      const file={buffer,mimetype:`image/${match[1]}`,filename:`profile-${crypto.randomUUID()}.${match[1]==='png'?'png':'jpg'}`,originalname:`profile.${match[1]}`};
      if(!usesSupabaseStorage)await fs.writeFile(new URL(`../../uploads/${file.filename}`,import.meta.url),buffer);
      profile.image=await storeUploadedImage(file,'customers');
    }
  }
  await pool.query("UPDATE users SET customer_profile=$2::jsonb,updated_at=NOW() WHERE id=$1 AND role='customer'",[req.accountUser.userId,JSON.stringify(profile)]);
  res.json({profile});
}));
router.put('/api/customer/account/addresses',safe(async(req,res)=>{
  if(!Array.isArray(req.body?.addresses)||req.body.addresses.length>30)throw invalid('Provide up to 30 saved addresses');
  const ids=new Set(),contents=new Set(),addresses=[];
  for(const item of req.body.addresses){
    if(!item||typeof item!=='object'||Array.isArray(item))throw invalid('Invalid saved address');
    const address={id:text(String(item.id||''),100)};
    if(!address.id||ids.has(address.id))throw invalid('Saved addresses require distinct IDs');ids.add(address.id);
    for(const key of ['name','phone','addressLine','barangay','city','province','postalCode','landmark','label','country','countryCode','provinceCode'])address[key]=text(item[key],key==='addressLine'||key==='landmark'?1000:300);
    for(const [key,min,max] of [['latitude',-90,90],['longitude',-180,180]]){
      const value=item[key];address[key]=value==null||value===''?null:Number(value);
      if(address[key]!==null&&(!Number.isFinite(address[key])||address[key]<min||address[key]>max))throw invalid('Invalid address coordinates');
    }
    address.isDefault=item.isDefault===true;
    const signature=JSON.stringify(['name','phone','addressLine','barangay','city','province','postalCode','landmark','label'].map(key=>address[key]));
    if(contents.has(signature))throw invalid('Duplicate saved address');contents.add(signature);addresses.push(address);
  }
  if(addresses.filter(address=>address.isDefault).length>1)throw invalid('Only one address can be the default');
  await pool.query("UPDATE users SET saved_addresses=$2::jsonb,updated_at=NOW() WHERE id=$1 AND role='customer'",[req.accountUser.userId,JSON.stringify(addresses)]);
  res.json({addresses});
}));
router.post('/api/customer/account/checkout-quote',safe(async(req,res)=>{
  const address=await resolveCheckoutAddress(pool,req.accountUser.userId,req.body||{});
  res.set('Cache-Control','no-store').json({address,quote:await checkoutQuote(pool,req.body.items,address)});
}));
for(const method of ['post','patch','delete'])router[method]('/api/customer/account/addresses'+(method==='post'?'':'/:id'),safe(async(req,res)=>{
  const c=await pool.connect();try {
    await c.query('BEGIN');const user=(await c.query("SELECT saved_addresses FROM users WHERE id=$1 AND role='customer' FOR UPDATE",[req.accountUser.userId])).rows[0];if(!user)return res.status(404).json({error:'Account unavailable'});
    let addresses=user.saved_addresses;const current=addresses.find(a=>String(a.id)===req.params.id);
    if(method!=='post'&&!current)return res.status(404).json({error:'Address unavailable'});
    let saved;
    if(method==='delete')addresses=addresses.filter(a=>a!==current);
    else if(method==='patch'&&Object.keys(req.body||{}).length===1&&typeof req.body.isDefault==='boolean'){
      saved={...current,isDefault:req.body.isDefault};addresses=addresses.map(a=>a.id===current.id?saved:saved.isDefault?{...a,isDefault:false}:a);
    }
    else {
      const input={...current,...req.body};const location=await validateDeliveryAddress(input);
      const name=text(input.name),phone=text(input.phone);if(!name||!/^[0-9+\-\s()]{7,15}$/.test(phone))throw invalid('Recipient name and valid phone are required');
      const label=text(input.label)||'Other';if(!['Home','Work','Other'].includes(label))throw invalid('Select Home, Work or Other');
      saved={...location,id:current?.id||crypto.randomUUID(),name,phone,label,isDefault:input.isDefault===true};
      const signature=a=>JSON.stringify(['name','phone','addressLine','barangay','city','province','postalCode','countryCode'].map(k=>String(a[k]||(k==='countryCode'?'PH':'')).trim().toLowerCase()));
      const duplicate=addresses.find(a=>a.id!==current?.id&&signature(a)===signature(saved));
      if(duplicate){if(method==='patch')throw invalid('This address is already saved');saved={...duplicate,isDefault:saved.isDefault||duplicate.isDefault};addresses=addresses.map(a=>a.id===duplicate.id?saved:a);}
      else if(method==='post'){if(addresses.length>=30)throw invalid('Save up to 30 addresses');addresses=[...addresses,saved];}
      else addresses=addresses.map(a=>a.id===current.id?saved:a);
      if(saved.isDefault)addresses=addresses.map(a=>({...a,isDefault:a.id===saved.id}));
    }
    await c.query("UPDATE users SET saved_addresses=$2::jsonb,updated_at=NOW() WHERE id=$1 AND role='customer'",[req.accountUser.userId,JSON.stringify(addresses)]);await c.query('COMMIT');res.json({addresses,address:saved});
  } finally {await c.query('ROLLBACK');c.release();}
}));
export default router;
