import type {EquipmentInput} from '../types.js';
import {textField,fail} from './record.js';
export const categories=['Construction','Photography','Vehicles','Agriculture','Events','Electronics'];
export const invalid=(message:string)=>fail(message);
export function equipmentInput(value:unknown={}):EquipmentInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('Enter equipment details.');
 const body=value as Record<string,unknown>;
 const name=textField(body.name,'name',120),description=textField(body.description,'description',5000),city=textField(body.city,'city',100),image=textField(body.image,'image',2048),terms=textField(body.terms,'terms',2000,true),specifications=textField(body.specifications,'specifications',2000,true);
 const category=textField(body.category,'category',100),rentalType=textField(body.rentalType,'rental type',20),brand=textField(body.brand,'brand',120),model=textField(body.model,'model',120),condition=textField(body.condition,'condition',120);
 if(!categories.includes(category))throw invalid('Choose a valid category.');
 try{if(!/^\/images\/[a-z0-9-]+\.(jpg|png|webp|svg)$/.test(image)&&!['http:','https:'].includes(new URL(image).protocol))throw Error();}catch{throw invalid('Enter an HTTP(S) image URL.');}
 if(typeof body.price!=='number'||!Number.isFinite(body.price)||body.price<1||body.price>100000)throw invalid('Rental price must be between $1 and $100,000.');
 if(!['Daily','Weekly','Monthly'].includes(rentalType))throw invalid('Choose a rental type.');
 if(typeof body.quantity!=='number'||!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>1000)throw invalid('Quantity must be between 1 and 1000.');
 if(!['Excellent','Good','Fair'].includes(condition))throw invalid('Choose a valid condition.');
 return{name,description,category,image,terms,specifications,rentalType,brand,model,condition,quantity:body.quantity,price:Math.round(body.price*100)/100,location:{city}};
}
export function rentalDates(start:unknown,end:unknown):number{
 const valid=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value).toISOString().slice(0,10)===value;
 try{if(!valid(start)||!valid(end))throw Error();}catch{throw invalid('Enter valid rental dates.');}
 const from=String(start),to=String(end);const days=(new Date(to).getTime()-new Date(from).getTime())/86400000+1;
 if(from<new Date().toISOString().slice(0,10)||days<1||days>90)throw invalid('Choose 1–90 rental days starting today or later.');return days;
}
