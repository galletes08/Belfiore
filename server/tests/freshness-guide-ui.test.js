import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

test('Freshness guide reuses recorded batch classifications and renders reference and affected records safely',async t=>{
  const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try{
    const {default:Guide,FreshnessAffectedBatches:List,freshnessAttention}=await vite.ssrLoadModule('/src/admin/LettuceFreshnessGuide.jsx');
    const render=(Component,props)=>renderToStaticMarkup(createElement(Component,props));
    const batch=(id,status,age)=>({id,batch_code:'HB-'+id,status,age_days:age,harvest_date:age==null?null:'2026-10-01',physical_stock:10,available_stock:status==='Aging'?10:0,reserved_stock:0,allocated_stock:0,condition:status});
    const product={id:12,name:'Actual fixture lettuce',productCode:'BF-000012',inventoryType:'edible',batches:[batch(1,'Aging',8),batch(2,'On Hold',14),batch(3,'For Disposal',21),batch(4,'Unverified',null)]};
    await t.test('Lifecycle opens by default with four exact thresholds, quality reminders and close action',()=>{
      const html=render(Guide,{products:[],onOpenBatch:()=>{},onClose:()=>{}});
      for(const label of ['Day 0–7','Day 8–13','Day 14–20','Day 21+','Physical Quality Guidelines','400g','Asia/Manila','Lifecycle Guide','Affected Batches','Close'])assert.ok(html.includes(label),label);
      assert.match(html,/id="freshness-tab-guide"[^>]*aria-selected="true"/);
      assert.ok(!html.includes('Automatically discount'));
    });
    await t.test('Empty and API error states are explicit; no fabricated batches appear',()=>{
      assert.match(render(List,{products:[],onOpenBatch:()=>{}}),/No lettuce batches currently require freshness attention/);
      assert.match(render(List,{products:[product],error:'Network unavailable',onOpenBatch:()=>{}}),/role="alert"/);
    });
    await t.test('Only real supplied affected lettuce batches are listed, de-duplicated and without stock changes',()=>{
      const original=JSON.stringify(product),extra={...product,id:13,inventoryType:'GARDENING_SUPPLY'};
      assert.equal(freshnessAttention([product,product,extra]).length,4);
      assert.equal(freshnessAttention([{...product,batches:[batch(8,'Fresh',7),{...batch(9,'Aging',8),physical_stock:0}]}]).length,0);
      const html=render(List,{products:[product],onOpenBatch:()=>{throw Error('Rendering must not launch actions');}});
      for(const label of ['Inspect Batch','Review Quality','Record Disposal','BF-000012','HB-3','Available Packs','Physical Quantity','Reserved / Allocated'])assert.ok(html.includes(label),label);
      assert.ok(html.includes('Unverified'));assert.ok(!html.includes('null days'));assert.equal(JSON.stringify(product),original);
    });
    await t.test('Archived products provide a read-only batch details path',()=>{
      const html=render(List,{products:[{...product,archivedAt:'2026-10-01'}],onOpenBatch:()=>{}});
      assert.match(html,/View Batch Details/);assert.ok(!html.includes('>Record Disposal<'));
    });
  }finally{await vite.close();}
});
