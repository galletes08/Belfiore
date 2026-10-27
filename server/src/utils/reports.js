// Reports deliberately use SELECTs inside a read-only repeatable-read transaction.
// Never call inventory refresh, reservation expiry, or courier synchronization here.
export const REPORT_NOTES = [
  'Sales and orders use the order-creation cohort in Philippine Time, evaluated using current statuses; this is not a cash-collection or historical status-as-of report.',
  'Recognized sales require Delivered and Paid, plus COD Collected/Remitted or a recorded verified online payment ID and paid timestamp. Cancelled, unpaid, failed, refund-pending and refunded orders are excluded. Orders are counted once, not payment events.',
  'Sales include the stored order total, including recorded delivery fees. Product revenue uses historical order-item line totals and excludes delivery fees. Recorded selling prices already include batch pricing; pre-discount gross sales, separate original-price discounts and actual refund amounts are unavailable. Net eligible sales excludes orders currently marked Refund Pending or Refunded; it is not a refund cash-flow report or profit.',
  'Inventory availability and alerts are current snapshots. Movements and confirmed disposals use their backend recording timestamps. Stock Out excludes sale allocations and disposal. Historical physical stock is unavailable because dispatch and legacy physical-stock history are incomplete; allocations are not subtracted again. Recorded fulfilled quantities use known delivery completion timestamps only; unavailable cells and undated orders must not be interpreted as zero fulfillment.',
  'Completed deliveries use recorded courier Delivered transitions or rider assignment completed_at, never mutable updated_at. Delivered orders without a reliable completion timestamp are excluded from completion-period metrics and shown separately for the creation cohort. Shipment tables and status/method breakdowns use the creation cohort. Failed/returned statuses and actual dispatch timestamps are not reliably recorded; delivery duration is unavailable.',
  'Legacy missing product types, tags and codes remain Unknown/Unavailable; current product prices or tags never replace historical sales snapshots. Exports include every matching row, independent of table pagination.'
];
const bad = message => Object.assign(new Error(message), {status:400});
export function reportFilters(query = {}, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const day = new Date(`${today}T00:00:00Z`);
  const iso = d => d.toISOString().slice(0,10);
  const preset = String(query.preset || 'month');
  let from = today, to = today;
  switch(preset) {
    case 'today': break;
    case 'week': day.setUTCDate(day.getUTCDate()-6); from=iso(day); break;
    case 'month': from=today.slice(0,7)+'-01'; break;
    case 'lastMonth': day.setUTCDate(0); to=iso(day); day.setUTCDate(1); from=iso(day); break;
    case 'year': from=today.slice(0,4)+'-01-01'; break;
    case 'custom': from=String(query.fromDate||''); to=String(query.toDate||''); break;
    default: throw bad('Invalid reporting period');
  }
  for(const value of [from,to]) {
    const d=new Date(`${value}T00:00:00Z`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')||!Number.isFinite(+d)||iso(d)!==value) throw bad('Enter valid From Date and To Date');
  }
  if(from>to) throw bad('From Date must be on or before To Date');
  const tab=String(query.tab||'sales');
  if(!['sales','inventory','orders','delivery'].includes(tab)) throw bad('Invalid report tab');
  const pages={};
  for(const key of ['products','orders','movements','alerts','disposals','shipments','supplyPools','supplyVariants','supplySales','categories']) {
    const n=Number(query[`${key}Page`]||1);
    if(!Number.isSafeInteger(n)||n<1||n>1000000) throw bad('Invalid report page');
    pages[key]=n;
  }
  return {preset,from,to,tab,pages,monthly:(Date.parse(to)-Date.parse(from))/86400000>62};
}

export const eligible = `o.status='Delivered' AND o.payment_status='Paid' AND
  ((o.payment_method='COD' AND o.cod_status IN ('Collected','Remitted')) OR
   (o.payment_method='ONLINE' AND o.paymongo_paid_at IS NOT NULL AND NULLIF(o.paymongo_payment_id,'') IS NOT NULL))`;
export const cohort = `o.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Manila') AND
  o.created_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila')`;
const movementPeriod = cohort.replaceAll('o.created_at','m.created_at');
// Aggregate both histories before joining orders: no one-to-many multiplication.
const deliveryCTE = `WITH completion AS (
 SELECT order_id,MIN(at) AS completed_at FROM (
  SELECT order_id,created_at AS at FROM order_delivery_history WHERE new_status='Delivered' AND previous_status<>'Delivered'
  UNION ALL SELECT order_id,completed_at FROM order_rider_assignments WHERE completed_at IS NOT NULL
 ) events GROUP BY order_id
)`;

export const bestProductsSql = `SELECT ROW_NUMBER() OVER(ORDER BY quantity DESC,revenue DESC,product,type,tag) AS rank,ranked.* FROM (
 SELECT oi.product_name AS product,COALESCE(oi.inventory_type,'Unknown') AS type,
 CASE WHEN oi.inventory_type='succulent' THEN COALESCE(oi.product_tag,'Unknown') ELSE '-' END AS tag,
 SUM(oi.qty) AS quantity,CASE oi.inventory_type WHEN 'edible' THEN '400g packs' WHEN 'succulent' THEN 'plants' ELSE 'Unknown' END AS unit,
 SUM(oi.line_total) AS revenue,STRING_AGG(DISTINCT COALESCE(oi.product_code,'Unavailable')||COALESCE(' / '||oi.batch_code,''),', ') AS codes
 FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${cohort} AND ${eligible} AND COALESCE(oi.inventory_type,'Unknown')<>'GARDENING_SUPPLY'
 GROUP BY oi.product_name,oi.inventory_type,CASE WHEN oi.inventory_type='succulent' THEN COALESCE(oi.product_tag,'Unknown') ELSE '-' END
 UNION ALL
 SELECT MIN(oi.product_name),'GARDENING_SUPPLY',MIN(oi.variant_name),SUM(oi.qty),oi.selling_unit,SUM(oi.line_total),STRING_AGG(DISTINCT oi.variant_sku,', ')
 FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${cohort} AND ${eligible} AND oi.inventory_type='GARDENING_SUPPLY'
 GROUP BY oi.product_id,oi.variant_id,oi.selling_unit
 ) ranked ORDER BY rank`;

export function salesSeriesSql(monthly) {
  return `SELECT TO_CHAR(DATE_TRUNC('${monthly?"month":"day"}',o.created_at AT TIME ZONE 'Asia/Manila'),'${monthly?"YYYY-MM":"YYYY-MM-DD"}') AS date, SUM(o.total_amount)::float8 AS revenue FROM orders o WHERE ${cohort} AND ${eligible} GROUP BY 1 ORDER BY 1`;
}

export async function loadReport(client, f, allRows=false) {
  const params=[f.from,f.to];
  const query=async sql => (await client.query(sql,params)).rows;
  const table=async (key,title,columns,sql,values=params) => {
    const total=Number((await client.query(`SELECT COUNT(*) AS n FROM (${sql}) report_rows`,values)).rows[0].n);
    const page=Math.min(f.pages[key]||1,Math.max(1,Math.ceil(total/20)));
    const rows=(await client.query(`${sql}${allRows?'':` LIMIT 20 OFFSET ${(page-1)*20}`}`,values)).rows;
    // pg numeric values must be numbers in JSON and XLSX, not currency-looking strings.
    for(const row of rows) for(const c of columns) if(c.type==='money'||c.type==='number') row[c.key]=row[c.key]==null?null:Number(row[c.key]);
    return {key,title,columns,rows,total,page,pageSize:20};
  };
  const summary=(await query(`${deliveryCTE} SELECT
    (SELECT COUNT(*)::int FROM orders o WHERE ${cohort}) AS orders,
    (SELECT COALESCE(SUM(o.total_amount),0)::float8 FROM orders o WHERE ${cohort} AND ${eligible}) AS sales,
    (SELECT COUNT(*)::int FROM orders o WHERE ${cohort} AND ${eligible}) AS transactions,
    (SELECT COUNT(*)::int FROM orders o JOIN completion c ON c.order_id=o.id WHERE o.status='Delivered'
      AND c.completed_at>=($1::date::timestamp AT TIME ZONE 'Asia/Manila') AND c.completed_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila')) AS completed,
    (SELECT COUNT(*)::int FROM orders o LEFT JOIN completion c ON c.order_id=o.id WHERE ${cohort} AND o.status='Delivered' AND c.completed_at IS NULL) AS undated_deliveries,
    (SELECT COALESCE(SUM(p.stock),0)::int FROM products p WHERE p.inventory_type='succulent' AND inventory_product_status(p)='Available' AND NOT p.legacy_quantity_review) AS plants,
    (SELECT COALESCE(SUM(CASE WHEN to_jsonb(p)->>'lettuce_stock_model'='quantity' THEN p.stock WHEN to_jsonb(p)->>'lettuce_stock_model'='batch' THEN 0 ELSE COALESCE((SELECT SUM(b.stock) FROM harvest_batches b WHERE b.product_id=p.id AND harvest_batch_sellable(b)),0) END),0)::int FROM products p WHERE p.inventory_type='edible' AND p.archived_at IS NULL AND NOT p.legacy_quantity_review) AS packs`))[0];
  const result={tab:f.tab,period:{from:f.from,to:f.to,timeZone:'Asia/Manila'},generatedAt:new Date(),summary,notes:REPORT_NOTES,tables:[],breakdowns:[],series:[]};
  const col=(key,label,type='text')=>({key,label,type});
  const orderCols=[col('order_code','Order'),col('customer','Customer'),col('created_at','Created (PHT)','date'),col('amount','Total (PHP)','money'),col('status','Current status'),col('payment_method','Payment method'),col('payment_status','Payment status'),col('method','Delivery method')];
  const orderSQL=`SELECT o.id, 'ORD-'||LPAD(o.id::text,GREATEST(3,LENGTH(o.id::text)),'0') AS order_code,o.customer_name AS customer,o.created_at,
    o.total_amount AS amount,o.status,o.payment_method,o.payment_status,o.delivery_mode AS method FROM orders o WHERE ${cohort} ORDER BY o.created_at DESC,o.id DESC`;
  if(f.tab==='sales') {
    result.series=await query(salesSeriesSql(f.monthly));
    result.tables.push(await table('products','Best-selling products',[col('rank','Rank','number'),col('product','Product / variety'),col('type','Type'),col('tag','Historical tag'),col('quantity','Units sold','number'),col('unit','Unit'),col('revenue','Item revenue (PHP)','money'),col('codes','Product / batch codes')],
      bestProductsSql));
    result.tables.push(await table('orders','Recent orders',orderCols,orderSQL));
    if((await client.query("SELECT 1 FROM products WHERE inventory_type='GARDENING_SUPPLY' LIMIT 1")).rowCount){
      result.tables.push(await table('supplySales','Gardening supplies revenue by parent',[col('product','Parent product'),col('revenue','Qualifying item revenue (PHP)','money')],`SELECT MIN(oi.product_name) AS product,SUM(oi.line_total) AS revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${cohort} AND ${eligible} AND oi.inventory_type='GARDENING_SUPPLY' GROUP BY oi.product_id,CASE WHEN oi.product_id IS NULL THEN oi.product_name END ORDER BY revenue DESC,product`));
      result.tables.push(await table('categories','Sales by historical category',[col('category','Category'),col('revenue','Qualifying item revenue (PHP)','money')],`SELECT CASE oi.inventory_type WHEN 'GARDENING_SUPPLY' THEN COALESCE(oi.product_tag,'Gardening Supplies') WHEN 'edible' THEN 'Lettuce' WHEN 'succulent' THEN 'Succulents' ELSE 'Unknown' END AS category,SUM(oi.line_total) AS revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${cohort} AND ${eligible} GROUP BY 1 ORDER BY revenue DESC,category`));
    }

  }
  if(f.tab==='orders') {
    result.breakdowns=await query(`WITH counts AS (SELECT o.status,COUNT(*)::int AS n FROM orders o WHERE ${cohort} GROUP BY o.status),
      labels AS (SELECT status FROM counts UNION SELECT UNNEST(ARRAY['Pending','Preparing','Out for Delivery','Delivered','Cancelled','Cancellation Requested']))
      SELECT labels.status AS label,COALESCE(counts.n,0) AS count FROM labels LEFT JOIN counts USING(status) ORDER BY label`);
    result.tables.push(await table('orders','Order details · current status of creation cohort',orderCols,orderSQL));
  }
  if(f.tab==='inventory') {
    result.tables.push(await table('movements','Recorded inventory movement totals',[col('product','Product'),col('code','Code'),col('type','Type'),col('batch','Batch / variant'),col('unit','Physical unit'),col('beginning','Beginning physical'),col('stock_in','Stock In','number'),col('stock_out','Stock Out','number'),col('fulfilled','Recorded fulfilled (dated only)','number'),col('disposal','Disposal','number'),col('ending','Ending physical')],
      `${deliveryCTE}, flows AS (SELECT m.product_name AS product,m.product_code AS code,p.inventory_type AS type,COALESCE(m.variant_name,b.batch_code,'-') AS batch,COALESCE(m.stock_unit,CASE WHEN p.inventory_type='edible' THEN '400g packs' ELSE 'plants' END) AS unit,
        SUM(CASE WHEN m.action IN ('Stock In','Stock Initialized') THEN GREATEST(0,m.new_quantity-m.previous_quantity) WHEN m.action='Product Added' AND m.batch_id IS NULL AND p.inventory_type='succulent' THEN GREATEST(0,m.new_quantity) ELSE 0 END) AS stock_in,
        SUM(CASE WHEN m.action='Stock Out' THEN GREATEST(0,m.previous_quantity-m.new_quantity) ELSE 0 END) AS stock_out,
        SUM(CASE WHEN m.action='Disposal Confirmed' THEN GREATEST(0,m.previous_quantity-m.new_quantity) ELSE 0 END) AS disposal
        FROM inventory_movements m JOIN products p ON p.id=m.product_id LEFT JOIN harvest_batches b ON b.id=m.batch_id WHERE ${movementPeriod}
        GROUP BY m.product_name,m.product_code,p.inventory_type,b.batch_code,m.variant_name,m.stock_unit), fulfilled AS (
        SELECT oi.product_name AS product,COALESCE(oi.variant_sku,oi.product_code,'Unavailable') AS code,COALESCE(oi.inventory_type,'Unknown') AS type,COALESCE(oi.variant_name,oi.batch_code,'-') AS batch,CASE WHEN oi.inventory_type='GARDENING_SUPPLY' THEN CASE WHEN oi.stock_factor>1 THEN 'loose pieces' ELSE oi.selling_unit END WHEN oi.inventory_type='edible' THEN '400g packs' ELSE 'plants' END AS unit,SUM(oi.qty*COALESCE(oi.stock_factor,1)) AS quantity
        FROM orders o JOIN completion c ON c.order_id=o.id JOIN order_items oi ON oi.order_id=o.id WHERE o.status='Delivered'
        AND c.completed_at>=($1::date::timestamp AT TIME ZONE 'Asia/Manila') AND c.completed_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila')
        GROUP BY oi.product_name,oi.product_code,oi.inventory_type,oi.batch_code,oi.variant_sku,oi.variant_name,oi.stock_factor,oi.selling_unit)
        SELECT COALESCE(a.product,b.product) AS product,COALESCE(a.code,b.code) AS code,COALESCE(a.type,b.type) AS type,COALESCE(a.batch,b.batch) AS batch,COALESCE(a.unit,b.unit) AS unit,
        'Historical stock unavailable' AS beginning,'Historical stock unavailable' AS ending,
        COALESCE(a.stock_in,0) AS stock_in,COALESCE(a.stock_out,0) AS stock_out,COALESCE(a.disposal,0) AS disposal,b.quantity AS fulfilled
        FROM flows a FULL JOIN fulfilled b ON (a.product,a.code,a.type,a.batch)=(b.product,b.code,b.type,b.batch) ORDER BY code,batch,product`));
    // Current sellability is computed from live batch rules; reading never updates caches.
    const alertSQL=`WITH batches AS (SELECT b.*,harvest_batch_status(b) AS state,
      b.stock+b.reserved_stock+COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE
      (oi.batch_id=b.id OR (oi.batch_id IS NULL AND oi.product_id=b.product_id AND b.legacy_import)) AND o.inventory_state IN ('committed','legacy') AND o.inventory_restored_at IS NULL AND o.status IN ('Pending','Preparing','Cancellation Requested')),0) AS physical
      FROM harvest_batches b), alerts AS (
      SELECT p.name AS product,p.product_code AS code,p.inventory_type AS type,b.batch_code AS batch,b.state AS issue,b.physical AS quantity,'400g packs' AS unit
      FROM batches b JOIN products p ON p.id=b.product_id WHERE to_jsonb(p)->>'lettuce_stock_model' IS NULL AND p.archived_at IS NULL AND b.state IN ('Aging','On Hold','Unverified','Unsellable','For Disposal') AND b.physical>0
      UNION ALL SELECT p.name,p.product_code,p.inventory_type,'-',CASE WHEN s.available=0 THEN 'Out of Stock' ELSE 'Low Stock' END,s.available,
      CASE WHEN p.inventory_type='edible' THEN '400g packs' ELSE 'plants' END FROM products p CROSS JOIN LATERAL
      (SELECT CASE WHEN p.inventory_type='edible' AND to_jsonb(p)->>'lettuce_stock_model'='batch' THEN 0 WHEN p.inventory_type='edible' AND to_jsonb(p)->>'lettuce_stock_model' IS NULL THEN COALESCE((SELECT SUM(b.stock) FROM harvest_batches b WHERE b.product_id=p.id AND harvest_batch_sellable(b)),0) ELSE p.stock END AS available) s
      WHERE p.archived_at IS NULL AND p.inventory_type<>'GARDENING_SUPPLY' AND NOT p.legacy_quantity_review AND (p.inventory_type='edible' OR inventory_product_status(p) NOT IN ('Sold','Reserved'))
        AND (s.available=0 OR (p.inventory_type='edible' AND s.available<=p.low_stock_threshold))
      UNION ALL SELECT p.name,v.sku,p.inventory_type,v.name,CASE WHEN s.stock IS NULL THEN 'Awaiting Stock Entry' WHEN FLOOR(s.stock::numeric/v.stock_factor)=0 THEN 'Out of Stock' ELSE 'Low Stock' END,FLOOR(s.stock::numeric/v.stock_factor),v.selling_unit FROM supply_variants v JOIN products p ON p.id=v.product_id LEFT JOIN supply_stock_pools s ON s.id=v.pool_id WHERE p.archived_at IS NULL AND v.archived_at IS NULL AND (s.stock IS NULL OR FLOOR(s.stock::numeric/v.stock_factor)<=v.low_stock_threshold)
    ) SELECT * FROM alerts ORDER BY issue,code,batch`;
    result.tables.push(await table('alerts','Current inventory alerts',[col('product','Product'),col('code','Code'),col('type','Type'),col('batch','Batch'),col('issue','Issue'),col('quantity','Physical / available','number'),col('unit','Unit')],alertSQL,[]));
    result.tables.push(await table('disposals','Confirmed disposals · recording date',[col('created_at','Recorded (PHT)','date'),col('product','Product'),col('code','Code'),col('batch','Batch'),col('quantity','Disposed packs','number'),col('reason','Reason')],
      `SELECT m.created_at,m.product_name AS product,m.product_code AS code,b.batch_code AS batch,GREATEST(0,m.previous_quantity-m.new_quantity) AS quantity,m.reason FROM inventory_movements m LEFT JOIN harvest_batches b ON b.id=m.batch_id WHERE ${movementPeriod} AND m.action='Disposal Confirmed' ORDER BY m.created_at DESC,m.id DESC`));
  }
  if(f.tab==='inventory'&&(await client.query("SELECT 1 FROM products WHERE inventory_type='GARDENING_SUPPLY' LIMIT 1")).rowCount){
    result.tables.push(await table('supplyVariants','Gardening supplies - selling-unit availability',[col('product','Product'),col('variant','Variant'),col('sku','SKU'),col('price','Current price (PHP)','money'),col('unit','Selling unit'),col('available','Available selling units','number'),col('threshold','Low-stock threshold','number'),col('pool','Shared / physical pool')],`SELECT p.name AS product,v.name AS variant,v.sku,v.price,v.selling_unit AS unit,CASE WHEN p.archived_at IS NULL AND v.archived_at IS NULL THEN FLOOR(s.stock::numeric/v.stock_factor) ELSE 0 END AS available,v.low_stock_threshold AS threshold,v.pool_id AS pool FROM supply_variants v JOIN products p ON p.id=v.product_id LEFT JOIN supply_stock_pools s ON s.id=v.pool_id ORDER BY p.name,v.id`,[]));
    result.tables.push(await table('supplyPools','Gardening supplies - physical pools (counted once)',[col('product','Product'),col('pool','Pool'),col('unit','Physical unit'),col('available','Unallocated physical stock','number'),col('reserved','Payment-reserved physical stock','number')],`SELECT p.name AS product,s.id AS pool,s.unit,s.stock AS available,s.reserved_stock AS reserved FROM supply_stock_pools s JOIN products p ON p.id=s.product_id WHERE EXISTS(SELECT 1 FROM supply_variants v WHERE v.pool_id=s.id) ORDER BY p.name,s.id`,[]));
  }
  if(f.tab==='delivery') {
    result.breakdowns=await query(`SELECT o.delivery_mode||' · '||o.status AS label,COUNT(*)::int AS count FROM orders o WHERE ${cohort} GROUP BY o.delivery_mode,o.status ORDER BY 1`);
    result.deliverySummary=(await query(`SELECT COUNT(*)::int AS shipments,COUNT(*) FILTER(WHERE o.status='Delivered')::int AS delivered,COUNT(*) FILTER(WHERE o.status='Out for Delivery')::int AS in_progress FROM orders o WHERE ${cohort}`))[0];
    result.carriers=await query(`SELECT CASE WHEN o.delivery_mode='logistics' THEN COALESCE(NULLIF(o.courier_name,''),'Unassigned courier') ELSE COALESCE(NULLIF(TRIM(CONCAT_WS(' ',r.first_name,r.last_name)),''),'Unassigned rider') END AS carrier,
      COUNT(*)::int AS assigned,COUNT(*) FILTER(WHERE o.status='Delivered')::int AS completed FROM orders o LEFT JOIN riders r ON r.id=o.rider_id WHERE ${cohort} GROUP BY 1 ORDER BY 1`);
    result.tables.push(await table('shipments','Shipment details · order-creation cohort',[col('order_code','Order'),col('method','Method'),col('carrier','Rider / courier'),col('status','Order status'),col('tracking_status','Shipment status'),col('assigned_at','Assigned (PHT)','date'),col('completed_at','Recorded completion (PHT)','date'),col('dispatch','Dispatch'),col('duration','Duration')],
      `${deliveryCTE} SELECT o.id,'ORD-'||LPAD(o.id::text,GREATEST(3,LENGTH(o.id::text)),'0') AS order_code,o.delivery_mode AS method,
      CASE WHEN o.delivery_mode='logistics' THEN COALESCE(NULLIF(o.courier_name,''),'Unassigned') ELSE COALESCE(NULLIF(TRIM(CONCAT_WS(' ',r.first_name,r.last_name)),''),'Unassigned') END AS carrier,
      o.status,o.tracking_status,o.driver_assigned_at AS assigned_at,CASE WHEN o.status='Delivered' THEN c.completed_at END AS completed_at,'Unavailable' AS dispatch,'Unavailable' AS duration
      FROM orders o LEFT JOIN riders r ON r.id=o.rider_id LEFT JOIN completion c ON c.order_id=o.id WHERE ${cohort} ORDER BY o.created_at DESC,o.id DESC`));
  }
  return result;
}
