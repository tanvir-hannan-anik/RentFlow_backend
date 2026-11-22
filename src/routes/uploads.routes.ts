import { Router } from 'express';
import multer from 'multer';
import { requireJwt } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { fail } from '../utils/record.js';
import { sendResponse } from '../utils/api-response.js';
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,callback)=>callback(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
const router = Router();
router.post('/uploads/image',requireJwt,upload.single('image'),async(req,res)=>{
  if(!env.imgbbApiKey)throw fail('Image uploads are not configured.',503);
  if(!req.file)throw fail('Choose a JPG, PNG, or WebP image up to 5 MB.');
  const bytes=req.file.buffer;
  const valid=bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))||bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');
  if(!valid)throw fail('The selected file is not a supported image.');
  const form=new FormData();form.set('key',env.imgbbApiKey);form.set('image',bytes.toString('base64'));
  let response:globalThis.Response;
  try{response=await fetch('https://api.imgbb.com/1/upload',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});}catch{throw fail('Image host could not be reached. Please try again.',502);}
  const result=await response.json() as {success?:boolean;data?:{url?:string}};
  if(!response.ok||!result.success||!result.data?.url?.startsWith('https://i.ibb.co/'))throw fail('Image upload failed. Check the image-host configuration.',502);
  sendResponse(res,201,'Image uploaded',{url:result.data.url});
});
export default router;
