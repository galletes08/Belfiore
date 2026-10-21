import test from 'node:test';
import assert from 'node:assert/strict';
import { compareInventoryProducts, isOutOfStock } from '../../shared/inventoryRules.js';
import { inventoryAttention } from '../../src/utils/inventoryAttention.js';
import { matchesInventoryFilter } from '../../src/utils/inventory.js';

test('All Products priority sorting precedes pagination and uses timestamp/ID ties', () => {
  const available = Array.from({length: 41}, (_, id) => ({id:id+1, inventoryType:'succulent', status:'Available',stock:1,createdAt:'2026-10-01'}));
  const sold = {id:99,inventoryType:'succulent',status:'Sold',stock:0,name:'Sold Aloe',productCode:'BF-99',createdAt:'2026-10-15'};
  const reserved = {id:80,status:'Reserved',stock:0,reservedStock:1};
  const low = {id:81,inventoryType:'edible',status:'Low Stock',stock:2};
  const rows = [sold,low,reserved,...available].sort(compareInventoryProducts);
  assert.equal(rows[0].id,41);
  assert.equal(rows.slice(20,40).some(p=>p.status==='Sold'),false);
  assert.deepEqual(rows.slice(-3).map(p=>p.id),[80,81,99]);
  assert.equal(rows.filter(p=>matchesInventoryFilter(p,'Sold'))[0],sold);
  assert.equal(rows.filter(p=>`${p.name} ${p.productCode}`.includes('BF-99'))[0],sold);
  assert.equal(compareInventoryProducts({...available[0],createdAt:'2026-10-02'},available[1])<0,true);
});

test('Normal sold plants produce no stock alerts or attention; edible and legacy problems remain', () => {
  const sold = [1,2].map(id=>({id,inventoryType:'succulent',status:'Sold',stock:0}));
  assert.equal(sold.filter(isOutOfStock).length,0);
  assert.deepEqual(inventoryAttention(sold),[]);
  const held = {id:3,inventoryType:'edible',stock:0,status:'Out of Stock',batches:[{id:10,status:'On Hold',physical_stock:4},{id:11,status:'For Disposal',physical_stock:2},{id:12,status:'Aging',physical_stock:0}]};
  const low = {id:4,inventoryType:'edible',stock:2,status:'Low Stock',batches:[{id:13,status:'Aging',physical_stock:2}]};
  const reserved = {id:5,inventoryType:'succulent',stock:0,status:'Reserved'};
  const archived = {...held,id:6,archivedAt:'2026-10-15'};
  const legacy = {id:7,inventoryType:'succulent',stock:2,status:'Unavailable',legacyQuantityReview:true};
  const empty = {id:8,inventoryType:'edible',stock:0,status:'Out of Stock',batches:[]};
  assert.equal([held,low,reserved,archived,legacy,empty].filter(isOutOfStock).length,2);
  const records = inventoryAttention([...sold,held,held,low,reserved,archived,legacy,empty]);
  assert.equal(records.reduce((n,r)=>n+r.count,0),5);
  assert.equal(records.find(r=>r.product.id===3).count,2);
  assert.equal(isOutOfStock({...sold[0],status:'Archived',soldAt:'2026-10-15'}),false);
});
