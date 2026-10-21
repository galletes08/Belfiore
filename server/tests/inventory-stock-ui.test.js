import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {ArrowDownToLine,ArrowUpFromLine} from 'lucide-react';

test('Inventory stock components render optional menu icons and incomplete supply setup safely',async t=>{
 const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',
  esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
 try{
  const {InventoryMenuItems}=await vite.ssrLoadModule('/src/admin/InventoryActionMenu.jsx');
  const {default:GardeningSupplies}=await vite.ssrLoadModule('/src/admin/GardeningSupplies.jsx');
  const render=(Component,props)=>renderToStaticMarkup(createElement(Component,props));
  await t.test('Stock menu renders supply actions even when an optional item icon is absent',()=>{
   const html=render(InventoryMenuItems,{items:[{label:'Stock In / Stock Out',action:()=>{}},{label:'Manage Variants',action:()=>{}},{label:'View Stock History',action:()=>{}}],onSelect:()=>{}});
   assert.match(html,/Stock In \/ Stock Out/);assert.match(html,/Manage Variants/);assert.match(html,/View Stock History/);
  });
  await t.test('Existing lettuce menu icons and harvest Stock In form still render',async()=>{
   const html=render(InventoryMenuItems,{items:[{label:'Stock In',icon:ArrowDownToLine,action:()=>{}},{label:'Stock Out',icon:ArrowUpFromLine,action:()=>{}}],onSelect:()=>{}});
   assert.match(html,/<svg/);assert.match(html,/Stock Out/);
   const {default:HarvestBatches}=await vite.ssrLoadModule('/src/admin/HarvestBatches.jsx');
   const harvest=render(HarvestBatches,{product:{id:1,name:'Romaine',price:130},initialMode:'in',onChanged:()=>{},onHistory:()=>{}});
   assert.match(harvest,/Harvest Date/);assert.match(harvest,/400g/);
  });
  const supply=(name,model,variants)=>render(GardeningSupplies,{product:{id:1,name,category:'Gardening Supplies',supplyStockModel:model,variants},initialTab:'stock',onChanged:()=>{},onClose:()=>{},onHistory:()=>{}});
  const v=(id,name,unit,stock=null)=>({id,name,sku:'GS-TEST-'+id,selling_unit:unit,stock,pool_id:id,stock_factor:1,status:stock==null?'Awaiting Stock Entry':'Out of Stock'});
  await t.test('Potting mix null balances show 1 kg and 2.5 kg choices and require explicit selection',()=>{
   const html=supply('Potting Mix','prepacked',[v(1,'1 kg','Bag'),v(2,'2.5 kg','Bag')]);
   assert.match(html,/1 kg/);assert.match(html,/2.5 kg/);assert.match(html,/Awaiting Stock Entry/);
   assert.match(html,/<option value="" selected="">Select variant/);
   assert.match(html,/disabled=""[^>]*>Confirm Stock Transaction/);assert.ok(!html.includes('NaN'));
  });
  await t.test('Unconfigured 5-piece and 10-piece trays show a configuration action without allowing a transaction',()=>{
   const html=supply('Grid Tray','unconfigured',[{...v(1,'5 Pieces','Set'),pool_id:null,stock_factor:5},{...v(2,'10 Pieces','Set'),pool_id:null,stock_factor:10}]);
   assert.match(html,/5 Pieces/);assert.match(html,/10 Pieces/);assert.match(html,/Stock setup is incomplete/);assert.match(html,/Configure Stock Model/);
   assert.match(html,/disabled=""[^>]*>Confirm Stock Transaction/);
  });
  await t.test('Zero, undefined, null and malformed variant collections show setup guidance rather than crashing',()=>{
   for(const variants of [[],undefined,null,{},[null,undefined]]){
    const html=supply('No variants','unconfigured',variants);assert.match(html,/No active variants available/);assert.match(html,/Manage Variants/);
    assert.match(html,/disabled=""[^>]*>Confirm Stock Transaction/);
   }
  });
  await t.test('Configured shared trays and initialized zero balances remain selectable without selecting a variant automatically',()=>{
   const html=supply('Shared Trays','shared',[{...v(1,'5 Pieces','Set',0),stock_factor:5},{...v(2,'10 Pieces','Set',0),pool_id:1,stock_factor:10}]);
   assert.match(html,/5 Pieces/);assert.match(html,/10 Pieces/);assert.ok(!html.includes('Stock setup is incomplete'));
   assert.match(html,/<option value="" selected="">Select variant/);assert.match(html,/disabled=""[^>]*>Confirm Stock Transaction/);
  });
 }finally{await vite.close();}
});
