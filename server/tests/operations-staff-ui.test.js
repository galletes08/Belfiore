import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {filterStaffInventory,staffInventorySummary} from '../../src/staff/inventoryDisplay.js';
import {filterOrders} from '../../src/utils/orderDisplay.js';

const inventoryFixture=[
 {id:1,name:'Aloe Hybrid',product_code:'BF-001',inventory_type:'succulent',tag:'Green',stock:1,price:500,reserved_stock:0,allocated_stock:0,current_status:'Available'},
 {id:2,name:'Romaine',product_code:'BF-002',inventory_type:'edible',lettuce_stock_model:'quantity',stock:7,price:130,reserved_stock:2,allocated_stock:1,current_status:'Available'},
 {id:3,name:'Potting Mix',product_code:'BF-003',category:'Soil & Potting Mix',inventory_type:'GARDENING_SUPPLY',variants:[{id:10,name:'1 kg',sku:'MIX-1KG',unit:'Bag',available:2,reserved:1,status:'Low Stock',price:30},{id:11,name:'2.5 kg',sku:'MIX-25KG',unit:'Bag',available:9,reserved:0,status:'Available',price:75}]},
];
test('Staff inventory separates plant/pack quantities and combines search with category, variant and attention filters',()=>{
 const result=staffInventorySummary(inventoryFixture);assert.equal(result.total,3);assert.equal(result.plants,1);assert.equal(result.packs,7);assert.equal(result.alerts.length,1);
 assert.equal(filterStaffInventory(inventoryFixture,'MIX-25KG','Gardening Supplies')[0].id,3);
 assert.equal(filterStaffInventory(inventoryFixture,'Romaine','Gardening Supplies').length,0);
 assert.equal(filterStaffInventory(inventoryFixture,'','Needs Attention')[0].id,3);
 assert.equal(filterStaffInventory(inventoryFixture,'','Low Stock')[0].id,3);
});

