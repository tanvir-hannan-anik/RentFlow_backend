import { rentalDates } from './equipment-validation.js';
import { fail, textField } from './record.js';
export function rentalQuote(item, input = {}) {
  const days = rentalDates(input.startDate, input.endDate);
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > (item.quantity || 0)) throw fail('Choose an available quantity.');
  const periodDays = { Daily: 1, Weekly: 7, Monthly: 30 }[item.rentalType || 'Daily'];
  const units = Math.ceil(days / periodDays);
  return { startDate: input.startDate, endDate: input.endDate, days, units, quantity: input.quantity, rentalType: item.rentalType || 'Daily', unitPrice: item.price, total: Math.round(item.price * units * input.quantity * 100) / 100, contactNumber: textField(input.contactNumber, 'contact number', 30), deliveryAddress: textField(input.deliveryAddress, 'delivery address', 500), notes: textField(input.notes, 'notes', 2000, true) };
}
export function availableQuantity(item, bookings, start, end) {
  let maximum = 0;
  for (let date = new Date(start); date <= new Date(end); date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    maximum = Math.max(maximum, bookings.filter(b => b.startDate <= day && b.endDate >= day).reduce((sum, b) => sum + (b.quantity || 1), 0));
  }
  return Math.max(0, (item.quantity || 0) - maximum);
}
