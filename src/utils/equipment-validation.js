export const categories = ['Construction', 'Photography', 'Vehicles', 'Agriculture', 'Events', 'Electronics'];
export function invalid(message) { return Object.assign(new Error(message), { status: 400, expose: true }); }
export function equipmentInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Enter equipment details.');
  const result = {};
  for (const [key, max] of Object.entries({ name: 120, description: 5000, city: 100, image: 2048, terms: 2000, specifications: 2000 })) {
    if (typeof body[key] !== 'string' || body[key].trim().length > max || (!body[key].trim() && ['name', 'description', 'city', 'image'].includes(key))) throw invalid(`Enter a valid ${key}.`);
    result[key] = body[key].trim();
  }
  if (!categories.includes(body.category)) throw invalid('Choose a valid category.');
  try { if (!/^\/images\/[a-z0-9-]+\.(jpg|png|webp|svg)$/.test(result.image) && !['http:', 'https:'].includes(new URL(result.image).protocol)) throw Error(); } catch { throw invalid('Enter an HTTP(S) image URL.'); }
  if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 1 || body.price > 100000) throw invalid('Daily price must be between $1 and $100,000.');
  if (!['Daily', 'Weekly', 'Monthly'].includes(body.rentalType)) throw invalid('Choose a rental type.');
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000) throw invalid('Quantity must be between 1 and 1000.');
  for (const key of ['brand', 'model', 'condition']) { if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 120) throw invalid('Enter a valid ' + key + '.'); result[key] = body[key].trim(); }
  if (!['Excellent','Good','Fair'].includes(result.condition)) throw invalid('Choose a valid condition.');
  result.rentalType = body.rentalType; result.quantity = body.quantity;
  result.category = body.category;
  result.price = Math.round(body.price * 100) / 100;
  result.location = { city: result.city }; delete result.city;
  return result;
}
export function rentalDates(start, end) {
  const valid = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
  try { if (!valid(start) || !valid(end)) throw Error(); } catch { throw invalid('Enter valid rental dates.'); }
  const days = (new Date(end) - new Date(start)) / 86400000 + 1;
  if (start < new Date().toISOString().slice(0, 10) || days < 1 || days > 90) throw invalid('Choose 1–90 rental days starting today or later.');
  return days;
}
