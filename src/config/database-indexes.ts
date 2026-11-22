// Creating these indexes also creates empty application collections if absent.
// Better Auth will own users and all auth-related collections in a later segment.
export const databaseIndexes = {
  equipment: [
    { key: { name: "text", category: "text" }, name: "equipment_search", default_language: "none" },
    { key: { category: 1, approvalStatus: 1 }, name: "equipment_category_approval" },
    { key: { "location.city": 1, approvalStatus: 1 }, name: "equipment_location_approval" },
    { key: { approvalStatus: 1, createdAt: -1 }, name: "equipment_approval_recent" },
    { key: { ownerId: 1, createdAt: -1 }, name: "equipment_owner_recent" },
  ],
  favorites: [
    { key: { customerId: 1, equipmentId: 1 }, name: "favorites_customer_equipment", unique: true },
  ],
  bookings: [
    { key: { equipmentId: 1, status: 1, startAt: 1, endAt: 1 }, name: "bookings_equipment_dates" },
    { key: { customerId: 1, createdAt: -1 }, name: "bookings_customer_recent" },
    { key: { ownerId: 1, createdAt: -1 }, name: "bookings_owner_recent" },
  ],
  payments: [
    { key: { bookingId: 1, createdAt: -1 }, name: "payments_booking_recent" },
    { key: { stripePaymentIntentId: 1 }, name: "payments_stripe_intent", unique: true,
      partialFilterExpression: { stripePaymentIntentId: { $type: "string" } } },
    { key: { idempotencyKey: 1 }, name: "payments_idempotency", unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } } },
  ],
  reviews: [
    { key: { bookingId: 1, customerId: 1 }, name: "reviews_booking_customer", unique: true },
    { key: { equipmentId: 1, createdAt: -1 }, name: "reviews_equipment_recent" },
  ],
};

export async function setupDatabaseIndexes(database) {
  for (const [collection, indexes] of Object.entries(databaseIndexes)) {
    await database.collection(collection).createIndexes(indexes);
  }
}
