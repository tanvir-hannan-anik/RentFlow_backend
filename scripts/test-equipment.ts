import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mock} from 'node:test';
process.env.DATABASE_NAME='gr_equipment_'+randomUUID().replaceAll('-','').slice(0,20);process.env.NODE_ENV='test';process.env.BETTER_AUTH_URL='http://localhost:3000';
const databaseName=process.env.DATABASE_NAME;
const {connectDatabase,closeDatabase}=await import('../src/config/database.js');
let database,server,owned=false;
try{
 database=await connectDatabase();assert.equal((await database.listCollections().toArray()).length,0);owned=true;
 const {initializeAuth}=await import('../src/config/auth.js');const auth=initializeAuth();await auth.$context;
 const {default:app}=await import('../src/app.js');server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api`;
 async function request(path,method='GET',body,identity){const response=await fetch(base+path,{method,headers:{Origin:'http://localhost:3000',...(body?{'Content-Type':'application/json'}:{}),...(identity?{Cookie:identity.cookie,...(identity.token?{Authorization:`Bearer ${identity.token}`}:{})}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,json:await response.json(),cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};}
 async function login(email){const result=await request('/auth/sign-in/email','POST',{email,password:'ValidPass123'});assert.equal(result.status,200);const identity={cookie:result.cookie};const token=await request('/auth/token','GET',undefined,identity);assert.equal(token.status,200,'JWT token must be issued');identity.token=token.json.token;return identity;}
 await auth.api.createUser({body:{name:'Owner',email:'owner@example.test',password:'ValidPass123',role:'owner'}});
 await auth.api.createUser({body:{name:'Customer',email:'renter@example.test',password:'ValidPass123',role:'customer'}});
 await auth.api.createUser({body:{name:'Administrator',email:'admin@example.test',password:'ValidPass123',role:'admin'}});
 const owner=await login('owner@example.test'),renter=await login('renter@example.test'),admin=await login('admin@example.test');
 const input={name:'Integration Camera',category:'Photography',description:'Professional camera',city:'Dhaka',image:'https://example.com/camera.jpg',price:40,rentalType:'Weekly',quantity:3,condition:'Excellent',brand:'Sony',model:'FX6',terms:'Return clean',specifications:'4K'};
 assert.equal((await request('/equipment','POST',input)).status,401);const customerListing=await request('/equipment','POST',input,renter);assert.equal(customerListing.status,201,'Customers can submit their own equipment');assert.equal(customerListing.json.data.approvalStatus,'pending');assert.equal((await request('/equipment/'+customerListing.json.data._id,'DELETE',undefined,renter)).status,200);
 const created=await request('/equipment','POST',{...input,ownerId:'forged',approvalStatus:'approved'},owner);assert.equal(created.status,201,created.json.message);const id=created.json.data._id;
 assert.equal(created.json.data.approvalStatus,'pending');assert.notEqual(created.json.data.ownerId,'forged');assert.equal((await request('/equipment')).json.data.total,0);
 assert.equal((await request(`/equipment/${id}`)).status,401);assert.equal((await request(`/equipment/${id}`,'GET',undefined,renter)).status,404);assert.equal((await request(`/equipment/${id}`,'GET',undefined,owner)).status,200);
 assert.equal((await request(`/admin/equipment/${id}`,'PATCH',{approvalStatus:'approved'},admin)).status,200);
 assert.equal((await request('/equipment?q=Photography&city=Dhaka&rentalType=Weekly&availability=available')).json.data.total,1);
 assert.equal((await request('/equipment?q=%5B')).status,200);assert.equal((await request('/equipment?maxPrice=10')).json.data.total,0);
 assert.equal((await request(`/equipment/${id}`,'PUT',input,renter)).status,404);
 assert.equal((await request(`/equipment/${id}`,'PUT',{...input,price:50},owner)).status,200);assert.equal((await request('/equipment')).json.data.total,0);
 await request(`/admin/equipment/${id}`,'PATCH',{approvalStatus:'approved'},admin);
 assert.equal((await request(`/my/favorites/${id}`,'PUT',{},renter)).status,200);assert.equal((await request(`/my/favorites/${id}`,'PUT',{},renter)).status,200);assert.equal((await request('/my/favorites','GET',undefined,renter)).json.data.length,1);
 const year=new Date().getUTCFullYear()+1;
 const booking=await request('/bookings','POST',{equipmentId:id,startDate:`${year}-01-01`,endDate:`${year}-01-08`,quantity:2,contactNumber:'+880123456789',deliveryAddress:'Dhaka',notes:'Test',total:1},renter);
 assert.equal(booking.status,201,booking.json.message);assert.equal(booking.json.data.total,200);assert.equal(booking.json.data.paymentStatus,'unpaid');
 assert.equal((await request('/my/bookings','GET',undefined,owner)).json.data.length,1);
 assert.equal((await request(`/bookings/${booking.json.data._id}`,'PATCH',{status:'cancelled'},owner)).status,403);
 
 const {stripeClient}=await import('../src/services/payments.js');const stripe=stripeClient();const sessions=new Map();let creates=0;
 mock.method(stripe.checkout.sessions,'create',async(params)=>{creates++;const result={id:'cs_test_mock_'+creates,url:'https://checkout.stripe.com/c/pay/cs_test_mock_'+creates,metadata:params.metadata,client_reference_id:params.client_reference_id,amount_total:params.line_items[0].price_data.unit_amount,currency:'usd',status:'open',payment_status:'unpaid',payment_intent:'pi_test_mock_'+creates};sessions.set(result.id,result);return result;});
 mock.method(stripe.checkout.sessions,'retrieve',async(sessionId)=>sessions.get(sessionId));
 mock.method(stripe.checkout.sessions,'expire',async(sessionId)=>{const session=sessions.get(sessionId);session.status='expired';return session;});
 const checkout=await request('/payments/checkout','POST',{bookingId:booking.json.data._id,total:1},renter);assert.equal(checkout.status,200,checkout.json.message);assert.equal(creates,1);
 const again=await request('/payments/checkout','POST',{bookingId:booking.json.data._id},renter);assert.equal(again.status,200);assert.equal(creates,1,'Checkout retry reuses the same session');
 const pending=await request('/payments/verify','POST',{bookingId:booking.json.data._id},renter);assert.equal(pending.json.data.paymentStatus,'pending');
 assert.equal((await request('/payments/verify','POST',{bookingId:booking.json.data._id,sessionId:'cs_test_someone_else'},renter)).status,403);
 const overlapping=await request('/bookings','POST',{equipmentId:id,startDate:year+'-01-01',endDate:year+'-01-08',quantity:2,contactNumber:'+880123456789',deliveryAddress:'Dhaka',notes:''},renter);assert.equal(overlapping.status,201);
 assert.equal((await request('/payments/checkout','POST',{bookingId:overlapping.json.data._id},renter)).status,409,'Unpaid Checkout holds prevent overselling');
 sessions.get('cs_test_mock_1').status='complete';sessions.get('cs_test_mock_1').payment_status='paid';
 const verified=await request('/payments/verify','POST',{bookingId:booking.json.data._id},renter);assert.equal(verified.status,200);assert.equal(verified.json.data.paymentStatus,'paid');assert.equal(verified.json.data.total,200);
 await request('/payments/verify','POST',{bookingId:booking.json.data._id},renter);assert.equal(await database.collection('payments').countDocuments(),1,'Payment fulfillment is idempotent');
 const nativeFetch=globalThis.fetch;mock.method(globalThis,'fetch',async(url,options)=>String(url)==='https://api.imgbb.com/1/upload'?Response.json({success:true,data:{url:'https://i.ibb.co/test-fixture/photo.png'}}):nativeFetch(url,options));
 const image=new FormData();image.set('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aifoAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'sample.png');
 const uploaded=await fetch(base+'/uploads/image',{method:'POST',headers:{Origin:'http://localhost:3000',Cookie:renter.cookie,Authorization:'Bearer '+renter.token},body:image});assert.equal(uploaded.status,201);assert.equal((await uploaded.json()).data.url,'https://i.ibb.co/test-fixture/photo.png');
 mock.restoreAll();
 console.log('PASS: checkout retry, inventory holds, verified totals, idempotent payment persistence, cross-session rejection, and multipart image upload (mocked providers).');

 assert.equal((await request('/admin/overview','GET',undefined,renter)).status,403);
 assert.equal((await request('/my/profile','PUT',{name:'Updated Customer',image:'https://example.com/p.jpg',phone:'+880123456789',address:'Dhaka'},renter)).status,200);
 assert.equal((await request('/my/profile','GET',undefined,renter)).json.data.phone,'+880123456789');
 const analytics=await request('/analytics','GET',undefined,admin);assert.equal(analytics.status,200);assert.equal(analytics.json.data.equipment,1);assert.equal(analytics.json.data.revenue,200);
 assert.equal((await request(`/equipment/${id}`,'DELETE',undefined,renter)).status,404);assert.equal((await request(`/equipment/${id}`,'DELETE',undefined,owner)).status,200);assert.equal((await request('/equipment')).json.data.total,0);
 console.log('PASS: JWT, role access, pending approval, private details, MongoDB persistence, category search, rental filters, editing, favorites, quantity/period pricing, cancellation, profile, analytics, and deletion.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{mock.restoreAll();if(server)await new Promise(resolve=>server.close(resolve));if(owned&&database?.databaseName===databaseName&&/^gr_equipment_[a-f\d]{20}$/.test(databaseName))await database.dropDatabase();await closeDatabase();}
