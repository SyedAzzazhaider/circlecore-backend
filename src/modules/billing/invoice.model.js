const mongoose = require('mongoose');

/**
 * Invoice Model
 * Document requirement: MODULE G — Tax compliant invoices
 * Stores all billing invoices with full tax details
 * Compatible with Stripe and Razorpay invoice data
 */
const invoiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true,
  },

  // Invoice identification
  // NOT marked required: true — the pre('validate') hook generates it automatically.
  // Marking it required AND generating it in a hook causes a race:
  // Mongoose validates required fields BEFORE pre('save') runs → validation fails.
  // pre('validate') fires BEFORE validation so the number is present in time.
  invoiceNumber: {
    type: String,
    unique: true,
    default: null,
  },

  provider: {
    type: String,
    enum: ['stripe', 'razorpay'],
    required: true,
  },

  providerInvoiceId: { type: String, default: null },

  status: {
    type: String,
    enum: ['draft', 'open', 'paid', 'void', 'uncollectible'],
    default: 'open',
  },

  // Amounts in smallest currency unit (cents for USD, paise for INR)
  currency: { type: String, default: 'usd' },
  subtotal: { type: Number, required: true },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, required: true },

  // Tax details — Document requirement: tax compliant invoices
  taxRate: { type: Number, default: 0 },
  taxDescription: { type: String, default: '' },

  tier: {
    type: String,
    enum: ['premium', 'enterprise'],
    required: true,
  },

  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },

  // Customer billing details — Document requirement: tax compliant invoices
  billingDetails: {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    address: {
      line1: { type: String, default: '' },
      line2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    taxId: { type: String, default: null },
  },

  lineItems: [{
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unitAmount: { type: Number, required: true },
    amount: { type: Number, required: true },
  }],

  pdfUrl: { type: String, default: null },
  paidAt: { type: Date, default: null },

}, { timestamps: true });

// ─── INDEXES ──────────────────────────────────────────────────────────────────
// invoiceNumber already has unique:true on the field above — that creates the index.
// Do NOT add invoiceSchema.index({ invoiceNumber:1 }) here — it would be a duplicate
// and triggers the Mongoose "Duplicate schema index" warning.
invoiceSchema.index({ userId: 1, createdAt: -1 });
invoiceSchema.index({ providerInvoiceId: 1 });
invoiceSchema.index({ status: 1 });

// ─── AUTO-GENERATE INVOICE NUMBER ─────────────────────────────────────────────
// Uses pre('validate') — NOT pre('save') — because:
// Mongoose runs required/type validation BEFORE pre('save') fires.
// pre('validate') runs BEFORE validation, so invoiceNumber is populated
// before Mongoose checks it, preventing the ValidationError.
invoiceSchema.pre('validate', async function () {
  if (this.isNew && !this.invoiceNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await this.constructor.countDocuments();
    this.invoiceNumber = 'CC-' + year + month + '-' + String(count + 1).padStart(6, '0');
  }
});

module.exports = mongoose.model('Invoice', invoiceSchema);