import assert from 'node:assert/strict';
import { test } from 'node:test';
import { equipmentInput, rentalDates } from '../src/utils/equipment-validation.js';
const valid = { name: ' Camera ', category: 'Photography', description: 'Cinema camera', city: 'Dhaka', image: 'https://example.com/camera.jpg', price: 45.555, rentalType: 'Daily', quantity: 2, brand: 'Sony', model: 'FX6', condition: 'Excellent', specifications: '', terms: '' };
test('equipment accepts only allowed fields and normalizes money and location', () => {
  const item = equipmentInput({ ...valid, ownerId: 'forged-owner', approvalStatus: 'approved' });
  assert.equal(item.name, 'Camera'); assert.equal(item.price, 45.56); assert.deepEqual(item.location, { city: 'Dhaka' }); assert.equal(item.ownerId, undefined); assert.equal(item.approvalStatus, undefined);
});
test('equipment rejects invalid amounts, URLs, categories, and missing fields', () => {
  for (const values of [{ price: -1 }, { price: Infinity }, { price: '45' }, { image: 'javascript:alert(1)' }, { category: 'invalid' }, { name: '' }, { description: 'a'.repeat(5001) }]) assert.throws(() => equipmentInput({ ...valid, ...values }), { status: 400 });
});
test('rental dates count inclusive days and reject invalid or excessive periods', () => {
  const year = new Date().getUTCFullYear() + 1;
  assert.equal(rentalDates(`${year}-01-01`, `${year}-01-01`), 1);
  assert.equal(rentalDates(`${year}-01-01`, `${year}-01-05`), 5);
  for (const [start,end] of [[`${year}-01-02`,`${year}-01-01`],[`${year}-01-01`,`${year}-12-31`],[`${year}-02-30`,`${year}-03-01`],['2020-01-01','2020-01-02'],['bad','bad']]) assert.throws(() => rentalDates(start,end), { status: 400 });
});

import {rentalQuote,availableQuantity} from '../src/utils/rental.js';
test('rental pricing counts quantity and full weekly or monthly periods',()=>{const year=new Date().getUTCFullYear()+1;const input={startDate:year+'-01-01',endDate:year+'-01-08',quantity:2,contactNumber:'+880123456789',deliveryAddress:'Dhaka',notes:''};assert.equal(rentalQuote({price:100,rentalType:'Weekly',quantity:3},input).total,400);assert.equal(rentalQuote({price:100,rentalType:'Monthly',quantity:3},input).total,200);assert.throws(()=>rentalQuote({price:100,quantity:1},input),{status:400});});
test('availability counts concurrent units rather than unrelated date ranges',()=>{const bookings=[{startDate:'2030-01-01',endDate:'2030-01-02',quantity:2},{startDate:'2030-01-03',endDate:'2030-01-04',quantity:2}];assert.equal(availableQuantity({quantity:3},bookings,'2030-01-01','2030-01-04'),1);});
