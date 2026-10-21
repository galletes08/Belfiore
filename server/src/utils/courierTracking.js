import {pool} from '../config/db.js';
import {isTrack123Configured,queryTrack123TrackingDetails} from './track123.js';

const rank={'Pending':0,'Preparing':1,'Packed':2,'In Transit':3,'Out for Delivery':4,'Delivered':5};
export function carrierTransition(order,tracking) {
  const next=tracking.trackingStatus;
  if(order.delivery_mode!=='logistics'||['Cancelled','Cancellation Requested','Delivered'].includes(order.status)||!(next in rank))return null;
  if(order.payment_method==='ONLINE'&&order.payment_status!=='Paid')return null;
  if(tracking.checkpointTime&&order.track123_last_checkpoint_at&&Date.parse(tracking.checkpointTime)<Date.parse(order.track123_last_checkpoint_at))return null;
  if(next==='Pending'||rank[next]< (rank[order.tracking_status]??0))return null;
  return {status:next==='Delivered'?'Delivered':['In Transit','Out for Delivery'].includes(next)?'Out for Delivery':order.status,trackingStatus:next};
}

export async function syncCourierOrder(id,db=pool) {
  if(!isTrack123Configured())return;
  const client=await db.connect();
  let locked=false;
  try {
    locked=(await client.query('SELECT pg_try_advisory_lock(72108,$1::int) AS locked',[id])).rows[0].locked;
    if(!locked)return;
    const order=(await client.query("SELECT * FROM orders WHERE id=$1 AND delivery_mode='logistics' AND NULLIF(tracking_code,'') IS NOT NULL AND status NOT IN ('Delivered','Cancelled','Cancellation Requested')",[id])).rows[0];
    if(!order)return;
    const tracking=await queryTrack123TrackingDetails({trackingNumber:order.tracking_code,courierCode:order.tracking_courier_code||''});
    await client.query('BEGIN');
    const fresh=(await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!fresh||fresh.tracking_code!==order.tracking_code||fresh.delivery_mode!=='logistics'||fresh.courier_name!==order.courier_name){await client.query('ROLLBACK');return;}
    const next=carrierTransition(fresh,tracking);
    await client.query("SELECT set_config('delivery.actor','Courier tracking service',true),set_config('delivery.notes','Status supplied by carrier tracking',true)");
    if(next) {
      await client.query(`UPDATE orders SET status=$2,tracking_status=$3,
        status_updated_at=CASE WHEN status IS DISTINCT FROM $2 OR tracking_status IS DISTINCT FROM $3 THEN NOW() ELSE status_updated_at END,
        cod_status=CASE WHEN payment_method='COD' AND $3='Delivered' AND cod_status<>'Remitted' THEN 'Remittance Pending' ELSE cod_status END,
        track123_last_checkpoint_at=COALESCE($4::timestamptz,track123_last_checkpoint_at),track123_last_synced_at=NOW(),updated_at=NOW() WHERE id=$1`,
      [id,next.status,next.trackingStatus,tracking.checkpointTime]);
    } else await client.query('UPDATE orders SET track123_last_synced_at=NOW() WHERE id=$1',[id]);
    await client.query(`INSERT INTO order_courier_tracking(order_id,tracking_number,updates) VALUES($1,$2,$3::jsonb)
      ON CONFLICT(order_id) DO UPDATE SET tracking_number=EXCLUDED.tracking_number,updates=EXCLUDED.updates,synced_at=clock_timestamp()`,[id,order.tracking_code,JSON.stringify(tracking.updates||[])]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{if(locked)await client.query('SELECT pg_advisory_unlock(72108,$1::int)',[id]).catch(()=>{});client.release();}
}

let running=false;
export async function syncCourierOrders(db=pool) {
  if(running||!isTrack123Configured())return;
  running=true;
  try {
    const rows=await db.query(`SELECT id FROM orders WHERE delivery_mode='logistics' AND NULLIF(tracking_code,'') IS NOT NULL
      AND status NOT IN ('Delivered','Cancelled','Cancellation Requested')
      AND (track123_last_synced_at IS NULL OR track123_last_synced_at<NOW()-INTERVAL '5 minutes')
      ORDER BY track123_last_synced_at NULLS FIRST,id LIMIT 20`);
    for(const row of rows.rows)try{await syncCourierOrder(Number(row.id),db);}catch(error){console.error(`Courier tracking order ${row.id}:`,error.message);}
  }finally{running=false;}
}
