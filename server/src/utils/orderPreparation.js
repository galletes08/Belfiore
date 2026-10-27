// Existing order records remain authoritative; this only attaches preparation metadata.
export async function attachOrderPreparation(db,orders){
 if(!orders.length||!(await db.query("SELECT to_regclass('staff_fulfillment') AS name")).rows[0].name)return orders;
 const rows=(await db.query(`SELECT f.*,CONCAT_WS(' ',u.first_name,u.last_name) AS handler_name
 FROM staff_fulfillment f LEFT JOIN users u ON u.id=f.handler_id WHERE f.order_id=ANY($1::bigint[])`,[orders.map(o=>o.id)])).rows;
 const byId=new Map(rows.map(f=>[String(f.order_id),{stage:f.stage,handlerId:f.handler_id,handlerName:f.handler_name,checklist:f.checklist,verifiedItems:f.verified_items,notes:f.notes,version:f.version,startedAt:f.started_at,packedAt:f.packed_at,readyAt:f.ready_at,updatedAt:f.updated_at}]));
 return orders.map(o=>({...o,preparationStatus:byId.get(String(o.id))?.stage||null,preparation:byId.get(String(o.id))||null}));
}
