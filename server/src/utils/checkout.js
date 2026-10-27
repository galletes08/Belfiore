import {SUPPLY,supplyChoice} from './supplies.js';
import {validateDeliveryAddress} from '../routes/locations.js';
import {getShippingQuote} from './shipping.js';
import {BATCH_SELECT} from './harvest.js';
export async function resolveCheckoutAddress(c,userId,body) {
  let address=body.deliveryAddress;
  if(body.savedAddressId){
    if(!userId)throw Object.assign(new Error('Sign in to use a saved address'),{status:401});
    const row=(await c.query("SELECT saved_addresses FROM users WHERE id=$1 AND role='customer'",[userId])).rows[0];
    const saved=row?.saved_addresses.find(a=>String(a.id)===String(body.savedAddressId));
    if(!saved)throw Object.assign(new Error('Saved address unavailable. Select your own saved address again.'),{status:404});
    address=body.deliveryAddress?{...saved,...body.deliveryAddress}:saved;
  }
  return validateDeliveryAddress(address);
}
export function addressSnapshot(a) {return [a.addressLine,a.landmark?`Landmark: ${a.landmark}`:'',a.barangay,a.city,a.province,a.postalCode,a.country].filter(Boolean).join(', ');}
export async function checkoutQuote(c,items,address) {
  if(!Array.isArray(items)||!items.length||items.length>100)throw Object.assign(new Error('Valid cart items are required'),{status:400});
  let subtotal=0;const seen=new Set();
  for(const item of items){
    if(!Number.isSafeInteger(Number(item.id))||!Number.isInteger(Number(item.qty))||Number(item.qty)<1)throw Object.assign(new Error('Invalid cart quantities'),{status:400});
    const key=String(item.id)+':'+String(item.batchId||'')+':'+String(item.variantId||'');if(seen.has(key))throw Object.assign(new Error('Refresh duplicate cart entries'),{status:409});seen.add(key);
    const p=(await c.query("SELECT p.*,to_jsonb(p)->>'lettuce_stock_model' AS lettuce_stock_model FROM products p WHERE id=$1",[item.id])).rows[0];if(!p||p.archived_at||p.legacy_quantity_review)throw Object.assign(new Error('A product is unavailable'),{status:409});
    let price=Number(p.price);
    if(p.inventory_type===SUPPLY){if(item.batchId)throw Object.assign(new Error('Supplies do not use harvest batches'),{status:400});const v=await supplyChoice(c,item.id,item.variantId,Number(item.qty));price=v.price;}
    else if(item.variantId)throw Object.assign(new Error('Variant does not belong to this product type'),{status:400});
    else if(p.inventory_type==='edible'&&p.lettuce_stock_model==='quantity'){
      if(item.batchId)throw Object.assign(new Error('Lettuce no longer uses batch selection. Remove this old cart line and add the product again.'),{status:409});
      if(p.stock<Number(item.qty))throw Object.assign(new Error('Insufficient available lettuce packs'),{status:409});
    }else if(p.inventory_type==='edible'){
      if(p.lettuce_stock_model==='batch')throw Object.assign(new Error('Lettuce stock requires administrator reconciliation'),{status:409});
      if(!Number.isSafeInteger(Number(item.batchId))||Number(item.batchId)<1)throw Object.assign(new Error('Select a harvest batch'),{status:409});
      const b=(await c.query(`${BATCH_SELECT} WHERE b.id=$1 AND b.product_id=$2`,[item.batchId,item.id])).rows[0];if(!b||b.available_stock<Number(item.qty))throw Object.assign(new Error('Selected batch is unavailable or has insufficient packs'),{status:409});price=Number(b.price);
    }else if(item.batchId||Number(item.qty)!==1||p.sold_at||p.stock-p.reserved_stock<1)throw Object.assign(new Error('Selected plant is unavailable'),{status:409});
    if(item.expectedUnitPrice!=null&&Number(item.expectedUnitPrice)!==price)throw Object.assign(new Error('Product price changed. Refresh your cart before checkout.'),{status:409});
    subtotal+=price*Number(item.qty);
  }
  const quote=getShippingQuote({...address,subtotal});return {...quote,subtotal,totalAmount:quote.fee==null?null:subtotal+quote.fee};
}
