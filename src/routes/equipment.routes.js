import { Router } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { getDatabase } from '../config/database.js';
import { getAuth } from '../config/auth.js';
import { requireJwt, verifyOwner, verifyRenter, verifyAdmin } from '../middleware/auth.js';
import { sendResponse } from '../utils/api-response.js';
import { equipmentInput } from '../utils/equipment-validation.js';
import { objectId as id, fail, publicEquipment, textField } from '../utils/record.js';
import { rentalQuote, availableQuantity } from '../utils/rental.js';
const router = Router();
const collection = name => getDatabase().collection(name);
const ok = (res, data, message = 'Success', status = 200) => sendResponse(res, status, message, data);
const literal = value => String(value).slice(0,120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ownerOrAdmin = (req,res,next) => ['owner','admin'].includes(req.auth.user.role) ? next() : sendResponse(res,403,'Owner access is required.');
const ownerFilter = req => ({_id:id(req.params.id),deleted:{$ne:true},...(req.auth.user.role==='admin'?{}:{ownerId:req.auth.user.id})});

router.get('/equipment', async (req,res) => {
 const filter={approvalStatus:'approved',deleted:{$ne:true}};
 if(req.query.q) filter.$or=['name','category'].map(field=>({[field]:{$regex:literal(req.query.q),$options:'i'}}));
 if(req.query.category)filter.category=String(req.query.category);
 if(req.query.city)filter['location.city']={$regex:literal(req.query.city),$options:'i'};
 if(req.query.rentalType)filter.rentalType=String(req.query.rentalType);
 if(req.query.availability==='available')filter.quantity={$gt:0};
 if(req.query.availability==='unavailable')filter.quantity=0;
 for(const [param,op] of [['minPrice','$gte'],['maxPrice','$lte']])if(req.query[param]!==undefined&&req.query[param]!==''){const value=Number(req.query[param]);if(!Number.isFinite(value)||value<0)throw fail('Invalid price range.');filter.price={...filter.price,[op]:value};}
 const page=Math.max(1,Math.min(10000,parseInt(req.query.page)||1)),limit=Math.max(1,Math.min(24,parseInt(req.query.limit)||9));
 const sort=req.query.sort==='price-asc'?{price:1,_id:1}:req.query.sort==='price-desc'?{price:-1,_id:1}:{createdAt:-1,_id:-1};
 const [items,total]=await Promise.all([collection('equipment').find(filter,{projection:publicEquipment}).sort(sort).skip((page-1)*limit).limit(limit).toArray(),collection('equipment').countDocuments(filter)]);
 ok(res,{items,total,page,pages:Math.ceil(total/limit)});
});
router.get('/equipment/:id',requireJwt,async(req,res)=>{
 const filter={_id:id(req.params.id),deleted:{$ne:true}};
 if(req.auth.user.role!=='admin')filter.$or=[{approvalStatus:'approved'},{ownerId:req.auth.user.id}];
 const item=await collection('equipment').findOne(filter,{projection:publicEquipment});if(!item)throw fail('Equipment not found.',404);ok(res,item);
});
router.post('/equipment',requireJwt,verifyOwner,async(req,res)=>{
 const item={...equipmentInput(req.body),ownerId:req.auth.user.id,ownerName:req.auth.user.name,ownerEmail:req.auth.user.email,approvalStatus:'pending',createdAt:new Date(),updatedAt:new Date()};
 const result=await collection('equipment').insertOne(item);ok(res,{...item,_id:result.insertedId},'Submitted for administrator approval.',201);
});
router.put('/equipment/:id',requireJwt,ownerOrAdmin,async(req,res)=>{
 const input=equipmentInput(req.body);const current=await collection('equipment').findOne(ownerFilter(req));if(!current)throw fail('Equipment not found.',404);
 if((current.reservationSlots||[]).length&&input.quantity!==current.quantity)throw fail('Quantity cannot change while reservations exist.');
 const filter={...ownerFilter(req),inventoryVersion:current.inventoryVersion??{$exists:false}};
 const item=await collection('equipment').findOneAndUpdate(filter,{$set:{...input,approvalStatus:req.auth.user.role==='admin'?current.approvalStatus:'pending',updatedAt:new Date()},$inc:{inventoryVersion:1}},{returnDocument:'after',projection:publicEquipment});
 if(!item)throw fail('Equipment changed during editing. Reload and try again.',409);ok(res,item,'Equipment updated.');
});
router.delete('/equipment/:id',requireJwt,ownerOrAdmin,async(req,res)=>{const result=await collection('equipment').updateOne(ownerFilter(req),{$set:{deleted:true,updatedAt:new Date()},$inc:{inventoryVersion:1}});if(!result.matchedCount)throw fail('Equipment not found.',404);ok(res,null,'Equipment removed. Existing rentals are preserved.');});
router.get('/my/equipment',requireJwt,verifyOwner,async(req,res)=>ok(res,await collection('equipment').find({ownerId:req.auth.user.id,deleted:{$ne:true}},{projection:publicEquipment}).sort({createdAt:-1}).toArray()));
router.get('/my/bookings',requireJwt,async(req,res)=>{if(req.auth.user.role==='admin')throw fail('Use All Rentals in the admin dashboard.',403);ok(res,await collection('bookings').find(req.auth.user.role==='owner'?{ownerId:req.auth.user.id}:{customerId:req.auth.user.id}).sort({createdAt:-1}).toArray());});
router.post('/bookings', requireJwt, verifyRenter, async (req, res) => {
 const item = await collection('equipment').findOne({_id:id(req.body?.equipmentId),approvalStatus:'approved',deleted:{$ne:true}});
 if(!item)throw fail('Equipment not found.',404);
 if(item.ownerId===req.auth.user.id)throw fail('You cannot book your own equipment.');
 const quote=rentalQuote(item,req.body);
 const active=await collection('bookings').find({equipmentId:item._id.toString(),paymentStatus:'paid',status:{$in:['confirmed','active']},startDate:{$lte:quote.endDate},endDate:{$gte:quote.startDate}}).toArray();
 if(availableQuantity(item,active,quote.startDate,quote.endDate)<quote.quantity)throw fail('Not enough equipment is available for these dates.',409);
 // Stripe is deferred by the user. This saves an unpaid request, never a reservation.
 const booking={...quote,equipmentId:item._id.toString(),equipmentName:item.name,image:item.image,customerId:req.auth.user.id,customerName:req.auth.user.name,customerEmail:req.auth.user.email,ownerId:item.ownerId,ownerName:item.ownerName,ownerEmail:item.ownerEmail||'',status:'requested',paymentStatus:'unpaid',createdAt:new Date()};
 const result=await collection('bookings').insertOne(booking);ok(res,{...booking,_id:result.insertedId},'Rental request saved. Online payments are not enabled.',201);
});
router.get('/my/bookings/:id',requireJwt,verifyRenter,async(req,res)=>{const booking=await collection('bookings').findOne({_id:id(req.params.id),customerId:req.auth.user.id});if(!booking)throw fail('Rental not found.',404);ok(res,booking);});
router.patch('/bookings/:id',requireJwt,verifyRenter,async(req,res)=>{
 if(req.body?.status!=='cancelled')throw fail('Only cancellation is supported.');
 const result=await collection('bookings').updateOne({_id:id(req.params.id),customerId:req.auth.user.id,status:'requested',paymentStatus:'unpaid'},{$set:{status:'cancelled'}});
 if(!result.matchedCount)throw fail('Paid bookings require administrator assistance.');ok(res,null);
});
router.get('/my/favorites',requireJwt,verifyRenter,async(req,res)=>{const saved=await collection('favorites').find({customerId:req.auth.user.id}).toArray();ok(res,await collection('equipment').find({_id:{$in:saved.map(item=>id(item.equipmentId))},deleted:{$ne:true},approvalStatus:'approved'},{projection:publicEquipment}).toArray());});
router.put('/my/favorites/:id',requireJwt,verifyRenter,async(req,res)=>{if(!await collection('equipment').findOne({_id:id(req.params.id),deleted:{$ne:true},approvalStatus:'approved'}))throw fail('Equipment not found.',404);await collection('favorites').updateOne({_id:`${req.auth.user.id}:${req.params.id}`},{$setOnInsert:{customerId:req.auth.user.id,equipmentId:req.params.id,createdAt:new Date()}},{upsert:true});ok(res,null);});
router.delete('/my/favorites/:id',requireJwt,verifyRenter,async(req,res)=>{await collection('favorites').deleteMany({customerId:req.auth.user.id,equipmentId:req.params.id});ok(res,null);});
router.get('/my/profile',requireJwt,async(req,res)=>{const u=req.auth.user;ok(res,{id:u.id,name:u.name,email:u.email,image:u.image,role:u.role,phone:u.phone||'',address:u.address||''});});
router.put('/my/profile',requireJwt,async(req,res)=>{
 const body={name:textField(req.body?.name,'name',100),image:textField(req.body?.image,'photo URL',2048),phone:textField(req.body?.phone,'phone number',30,true),address:textField(req.body?.address,'address',500,true)};
 if(body.phone&&!/^[+\d\s().-]{5,30}$/.test(body.phone))throw fail('Enter a valid phone number.');
 await getAuth().api.updateUser({headers:fromNodeHeaders(req.headers),body});ok(res,body,'Profile updated.');
});
router.get('/reviews',async(req,res)=>ok(res,await collection('reviews').find({published:true},{projection:{customerName:1,rating:1,comment:1,demo:1}}).sort({createdAt:-1}).limit(8).toArray()));
router.get('/admin/overview',requireJwt,verifyAdmin,async(req,res)=>{
 const [users,equipment,bookings]=await Promise.all([collection('users').find({},{projection:{name:1,email:1,role:1,createdAt:1,banned:1,image:1}}).sort({createdAt:-1}).toArray(),collection('equipment').find({deleted:{$ne:true}},{projection:publicEquipment}).sort({createdAt:-1}).toArray(),collection('bookings').find().sort({createdAt:-1}).toArray()]);ok(res,{users,equipment,bookings});
});
router.patch('/admin/equipment/:id',requireJwt,verifyAdmin,async(req,res)=>{if(!['approved','rejected'].includes(req.body?.approvalStatus))throw fail('Invalid moderation status.');const result=await collection('equipment').updateOne({_id:id(req.params.id),deleted:{$ne:true}},{$set:{approvalStatus:req.body.approvalStatus},$inc:{inventoryVersion:1}});if(!result.matchedCount)throw fail('Equipment not found.',404);ok(res,null);});
router.patch('/admin/users/:id',requireJwt,verifyAdmin,async(req,res)=>{
 if(req.params.id===req.auth.user.id)throw fail('You cannot suspend yourself.');if(typeof req.body?.banned!=='boolean')throw fail('Invalid user status.');
 const result=await collection('users').updateOne({_id:id(req.params.id),role:{$ne:'admin'}},{$set:{banned:req.body.banned,banReason:req.body.banned?'Suspended by administrator':null,updatedAt:new Date()}});if(!result.matchedCount)throw fail('User not found, or this account is an administrator.',404);ok(res,null);
});
router.patch('/admin/bookings/:id',requireJwt,verifyAdmin,async(req,res)=>{
 if(!['active','completed'].includes(req.body?.status))throw fail('Choose active or completed.');
 const filter={_id:id(req.params.id),paymentStatus:'paid',status:{$in:['confirmed','active']}};
 const booking=await collection('bookings').findOne(filter);if(!booking)throw fail('Only confirmed paid rentals can be updated.');
 const today=new Date().toISOString().slice(0,10);if(req.body.status==='active'&&booking.startDate>today)throw fail('This rental has not started.');if(req.body.status==='completed'&&booking.endDate>=today)throw fail('Complete rentals after their end date.');
 await collection('bookings').updateOne(filter,{$set:{status:req.body.status}});ok(res,null);
});
router.get('/analytics',requireJwt,ownerOrAdmin,async(req,res)=>{
 const admin=req.auth.user.role==='admin',filter=admin?{}:{ownerId:req.auth.user.id};
 const [users,equipment,pending,bookings,completed,payments,monthlyBookings,monthlyEarnings]=await Promise.all([
 admin?collection('users').countDocuments():0,
 collection('equipment').countDocuments({...filter,deleted:{$ne:true}}),collection('equipment').countDocuments({...filter,deleted:{$ne:true},approvalStatus:'pending'}),collection('bookings').countDocuments(filter),collection('bookings').countDocuments({...filter,status:'completed'}),
 collection('payments').aggregate([{$match:{...filter,status:'paid'}},{$group:{_id:null,total:{$sum:'amount'}}}]).toArray(),
 collection('bookings').aggregate([{$match:filter},{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$createdAt'}},value:{$sum:1}}},{$sort:{_id:1}}]).toArray(),
 collection('payments').aggregate([{$match:{...filter,status:'paid'}},{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$createdAt'}},value:{$sum:'$amount'}}},{$sort:{_id:1}}]).toArray()
 ]);ok(res,{users,equipment,pending,bookings,completed,revenue:payments[0]?.total||0,monthlyBookings,monthlyEarnings});
});
export default router;
