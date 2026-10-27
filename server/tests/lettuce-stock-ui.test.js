import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

test('Simple lettuce stock forms have no batch/date inputs and require confirmed whole-pack transactions',async()=>{
  const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try{
    const {default:Stock}=await vite.ssrLoadModule('/src/admin/LettuceStock.jsx');
    const product={id:1,name:'Fixture Lettuce',productCode:'BF-000001',lettuceStockModel:'quantity',stock:20,physicalStock:25,reservedStock:3,committedStock:2};
    for(const direction of ['in','out']){
      const html=renderToStaticMarkup(createElement(Stock,{product,direction,onChanged:()=>{},onClose:()=>{}}));
      assert.match(html,/400g/);assert.match(html,/Quantity \(packs\)/);assert.match(html,/Reserved \/ Allocated/);assert.match(html,/type="checkbox"/);
      assert.ok(!html.includes('type="date"'));assert.ok(!html.includes('Choose Batch'));assert.ok(!html.includes('Harvest Date'));
      assert.match(html,/disabled=""[^>]*>Confirm Stock/);
      if(direction==='in')assert.match(html,/New Harvest/);else assert.match(html,/Disposal \/ Spoiled/);
    }
    const blocked=renderToStaticMarkup(createElement(Stock,{product:{...product,lettuceStockModel:'batch'}}));
    assert.match(blocked,/historical stock reconciliation/);assert.ok(!blocked.includes('<form'));
  }finally{await vite.close();}
});
