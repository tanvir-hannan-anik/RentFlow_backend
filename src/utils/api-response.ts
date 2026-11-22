import type {Response} from 'express';
export function sendResponse(response:Response,status:number,message:string,data?:unknown){const body:{success:boolean;message:string;data?:unknown}={success:status<400,message};if(data!==undefined)body.data=data;return response.status(status).json(body);}
