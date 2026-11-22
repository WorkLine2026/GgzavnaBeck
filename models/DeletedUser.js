const mongoose = require('mongoose');

const { Mixed } = mongoose.Schema.Types;

const deletedUserSchema = new mongoose.Schema({
  originalId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

  // ძებნისთვის ცალკე ველებად (ინდექსით). unique არ არის — წაშლილმა
  // მომხმარებელმა იმავე ნომრით/მეილით ხელახლა რომ შეძლოს რეგისტრაცია.
  firstName: String,
  lastName: String,
  email: { type: String, index: true },
  phone: { type: String, index: true },
  personalNumber: { type: String, index: true },
  role: String,

  // მომხმარებლის სრული snapshot (პაროლისა და SMS კოდების გარეშე)
  // აქვეა phoneVerified, ratingAvg, ratingCount, მართვის მოწმობის მონაცემები და ა.შ.
  data: { type: Mixed, required: true },

  // წაშლის მომენტში მისი ჩანაწერების სრული ასლი
  related: {
    parcels: { type: [Mixed], default: [] },        // მისი გაგზავნილი განცხადებები (sender)
    trips: { type: [Mixed], default: [] },          // მისი მგზავრობები (driver)
    offers: { type: [Mixed], default: [] },         // PickupOffer — sender ან driver როლში
    tripRequests: { type: [Mixed], default: [] },   // TripPickupRequest — sender ან driver როლში
    reviews: { type: [Mixed], default: [] },        // შეფასებები — დაწერილი და მიღებული
    carriedParcels: { type: [Mixed], default: [] }, // სხვისი ნივთები, რომლებიც მას (როგორც მძღოლს) ჰქონდა მიღებული
    notifications: { type: [Mixed], default: [] }   // ბოლო 500 შეტყობინება (ზარი)
    // ⚠️ ჩატის შეტყობინებები აქ არ ინახება — ისინი ცალკე კოლექციაშია
    //    (DeletedUserMessage), რომ დოკუმენტი 16 MB-ის ლიმიტს არ გადასცდეს.
  },

  // სწრაფი სტატისტიკა სიაში საჩვენებლად (მთლიანი ჩანაწერების გახსნის გარეშე)
  stats: {
    parcelsCount: { type: Number, default: 0 },
    deliveredParcelsCount: { type: Number, default: 0 },
    tripsCount: { type: Number, default: 0 },
    completedTripsCount: { type: Number, default: 0 },
    offersCount: { type: Number, default: 0 },
    deliveredOffersCount: { type: Number, default: 0 },
    tripRequestsCount: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },
    notificationsCount: { type: Number, default: 0 },
    messagesCount: { type: Number, default: 0 }
  },

  deletedBy: { type: String, enum: ['self', 'admin'], required: true },
  deletedById: { type: mongoose.Schema.Types.ObjectId },
  reason: { type: String, default: '' },
  deletedAt: { type: Date, default: Date.now, index: true }

  // სურვილისამებრ: ავტომატური გასუფთავება 1 წლის შემდეგ (პერსონალური მონაცემები)
  // deletedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 365 }
});

module.exports = mongoose.model('DeletedUser', deletedUserSchema);