test('Staff UI renders restricted responsive navigation and mandatory password setup without privileged links',async t=>{
 const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
 const old=globalThis.localStorage;let value;
 globalThis.localStorage={getItem:()=>value,removeItem:()=>{value=null;}};
 const token=payload=>'test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,...payload})).toString('base64url')+'.test';
 try{
  const {default:StaffBell}=await vite.ssrLoadModule('/src/staff/StaffNotificationBell.jsx');
  const {WorkspacePageHeader}=await vite.ssrLoadModule('/src/admin/WorkspacePrimitives.jsx');
  await t.test('Staff notification bell shares the title row and exposes an accessible dialog trigger',()=>{
   const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(WorkspacePageHeader,{title:'Order Management',notification:createElement(StaffBell)})));
   assert.ok(html.includes('Order Management'));assert.ok(html.includes('Order notifications, 0 unread'));assert.ok(html.includes('aria-haspopup="dialog"'));assert.equal((html.match(/Order notifications/g)||[]).length,1);
  });
  const {default:Portal}=await vite.ssrLoadModule('/src/staff/StaffPortal.jsx');
  const {apiLogin}=await vite.ssrLoadModule('/src/api/client.js');
  const renderStaff=element=>renderToStaticMarkup(createElement(MemoryRouter,null,element));
  const {default:Inventory}=await vite.ssrLoadModule('/src/staff/StaffInventory.jsx');
  const {default:AdminOrderDetails}=await vite.ssrLoadModule('/src/admin/OrderDetailsDrawer.jsx');
  await t.test('Existing Admin order drawer displays the actual shared preparation stage, handler and notes',()=>{
   const order={id:1,orderCode:'ORD-001',status:'Preparing',paymentMethod:'COD',paymentStatus:'Unpaid',deliveryMode:'rider',items:[],totalAmount:130,subtotalAmount:130,shippingFee:0,preparationStatus:'Packed',preparation:{handlerId:26,handlerName:'Operations Staff',stage:'Packed',notes:'Verified correct unique plant and quantities',startedAt:'2026-10-26T01:00:00Z',packedAt:'2026-10-26T01:05:00Z'}};
   const html=renderToStaticMarkup(createElement(AdminOrderDetails,{order,onClose:()=>{}}));
   for(const text of ['Preparation Details','Packed','Operations Staff','Verified correct unique plant and quantities'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('Payment: Paid'));
  });
  const {default:ProductCreate}=await vite.ssrLoadModule('/src/staff/StaffProductCreate.jsx');
  const {default:StaffDetails}=await vite.ssrLoadModule('/src/staff/StaffOrderDetails.jsx');
  const {default:StatusForm}=await vite.ssrLoadModule('/src/staff/StaffOrderStatus.jsx');
  await t.test('ORD-072 has the shared status dropdown and only permitted operational options',()=>{
   const render=status=>renderToStaticMarkup(createElement(StatusForm,{order:{id:72,status},refresh:()=>{},onError:()=>{},onBusyChange:()=>{}}));
   const options=html=>[...(html.match(/<select[^>]*>([\s\S]*?)<\/select>/)?.[1]||'').matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(m=>m[1]);
   assert.deepEqual(options(render('Pending')),['Pending','Preparing']);
   const logistics=renderToStaticMarkup(createElement(StatusForm,{order:{id:73,status:'Preparing',deliveryMode:'logistics',courierName:'LBC'},refresh:()=>{},onError:()=>{},onBusyChange:()=>{}}));
   for(const text of ['Delivery Mode','Rider delivery','Logistics only','Select J&amp;T or LBC','J&amp;T Express','LBC','Tracking Number','Save Delivery Details'])assert.ok(logistics.includes(text),text);
   const preparing=render('Preparing');assert.match(preparing,/Assigned Rider<select[^>]*required/);assert.ok(!preparing.match(/Assigned Rider<select[^>]*disabled/));assert.match(preparing,/Order Status/);for(const text of ['Delivery Management','Delivery Mode','Assigned Rider','Not assigned','Live GPS update'])assert.ok(preparing.includes(text),text);assert.match(preparing,/Update Status/);assert.deepEqual(options(preparing),['Preparing','Out for Delivery']);
   for(const status of ['Delivered','Cancelled','Cancellation Requested','Out for Delivery']){const html=render(status);assert.deepEqual(options(html),[status]);assert.match(html,/<select[^>]*disabled/);}
   for(const forbidden of ['name="riderId"','name="paymentStatus"','Mark Paid','Packing checklist'])assert.ok(!preparing.includes(forbidden));
  });
  const {default:OrderActions}=await vite.ssrLoadModule('/src/staff/StaffOrderActions.jsx');
  await t.test('Staff can create all three product types and accept requests without delivery assignment or payment controls',()=>{
   const form=renderToStaticMarkup(createElement(ProductCreate,{refresh:()=>{},onClose:()=>{}}));
   for(const text of ['Succulent','Lettuce','Gardening Supply','Selling price','Product image','Add Product'])assert.ok(form.includes(text));
   const recovery=renderToStaticMarkup(createElement(ProductCreate,{initialSupplyId:99,refresh:()=>{},onClose:()=>{}}));assert.match(recovery,/Loading product setup/);assert.ok(!recovery.includes('Product name'));
   const accepted=renderToStaticMarkup(createElement(OrderActions,{order:{status:'Pending',payment_method:'COD',shipping_status:'Confirmed'},refresh:()=>{},onError:()=>{}}));assert.match(accepted,/Accept Order/);
   const assignment=renderToStaticMarkup(createElement(OrderActions,{order:{status:'Preparing',operational_eligible:true,delivery_mode:'logistics'},refresh:()=>{},onError:()=>{}}));
   assert.equal(assignment,'');
  });
  const {default:Orders,operationalOrderDisplay}=await vite.ssrLoadModule('/src/staff/StaffOrders.jsx');
  await t.test('Staff Orders renders Admin-style cards, all status tabs, date filters, totals and read-only payment status',()=>{
   const fixtures=[{id:72,recipient:'Customer',gmail:'customer@example.test',status:'Pending',payment_method:'COD',payment_status:'Unpaid',total_amount:2500,created_at:'2026-10-26T08:00:00Z',operational_eligible:false},{id:71,recipient:'Customer',status:'Delivered',payment_status:'Paid',total_amount:130,created_at:'2026-10-25T01:00:00Z',operational_eligible:false}];
   const html=renderStaff(createElement(Orders,{orders:fixtures,refresh:()=>{},packingComponent:()=>null,onError:()=>{}}));
   for(const text of ['Order Management','Total Orders','Pending Action','In Progress','Delivered','From Date','To Date','Cancel Requests','Total Amount','Payment Status','Pending Collection','ORD-072','ORD-071','View Details','Entire end date included'])assert.ok(html.includes(text),text);
   assert.match(html,/More actions for ORD-072/);assert.match(html,/aria-haspopup="menu"/);
   for(const forbidden of ['Mark Paid','Refund Order','Assign Rider','Confirm COD Remittance'])assert.ok(!html.includes(forbidden));
   const rows=fixtures.map(operationalOrderDisplay);assert.equal(filterOrders(rows,{fromDate:'2026-10-26',toDate:'2026-10-26'}).length,1);assert.equal(filterOrders(rows,{status:'Delivered'})[0].id,71);
  });
  await t.test('Staff reuses five Admin tabs with scoped rider assignment and no packing or financial overrides',()=>{
   const raw={id:72,recipient:'Real Customer',gmail:'customer@example.test',phone:'09123456789',address:'Historical address',status:'Preparing',payment_method:'COD',payment_status:'Unpaid',total_amount:130,subtotal_amount:130,shipping_fee:0,delivery_mode:'rider',created_at:'2026-10-26T08:00:00Z',operational_eligible:true,stage:'Preparing',version:1,items:[{id:1,name:'Romaine',quantity:1,unit:'400g pack',type:'edible',unitPrice:130,lineTotal:130}]};
   const order=operationalOrderDisplay(raw);
   const html=renderToStaticMarkup(createElement(StaffDetails,{order,refresh:()=>{},onError:()=>{},onClose:()=>{}}));
   for(const tab of ['Payment','Delivery','History']){
    const opened=renderToStaticMarkup(createElement(StaffDetails,{order,initialTab:tab,refresh:()=>{},onError:()=>{},onClose:()=>{}}));
    assert.ok(opened.includes(`id="order-tab-${tab}" role="tab" aria-selected="true"`),tab+' shortcut opens its requested tab');
   }
   for(const text of ['order-details-drawer','Overview','Items','Payment','Delivery','History','Historical address','Romaine','Pending Collection','Update Status','Order Status','Out for Delivery'])assert.ok(html.includes(text),text);
   for(const text of ['Preparation &amp; Packing','To Prepare','Packing checklist','Mark Packed','Preparation notes','Correct products picked','type="checkbox"','Assign delivery','Save Delivery Assignment','Confirm COD Payment Received','View Delivery History'])assert.ok(!html.includes(text),text);
   const list=renderStaff(createElement(Orders,{orders:[raw],refresh:()=>{},onError:()=>{}}));
   assert.match(list,/View Details/);assert.ok(!list.includes('Packing checklist'));assert.ok(!list.includes('<dialog'));assert.match(list,/min-w-\[850px\]/);
   const pending=renderToStaticMarkup(createElement(StaffDetails,{order:operationalOrderDisplay({...raw,status:'Pending'}),refresh:()=>{},onError:()=>{},onClose:()=>{}}));assert.match(pending,/Accept Order/);assert.ok(!pending.includes('Confirm Order'));
   const delivered=renderToStaticMarkup(createElement(StaffDetails,{order:operationalOrderDisplay({...raw,status:'Delivered',payment_status:'Paid',cod_status:'Remittance Pending',delivery_mode:'logistics'}),refresh:()=>{},onError:()=>{},onClose:()=>{}}));assert.ok(!delivered.includes('Confirm COD Payment Received'));assert.ok(!delivered.includes('Packing checklist'));
  });
  await t.test('Staff inventory matches Admin summary/table hierarchy with read-only prices and permitted stock actions',()=>{
   const html=renderStaff(createElement(Inventory,{products:inventoryFixture,refresh:()=>{},stockFormComponent:()=>null,activityComponent:()=>null}));
   for(const text of ['Inventory Management','Total Products','Available Succulents','Available Lettuce Packs','Needs Attention','Inventory Alerts','Search products','Inventory filter','Product Code','Available Quantity','Stock In / Out','Add Product','per 400g pack'])assert.ok(html.includes(text),text);
   assert.match(html,/<table/);assert.match(html,/overflow-x-auto/);assert.match(html,/1 kg: 2 Bag/);assert.match(html,/2.5 kg: 9 Bag/);
   for(const forbidden of ['Archive','Stock Correction','>Edit<'])assert.ok(!html.includes(forbidden));
   const unfinished=renderStaff(createElement(Inventory,{products:[{...inventoryFixture[2],can_initialize_stock:true,variants:[]}],refresh:()=>{},stockFormComponent:()=>null,activityComponent:()=>null}));assert.match(unfinished,/Configure New Supply/);
  });
  await t.test('Shared frontend login accepts all workforce roles and rejects cross-portal responses',async()=>{
   const original=globalThis.fetch;
   try{
    for(const role of ['admin','rider','staff']){
     globalThis.fetch=async()=>Response.json({token:'test-session',user:{role}});
     assert.equal((await apiLogin('assigned-user','test-passphrase','staff')).user.role,role);
     await assert.rejects(()=>apiLogin('assigned-user','test-passphrase'),/Invalid email or password/);
    }
    globalThis.fetch=async()=>Response.json({token:'test-session',user:{role:'customer'}});
    await assert.rejects(()=>apiLogin('customer','test-passphrase','staff'),/Invalid email or password/);
    assert.equal((await apiLogin('customer','test-passphrase')).user.role,'customer');
   }finally{globalThis.fetch=original;}
  });
  const {default:Dashboard}=await vite.ssrLoadModule('/src/staff/StaffDashboard.jsx');
  const {default:Account}=await vite.ssrLoadModule('/src/staff/StaffAccount.jsx');
  await t.test('Dashboard uses actual supplied totals, shared order rows, inventory alerts and safe quick links',()=>{
   const html=renderStaff(createElement(Dashboard,{data:{summary:{total:23,pending:2,progress:4,delivered:17},orders:[{id:72,recipient:'Customer',status:'Preparing',payment_status:'Unpaid',payment_method:'COD',total_amount:2500,created_at:'2026-10-26T08:00:00Z'}],alerts:[{productId:2,name:'Romaine',status:'Low Stock'}],activity:[{id:'a1',action:'Stock In',created_at:'2026-10-26T08:00:00Z'}]},refresh:()=>{},busy:false}));
   for(const text of ['Total Orders','23','Pending Action','In Progress','Delivered','17','Recent operational orders','ORD-072','Inventory Alerts','Romaine','Recent Staff Activity','Quick Actions'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('Sales'));assert.ok(!html.includes('/admin/'));assert.ok(!html.includes('Packing'));
   const empty=renderStaff(createElement(Dashboard,{data:{summary:{total:0,pending:0,progress:0,delivered:0},orders:[],alerts:[],activity:[]},refresh:()=>{},busy:false}));assert.match(empty,/No orders recorded/);assert.match(empty,/No inventory issues requiring attention/);
  });
  await t.test('My Account shows real identity, names-only profile editing and separate password/security sections',()=>{
   const html=renderStaff(createElement(Account,{data:{id:26,first_name:'Operations',last_name:'Tester',username:'staff-test',email:null,status:'active',created_at:'2026-10-26T08:00:00Z'},refresh:()=>{},onSignOut:()=>{},signingOut:false}));
   for(const text of ['My Account','Profile Information','Account Details','Change Password','Sign Out','Operations Tester','staff-test','Registration date','Last login','current-password','new-password'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('name="role"'));assert.ok(!html.includes('name="status"'));assert.ok(!html.includes('/admin/'));assert.ok(!html.includes('Bank'));
  });
  const render=()=>renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/staff/dashboard']},createElement(Portal)));
  await t.test('Staff has three primary modules, a collapsed native mobile menu and desktop sidebar',()=>{
   value=token({role:'staff',userId:1});const html=render();
   for(const name of ['dashboard','inventory','orders'])assert.ok(html.includes('href="/staff/'+name+'"'));
   for(const href of ['/admin','/admin/reports','/admin/staff','/admin/riders'])assert.ok(!html.includes('href="'+href+'"'));
   for(const name of ['packing','stock','shipments','activity'])assert.ok(!html.includes('href="/staff/'+name+'"'));
   assert.ok(html.includes('href="/staff/profile"'));
   assert.match(html,/Open Staff navigation/);assert.match(html,/Operations Staff/);assert.match(html,/lg:sticky/);assert.match(html,/Sign Out/);assert.match(html,/Loading operations/);
  });
  await t.test('Temporary credentials show password change instead of operational controls',()=>{
   value=token({role:'staff',mustChangePassword:true});const html=render();assert.match(html,/Secure your Staff account/);assert.match(html,/current-password/);assert.match(html,/new-password/);assert.ok(!html.includes('/staff/packing'));
  });
  await t.test('Customer, Rider and Admin tokens are not usable as Staff browser sessions',()=>{
   for(const role of ['customer','rider','admin']){value=token({role});assert.ok(!render().includes('Open Staff navigation'));}
  });
 }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;await vite.close();}
});
