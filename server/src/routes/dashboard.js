import {supplyProduct} from '../utils/supplies.js';
import {Router} from 'express';
import {pool} from '../config/db.js';
import {verifyRequestToken} from '../utils/auth.js';
import {reportFilters,eligible,cohort,bestProductsSql,salesSeriesSql,REPORT_NOTES} from '../utils/reports.js';
import {readHarvest} from '../utils/harvest.js';
import {inventoryAttention} from '../../../src/utils/inventoryAttention.js';

const router=Router();
export function dashboardPeriod(query={},now=new Date()) {
  const today=reportFilters({preset:'today'},now).from;
  const period=String(query.period??'month');
  const year=Number(query.year??today.slice(0,4));
  const month=Number(query.month??today.slice(5,7));
  if(!['month','year'].includes(period)||!Number.isInteger(year)||year<1900||year>9998||!Number.isInteger(month)||month<1||month>12)
    throw Object.assign(new Error('Select a valid chart period, year and month'),{status:400});
  const from=`${year}-${period==='year'?'01':String(month).padStart(2,'0')}-01`;
  const to=new Date(Date.UTC(year,period==='year'?12:month,0)).toISOString().slice(0,10);
  return {period,year,month,from,to};
}
router.get('/api/admin/dashboard',async(req,res)=>{
  let client;
  try {
    if(verifyRequestToken(req).role!=='admin') return res.status(403).json({error:'Admin access only'});
    res.set('Cache-Control','no-store');
    const chart=dashboardPeriod(req.query);
    const current=reportFilters({preset:'month'});
    client=await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    const totals=(await client.query(`SELECT COUNT(*)::int AS monthly_orders,
      COALESCE(SUM(o.total_amount) FILTER(WHERE ${eligible}),0)::float8 AS monthly_sales,
      COUNT(*) FILTER(WHERE ${eligible})::int AS qualifying_orders FROM orders o WHERE ${cohort}`,[current.from,current.to])).rows[0];
    const salesData=(await client.query(salesSeriesSql(chart.period==='year'),[chart.from,chart.to])).rows;
    const topProducts=(await client.query(`${bestProductsSql} LIMIT 5`,[chart.from,chart.to])).rows.map(p=>({...p,rank:Number(p.rank),quantity:Number(p.quantity),revenue:Number(p.revenue)}));
    const recentOrders=(await client.query(`SELECT id,'ORD-'||LPAD(id::text,GREATEST(3,LENGTH(id::text)),'0') AS code,customer_name AS customer,
      created_at AS date,status,total_amount::float8 AS total FROM orders ORDER BY created_at DESC,id DESC LIMIT 5`)).rows;
    const years=(await client.query("SELECT DISTINCT EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Manila')::int AS year FROM orders ORDER BY year DESC")).rows.map(r=>r.year);
    const batches=await readHarvest(client);
    const raw=(await client.query(`SELECT id,name,product_code,inventory_type,stock,reserved_stock,archived_at,sold_at,legacy_quantity_review,
      low_stock_threshold,supply_stock_model,inventory_product_status(products) AS status FROM products WHERE archived_at IS NULL`)).rows;
    const products=await Promise.all(raw.map(async p=>{
      const own=batches.filter(b=>b.product_id===Number(p.id));
      const stock=p.inventory_type==='edible'?own.reduce((n,b)=>n+b.available_stock,0):p.stock;
      return supplyProduct(client,{supplyStockModel:p.supply_stock_model,id:Number(p.id),name:p.name,productCode:p.product_code,inventoryType:p.inventory_type,stock,archivedAt:p.archived_at,soldAt:p.sold_at,
        legacyQuantityReview:p.legacy_quantity_review,lowStockThreshold:p.low_stock_threshold,batches:own,
        status:p.inventory_type==='edible'&&!p.legacy_quantity_review?(stock===0?'Out of Stock':stock<=p.low_stock_threshold?'Low Stock':'Available'):p.status});
    }));
    const inventoryIssues=inventoryAttention(products).map(({product,batches,reasons,count})=>({
      productId:product.id,productCode:product.productCode,product:product.name,type:product.inventoryType,stock:product.stock,
      threshold:product.lowStockThreshold,reasons,count,batches:batches.map(b=>({id:b.id,code:b.batch_code,status:b.status,physical:b.physical_stock}))
    }));
    // Same actionable conditions as Order Management; multiple reasons still produce one row per order.
    const actionOrders=(await client.query(`SELECT id,status,payment_status,cod_status,inventory_reconciliation_reason,COUNT(*) OVER()::int AS total
      FROM orders WHERE status IN ('Pending','Cancellation Requested') OR payment_status='Refund Pending' OR cod_status='Remittance Pending'
      OR NULLIF(inventory_reconciliation_reason,'') IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 20`)).rows;
    const orderCount=actionOrders[0]?.total||0;
    const inventoryCount=inventoryIssues.reduce((n,i)=>n+i.count,0);
    const lowStock=inventoryIssues.filter(i=>i.type==='edible'&&i.stock<=i.threshold).map(i=>({productId:i.productId,tag_key:i.productCode,tag_label:i.product,qty:i.stock,threshold:i.threshold,unit:'400g packs'})).concat(products.filter(p=>p.inventoryType==='GARDENING_SUPPLY').flatMap(p=>(p.variants||[]).filter(v=>!v.archived_at&&v.stock!=null&&v.available_stock<=v.low_stock_threshold).map(v=>({productId:p.id,tag_key:v.sku,tag_label:p.name+' - '+v.name,qty:v.available_stock,threshold:v.low_stock_threshold,unit:v.selling_unit}))));
    await client.query('COMMIT');
    res.json({generatedAt:new Date(),chart,years,month:{from:current.from,to:current.to},salesData,topProducts,recentOrders,lowStock,
      totals:{monthlySales:totals.monthly_sales,monthlyOrders:totals.monthly_orders,qualifyingOrders:totals.qualifying_orders,
        averageOrderValue:totals.qualifying_orders?totals.monthly_sales/totals.qualifying_orders:0,needsAttention:inventoryCount+orderCount},
      attention:{inventoryCount,orderCount,inventory:inventoryIssues.slice(0,20),inventoryProducts:inventoryIssues.length,orders:actionOrders.map(o=>({id:o.id,status:o.status,
        reasons:[['Pending','Cancellation Requested'].includes(o.status)?o.status:null,o.payment_status==='Refund Pending'?'Refund Pending':null,o.cod_status==='Remittance Pending'?'Remittance Pending':null,o.inventory_reconciliation_reason].filter(Boolean)}))},
      notes:REPORT_NOTES.slice(0,3)});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});res.status(error.status||500).json({error:error.status?error.message:'Unable to load dashboard. Please retry.'});}
  finally{client?.release();}
});
export default router;
