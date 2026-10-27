import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {inventoryRows,staffInventoryProduct} from '../../src/utils/inventoryPresentation.js';
import {inventoryAttention} from '../../src/utils/inventoryAttention.js';

const products=[
 {id:1,name:'Sold Aloe',productCode:'BF-001',inventoryType:'succulent',stock:0,reservedStock:0,status:'Sold',soldAt:'2026-10-20T00:00:00Z',price:500},
 {id:2,name:'Reserved Aloe',productCode:'BF-002',inventoryType:'succulent',stock:0,reservedStock:1,status:'Reserved',price:600},
 {id:3,name:'Available Aloe',productCode:'BF-003',inventoryType:'succulent',stock:1,reservedStock:0,status:'Available',price:700,tag:'Green'},
 {id:4,name:'Romaine',productCode:'BF-004',inventoryType:'edible',lettuceStockModel:'quantity',stock:2,reservedStock:3,committedStock:1,status:'Low Stock',price:130},
 {id:5,name:'Potting Mix',productCode:'BF-005',inventoryType:'GARDENING_SUPPLY',stock:1,status:'Low Stock',price:30,stockLabel:'1 kg: 2 Bag',variants:[{id:51,name:'1 kg',sku:'MIX-1KG',available_stock:2,selling_unit:'Bag',status:'Low Stock',price:30,variant_reserved:1,variant_committed:2},{id:52,name:'Old variant',sku:'OLD',archived_at:'2026-01-01',status:'Archived',price:25}]},
 {id:6,name:'Archived Aloe',productCode:'BF-006',inventoryType:'succulent',stock:1,status:'Archived',archivedAt:'2026-10-20',price:900},
];
test('Shared inventory filters and ordering retain sold/history records without counting sold/reserved plants as stock alerts',()=>{
 assert.deepEqual(inventoryRows(products).map(p=>p.id),[3,2,5,4,1]);
 assert.deepEqual(inventoryRows(products,{filter:'Archived'}).map(p=>p.id),[6]);
 assert.deepEqual(inventoryRows(products,{filter:'Sold'}).map(p=>p.id),[1]);
 assert.deepEqual(inventoryRows(products,{filter:'Reserved'}).map(p=>p.id),[2,4]);
 assert.deepEqual(inventoryRows(products,{filter:'Gardening Supplies',search:'mix-1kg'}).map(p=>p.id),[5]);
 assert.deepEqual(inventoryRows(products,{filter:'White Tag'}),[]);
 assert.deepEqual(inventoryRows(products,{filter:'Needs Attention'}).map(p=>p.id),[4,5]);
 assert.equal(inventoryAttention(products).reduce((sum,p)=>sum+p.count,0),2);
});
test('Staff stock adapter retains actual variant availability, reservations and creator-only setup metadata',()=>{
 const p=staffInventoryProduct(products[4],[5]);assert.equal(p.can_initialize_stock,true);assert.equal(p.variants.length,1);assert.equal(p.variants[0].available,2);assert.equal(p.variants[0].reserved,3);assert.equal(p.variants[0].unit,'Bag');assert.equal(staffInventoryProduct(products[4],[]).can_initialize_stock,false);
 const lettuce=staffInventoryProduct(products[3]);assert.equal(lettuce.lettuce_stock_model,'quantity');assert.equal(lettuce.allocated_stock,1);assert.equal(lettuce.reserved_stock,3);
});
test('Shared inventory presentation and Staff permissions render accurate summary, alerts and read-only product details',async t=>{
 const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
 try{
  const {default:Overview,InventoryAttentionDetails,InventoryProductDetails}=await vite.ssrLoadModule('/src/admin/InventoryOverview.jsx');const {default:Staff}=await vite.ssrLoadModule('/src/staff/StaffInventory.jsx');
  const noop=()=>{},summary={totalProducts:5,succulentUnits:1,ediblePacks:2,lowStock:2,outOfStock:0};
  const props={products,summary,rows:inventoryRows(products),page:1,pages:1,setPage:noop,search:'',setSearch:noop,filter:'All Products',setFilter:noop,notification:null,headerActions:null,renderActions:()=>null,onAttention:noop};
  await t.test('One component displays both workspaces with the same summary, table and full filter set',()=>{
   const html=renderToStaticMarkup(createElement(Overview,props));
   for(const text of ['1 plants','2 packs','Needs Attention','Low Stock: 2','Out of Stock: 0','Sold Aloe','Reserved Aloe','per 400g pack','1 kg: 2 Bag','Archived','White Tag','Updates automatically'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('Archived Aloe'));assert.ok(html.includes('sm:grid-cols-2 lg:grid-cols-4'));assert.ok(html.includes('overflow-x-auto'));
  });
  await t.test('Staff uses the actual overview and keeps Admin-only controls absent',()=>{
   const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(Staff,{overview:{products,summary},products:products.map(p=>staffInventoryProduct(p,[])),refresh:noop,stockFormComponent:()=>null})));
   for(const text of ['1 plants','2 packs','BF-001','BF-005','Inventory filter','View inventory items needing attention','More actions for'])assert.ok(html.includes(text),text);
   for(const text of ['Admin inventory setup','Import Supply Catalog','>Edit</button>','>Archive</button>'])assert.ok(!html.includes(text),text);
  });
  await t.test('Alert details show only affected entries and supply detail uses variant units rather than parent stock flags',()=>{
   const alerts=renderToStaticMarkup(createElement(InventoryAttentionDetails,{products,onDetails:noop}));assert.ok(alerts.includes('Romaine'));assert.ok(alerts.includes('1 kg: Low Stock'));assert.ok(!alerts.includes('Sold Aloe'));assert.ok(!alerts.includes('Reserved Aloe'));
   const details=renderToStaticMarkup(createElement(InventoryProductDetails,{product:products[4]}));assert.ok(details.includes('1 kg: 2 Bag'));assert.ok(details.includes('MIX-1KG'));assert.ok(details.includes('By variant'));
  });
 }finally{await vite.close();}
});
