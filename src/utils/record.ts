import { ObjectId } from 'mongodb';
export const fail = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
export function objectId(value) { if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw fail('Invalid record ID.'); return new ObjectId(value); }
export function textField(value, name, max = 200, optional = false) { if (optional && (value == null || value === '')) return ''; if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(`Enter a valid ${name}.`); return value.trim(); }
export const publicEquipment = { reservationSlots: 0, inventoryVersion: 0 };
