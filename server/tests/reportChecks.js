import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {inflateSync} from 'node:zlib';
import {inventoryAttention} from '../../src/utils/inventoryAttention.js';

export async function checkReports({t,pool,request,fetch,base,token}) {
  const q='preset=custom&fromDate=2001-01-02&toDate=2001-01-02';
  const orders=[];
  async function seed(at,status='Delivered',payment='Paid',method='COD',cod='Collected',amount=100,verified=false) {
    const row=(await pool.query(`INSERT INTO orders(customer_name,gmail,created_at,status,payment_status,payment_method,cod_status,total_amount,paymongo_paid_at,paymongo_payment_id)
      VALUES('Report Fixture','reports@example.com',$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[at,status,payment,method,cod,amount,verified?at:null,verified?'payment_report_fixture':null])).rows[0];orders.push(row);return row;
  }
  const start=await seed('2001-01-01T16:00:00Z');
  const end=await seed('2001-01-02T15:59:59.999Z','Delivered','Paid','ONLINE','Not Applicable',200,true);
  await seed('2001-01-01T15:59:59.999Z');await seed('2001-01-02T16:00:00Z');
  await seed('2001-01-02T00:00Z','Cancelled');
  await seed('2001-01-02T00:00Z','Delivered','Unpaid');
  await seed('2001-01-02T00:00Z','Delivered','Failed');
  await seed('2001-01-02T00:00Z','Delivered','Refunded');
  await seed('2001-01-02T00:00Z','Delivered','Refund Pending');
  await seed('2001-01-02T00:00Z','Pending');
  await seed('2001-01-02T00:00Z','Delivered','Paid','ONLINE'); // no verification
  await seed('2001-01-02T00:00Z','Delivered','Paid','COD','Remittance Pending');
  for(let i=0;i<22;i++) await seed('2001-01-02T01:00Z','Preparing','Unpaid');
  await pool.query(`INSERT INTO order_items(order_id,product_name,product_code,inventory_type,product_tag,batch_code,qty,unit_price,line_total) VALUES
    ($1,'Romaine','OLD-LETTUCE','edible',NULL,'HB-ONE',2,40,80),
    ($1,'Aloe','PLANT-A','succulent','Green',NULL,1,20,20),
    ($2,'Romaine','OTHER-LETTUCE','edible',NULL,'HB-TWO',2,50,100),
    ($2,'Aloe','PLANT-B','succulent','Green',NULL,1,100,100)`,[start.id,end.id]);
  // Separate recorded completion and creation dates prove the card is not creation-dated.
  await pool.query(`INSERT INTO order_delivery_history(order_id,previous_status,new_status,actor,created_at) VALUES
    ($1,'Out for Delivery','Delivered','Report Test','2001-01-02T15:59:59.999Z'),
    ($1,'Out for Delivery','Delivered','Report Test','2001-01-02T15:59:59.999Z'),
    ($2,'Out for Delivery','Delivered','Report Test','2001-01-03T00:00Z')`,[start.id,end.id]);
  const product=(await pool.query("SELECT id,product_code FROM products WHERE inventory_type='edible' ORDER BY id LIMIT 1")).rows[0];
  const batch=(await pool.query('SELECT id FROM harvest_batches WHERE product_id=$1 ORDER BY id LIMIT 1',[product.id])).rows[0];
  for(const [action,previous,next] of [['Stock In',10,20],['Stock Out',20,17],['Disposal Confirmed',17,15],['Batch Sold / Allocated',15,12]])
    await pool.query(`INSERT INTO inventory_movements(product_id,product_code,product_name,batch_id,action,previous_quantity,new_quantity,previous_reserved,new_reserved,new_status,reason,actor,created_at)
      VALUES($1,$2,'Report Movement',$3,$4,$5,$6,0,0,'Available','Report fixture','Test','2001-01-02T00:00Z')`,[product.id,product.product_code,batch.id,action,previous,next]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
  const low=await request('/api/products','POST',{inventoryType:'edible',name:'Dashboard Romaine threshold fixture',tag:'aquaponics',stock:9,price:130,lowStockThreshold:10,harvestDate:today});
  assert.equal(low.status,201,JSON.stringify(low.body));
  const inventory=(await request('/api/admin/inventory')).body;
  const expectedAttention=inventoryAttention(inventory.products).reduce((n,i)=>n+i.count,0);
  const before=(await pool.query(`SELECT (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o) AS orders,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM products p) AS products,
    (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM harvest_batches b) AS batches,
    (SELECT COUNT(*) FROM inventory_movements) AS movements`)).rows[0];
  let sales;
  await t.test('Reports reconcile verified COD/online sales, exclusions, historical prices and inclusive Manila boundaries',async()=>{
    const response=await request('/api/admin/reports?'+q);assert.equal(response.status,200,JSON.stringify(response.body));sales=response.body;
    assert.equal(sales.summary.sales,300);assert.equal(sales.summary.transactions,2);assert.equal(sales.summary.orders,32);
    assert.equal(sales.summary.completed,1);assert.equal(sales.series.length,1);assert.equal(sales.series[0].revenue,300);
    const products=sales.tables.find(t=>t.key==='products').rows;assert.equal(products.length,2);
    assert.equal(products.find(p=>p.product==='Romaine').quantity,4);assert.equal(products.find(p=>p.product==='Romaine').revenue,180);
    const aloe=products.find(p=>p.product==='Aloe');assert.equal(aloe.quantity,2);assert.equal(aloe.revenue,120);assert.match(aloe.codes,/PLANT-A/);assert.match(aloe.codes,/PLANT-B/);
    const expected=(await pool.query("SELECT COALESCE(SUM(stock),0)::int AS n FROM products p WHERE inventory_type='succulent' AND inventory_product_status(p)='Available' AND NOT legacy_quantity_review")).rows[0].n;
    assert.equal(sales.summary.plants,expected);
    const packs=(await pool.query("SELECT COALESCE(SUM(b.stock),0)::int AS n FROM harvest_batches b JOIN products p ON p.id=b.product_id WHERE p.archived_at IS NULL AND NOT p.legacy_quantity_review AND harvest_batch_sellable(b)")).rows[0].n;
    assert.equal(sales.summary.packs,packs);
  });
  await t.test('Report tabs paginate on the database, preserve status cohort and expose empty states',async()=>{
    for(const tab of ['inventory','orders','delivery']) {
      const r=await request(`/api/admin/reports?${q}&tab=${tab}`);assert.equal(r.status,200,JSON.stringify(r.body));
      if(tab==='orders') {assert.equal(r.body.tables[0].rows.length,20);assert.equal(r.body.breakdowns.reduce((n,b)=>n+b.count,0),32);assert.equal(r.body.tables[0].total,32);}
      if(tab==='delivery') {assert.equal(r.body.deliverySummary.shipments,32);assert.equal(r.body.tables[0].rows.length,20);}
      if(tab==='inventory') {
        const rows=r.body.tables.find(t=>t.key==='movements').rows;
        const m=rows.find(row=>row.product==='Report Movement');assert.equal(m.stock_in,10);assert.equal(m.stock_out,3);assert.equal(m.disposal,2);assert.equal(m.beginning,'Historical stock unavailable');
        assert.equal(rows.find(row=>row.code==='OLD-LETTUCE').fulfilled,2); // repeated completion events count once
        assert.equal(r.body.tables.find(t=>t.key==='disposals').rows[0].quantity,2);
        const alerts=r.body.tables.find(t=>t.key==='alerts').rows;
        const sold=(await pool.query("SELECT product_code FROM products p WHERE inventory_type='succulent' AND inventory_product_status(p)='Sold'")).rows;
        assert.ok(!alerts.some(a=>sold.some(p=>p.product_code===a.code)));
      }
    }
    const page=(await request(`/api/admin/reports?${q}&tab=orders&ordersPage=2`)).body.tables[0];assert.equal(page.rows.length,12);assert.equal(page.page,2);
    const empty=(await request('/api/admin/reports?preset=custom&fromDate=1990-01-01&toDate=1990-01-01')).body;assert.equal(empty.summary.sales,0);assert.deepEqual(empty.series,[]);assert.equal(empty.tables[0].total,0);
  });
  await t.test('Reports and downloads reject unauthenticated, customer and rider access and invalid filters',async()=>{
    for(const path of ['/api/admin/reports','/api/admin/reports/export?format=pdf','/api/admin/reports/export?format=xlsx']) {
      assert.equal((await fetch(base+path)).status,401);
      for(const role of ['customer','rider']) assert.equal((await request(path,'GET',undefined,role)).status,403);
    }
    for(const qs of ['preset=custom&fromDate=2001-02-29&toDate=2001-03-01','preset=custom&fromDate=2001-02-02&toDate=2001-02-01','preset=no','tab=wrong','ordersPage=-1',"preset=custom&fromDate=2001-01-01%27&toDate=2001-01-02"])
      assert.equal((await request('/api/admin/reports?'+qs)).status,400);
    assert.equal((await request('/api/admin/reports/export?format=csv')).status,400);
  });
  await t.test('PDF and editable XLSX exports share report values, include all pages and omit sensitive fields',async()=>{
    for(const tab of ['sales','inventory','orders','delivery']) for(const format of ['pdf','xlsx']) {
      const r=await fetch(`${base}/api/admin/reports/export?${q}&tab=${tab}&ordersPage=2&format=${format}`,{headers:{Authorization:'Bearer '+token('admin')}});
      assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const bytes=Buffer.from(await r.arrayBuffer());
      if(format==='pdf') {
        assert.equal(bytes.subarray(0,4).toString(),'%PDF');assert.ok(bytes.length>1500);
        const source=bytes.toString('latin1');let content='';
        for(const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
          try {const stream=inflateSync(Buffer.from(match[1],'latin1')).toString('latin1');
            content+=[...stream.matchAll(/<([0-9a-f]+)>/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('');
          } catch { /* Font/image streams are not text. */ }
        }
        assert.match(content,/Belfiore/);assert.match(content,/300/);assert.match(content,/2001-01-02/);
        if(tab==='orders') {assert.ok((source.match(/\/Type \/Page\b/g)||[]).length>1);assert.equal((content.match(/Report Fixture/g)||[]).length,32);}
        assert.ok(!content.includes('reports@example.com'));assert.ok(!content.includes('payment_report_fixture'));
      }
      else {
        const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
        const summary=book.getWorksheet('Report summary');assert.equal(summary.getCell('B5').value,300);assert.ok(summary.getCell('B4').value instanceof Date);
        if(tab==='orders') {const sheet=book.worksheets.find(s=>s.getCell('A1').value==='Order');assert.equal(sheet.rowCount,33);assert.ok(sheet.getCell('C2').value instanceof Date);assert.equal(typeof sheet.getCell('D2').value,'number');assert.ok(sheet.autoFilter);}
        const cells=[];for(const sheet of book.worksheets) sheet.eachRow(row=>cells.push(...row.values.map(String)));
        assert.ok(!cells.join(' ').includes('reports@example.com'));assert.ok(!cells.join(' ').includes('payment_report_fixture'));
      }
    }
  });
  await t.test('Dashboard reconciles monthly cards, AOV, chart and Top 5 with Reports, and uses configured stock thresholds',async()=>{
    const dashboard=await request('/api/admin/dashboard?year=2001&month=1&period=month');assert.equal(dashboard.status,200,JSON.stringify(dashboard.body));const d=dashboard.body;
    const month=(await request('/api/admin/reports?preset=month')).body;
    assert.equal(d.totals.monthlySales,month.summary.sales);assert.equal(d.totals.monthlyOrders,month.summary.orders);assert.equal(d.totals.qualifyingOrders,month.summary.transactions);
    assert.equal(d.totals.averageOrderValue,month.summary.transactions?month.summary.sales/month.summary.transactions:0);
    assert.equal(d.salesData.reduce((n,p)=>n+p.revenue,0),300+200); // includes one eligible order just before and after selected day
    const monthlyReport=(await request('/api/admin/reports?preset=custom&fromDate=2001-01-01&toDate=2001-01-31')).body;
    assert.deepEqual(d.salesData,monthlyReport.series);assert.deepEqual(d.topProducts,monthlyReport.tables.find(t=>t.key==='products').rows.slice(0,5));
    assert.equal(d.attention.inventoryCount,expectedAttention);
    const expectedOrders=Number((await pool.query("SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Cancellation Requested') OR payment_status='Refund Pending' OR cod_status='Remittance Pending' OR NULLIF(inventory_reconciliation_reason,'') IS NOT NULL")).rows[0].n);
    assert.equal(d.totals.needsAttention,expectedAttention+expectedOrders);
    const alert=d.lowStock.find(a=>Number(a.productId)===Number(low.body.id));assert.equal(alert.qty,9);assert.equal(alert.threshold,10);
    assert.equal(d.recentOrders.length,5);
    const newest=(await pool.query('SELECT id FROM orders ORDER BY created_at DESC,id DESC LIMIT 5')).rows.map(o=>o.id);assert.deepEqual(d.recentOrders.map(o=>o.id),newest);
    const year=await request('/api/admin/dashboard?period=year&year=2001');assert.equal(year.status,200);assert.equal(year.body.salesData[0].date,'2001-01');assert.equal(year.body.salesData[0].revenue,500);
    assert.equal((await fetch(base+'/api/admin/dashboard')).status,401);
    for(const role of ['customer','rider'])assert.equal((await request('/api/admin/dashboard','GET',undefined,role)).status,403);
    for(const qs of ['period=invalid','year=bad','month=13'])assert.equal((await request('/api/admin/dashboard?'+qs)).status,400);
  });
  await t.test('Report generation does not change orders, products, batches or movement history',async()=>{
    const after=(await pool.query(`SELECT (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o) AS orders,
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM products p) AS products,
      (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM harvest_batches b) AS batches,
      (SELECT COUNT(*) FROM inventory_movements) AS movements`)).rows[0];assert.deepEqual(after,before);
  });
}
