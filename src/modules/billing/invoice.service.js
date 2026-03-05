const Invoice = require('./invoice.model');
const Subscription = require('./subscription.model');
const User = require('../auth/auth.model');
const { sendEmail } = require('../../utils/email');
const logger = require('../../utils/logger');

/**
 * Invoice Service
 * Document requirement: MODULE G — Tax compliant invoices
 * Generates, stores and emails invoices for all billing events
 */
class InvoiceService {

  /**
   * Create an invoice record from a Stripe invoice event
   */
  async createFromStripeInvoice(stripeInvoice, userId, subscriptionDbId, tier) {
    try {
      const user = await User.findById(userId).select('name email');
      const subscription = await Subscription.findById(subscriptionDbId);

      const invoiceData = {
        userId,
        subscriptionId: subscriptionDbId,
        provider: 'stripe',
        providerInvoiceId: stripeInvoice.id,
        status: stripeInvoice.status,
        currency: stripeInvoice.currency,
        subtotal: stripeInvoice.subtotal,
        taxAmount: stripeInvoice.tax || 0,
        total: stripeInvoice.total,
        taxRate: stripeInvoice.tax_rate || 0,
        taxDescription: this._getTaxDescription(stripeInvoice),
        tier,
        periodStart: new Date(stripeInvoice.period_start * 1000),
        periodEnd: new Date(stripeInvoice.period_end * 1000),
        pdfUrl: stripeInvoice.invoice_pdf || null,
        paidAt: stripeInvoice.status_transitions?.paid_at
          ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
          : null,
        billingDetails: {
          name: stripeInvoice.customer_name || user?.name || '',
          email: stripeInvoice.customer_email || user?.email || '',
          address: {
            line1: stripeInvoice.customer_address?.line1 || '',
            line2: stripeInvoice.customer_address?.line2 || '',
            city: stripeInvoice.customer_address?.city || '',
            state: stripeInvoice.customer_address?.state || '',
            postalCode: stripeInvoice.customer_address?.postal_code || '',
            country: stripeInvoice.customer_address?.country || '',
          },
          taxId: stripeInvoice.customer_tax_ids?.[0]?.value || null,
        },
        lineItems: (stripeInvoice.lines?.data || []).map(item => ({
          description: item.description || 'CircleCore Subscription',
          quantity: item.quantity || 1,
          unitAmount: item.unit_amount_excluding_tax || item.unit_amount || 0,
          amount: item.amount || 0,
        })),
      };

      const invoice = await Invoice.create(invoiceData);
      logger.info('Invoice created from Stripe: ' + invoice.invoiceNumber);

      // Send invoice email to user
      if (user && user.email && stripeInvoice.status === 'paid') {
        await this.sendInvoiceEmail(user, invoice);
      }

      return invoice;
    } catch (error) {
      logger.error('Failed to create invoice from Stripe: ' + error.message);
      throw error;
    }
  }

  /**
   * Create an invoice record from a Razorpay payment event
   */
  async createFromRazorpayPayment(razorpayPayment, userId, subscriptionDbId, tier, periodStart, periodEnd) {
    try {
      const user = await User.findById(userId).select('name email');
      const subscription = await Subscription.findById(subscriptionDbId);

      // Razorpay amounts are in paise (INR smallest unit)
      const amount = razorpayPayment.amount;
      const taxRate = parseFloat(process.env.RAZORPAY_TAX_RATE || '18'); // Default 18% GST
      const subtotal = Math.round(amount / (1 + taxRate / 100));
      const taxAmount = amount - subtotal;

      const invoiceData = {
        userId,
        subscriptionId: subscriptionDbId,
        provider: 'razorpay',
        providerInvoiceId: razorpayPayment.id,
        status: razorpayPayment.status === 'captured' ? 'paid' : 'open',
        currency: razorpayPayment.currency || 'inr',
        subtotal,
        taxAmount,
        total: amount,
        taxRate,
        taxDescription: 'GST ' + taxRate + '%',
        tier,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        paidAt: razorpayPayment.status === 'captured' ? new Date(razorpayPayment.created_at * 1000) : null,
        billingDetails: {
          name: razorpayPayment.billing?.name || user?.name || '',
          email: razorpayPayment.email || user?.email || '',
          address: {
            line1: subscription?.billingAddress?.line1 || '',
            city: subscription?.billingAddress?.city || '',
            state: subscription?.billingAddress?.state || '',
            postalCode: subscription?.billingAddress?.postalCode || '',
            country: subscription?.billingAddress?.country || 'IN',
          },
          taxId: subscription?.taxInfo?.taxId || null,
        },
        lineItems: [{
          description: 'CircleCore ' + tier.charAt(0).toUpperCase() + tier.slice(1) + ' Subscription',
          quantity: 1,
          unitAmount: subtotal,
          amount: amount,
        }],
      };

      const invoice = await Invoice.create(invoiceData);
      logger.info('Invoice created from Razorpay: ' + invoice.invoiceNumber);

      if (user && user.email && razorpayPayment.status === 'captured') {
        await this.sendInvoiceEmail(user, invoice);
      }

      return invoice;
    } catch (error) {
      logger.error('Failed to create invoice from Razorpay: ' + error.message);
      throw error;
    }
  }

  /**
   * Get all invoices for a user
   */
  async getUserInvoices(userId, { page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;
    const total = await Invoice.countDocuments({ userId });

    const invoices = await Invoice.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return {
      invoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a specific invoice
   */
  async getInvoice(invoiceId, userId) {
    const invoice = await Invoice.findOne({ _id: invoiceId, userId });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    return invoice;
  }

  /**
   * Send invoice email to user — Document requirement: tax compliant invoices
   */
  async sendInvoiceEmail(user, invoice) {
    try {
      const currencySymbol = invoice.currency === 'inr' ? '₹' : '$';
      const formatAmount = (amount) => (amount / 100).toFixed(2);

      const lineItemsHtml = invoice.lineItems.map(item =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${item.description}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${currencySymbol}${formatAmount(item.unitAmount)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${currencySymbol}${formatAmount(item.amount)}</td>
        </tr>`
      ).join('');

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:20px">
          <div style="background:#4F46E5;color:white;padding:20px;border-radius:8px 8px 0 0">
            <h1 style="margin:0;font-size:24px">CircleCore</h1>
            <p style="margin:4px 0 0 0;opacity:0.9">Tax Invoice</p>
          </div>

          <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <div style="display:flex;justify-content:space-between;margin-bottom:24px">
              <div>
                <p style="margin:0;color:#666;font-size:12px">INVOICE NUMBER</p>
                <p style="margin:4px 0 0 0;font-weight:bold">${invoice.invoiceNumber}</p>
              </div>
              <div style="text-align:right">
                <p style="margin:0;color:#666;font-size:12px">DATE</p>
                <p style="margin:4px 0 0 0;font-weight:bold">${new Date(invoice.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div style="background:#f9f9f9;padding:16px;border-radius:6px;margin-bottom:24px">
              <p style="margin:0;color:#666;font-size:12px">BILLED TO</p>
              <p style="margin:4px 0 0 0;font-weight:bold">${invoice.billingDetails.name || user.name}</p>
              <p style="margin:2px 0 0 0;color:#666">${invoice.billingDetails.email || user.email}</p>
              ${invoice.billingDetails.taxId ? '<p style="margin:2px 0 0 0;color:#666">Tax ID: ' + invoice.billingDetails.taxId + '</p>' : ''}
              ${invoice.billingDetails.address.line1 ? '<p style="margin:2px 0 0 0;color:#666">' + invoice.billingDetails.address.line1 + ', ' + invoice.billingDetails.address.city + '</p>' : ''}
            </div>

            <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
              <thead>
                <tr style="background:#f5f5f5">
                  <th style="padding:10px;text-align:left;font-size:12px;color:#666">DESCRIPTION</th>
                  <th style="padding:10px;text-align:center;font-size:12px;color:#666">QTY</th>
                  <th style="padding:10px;text-align:right;font-size:12px;color:#666">UNIT PRICE</th>
                  <th style="padding:10px;text-align:right;font-size:12px;color:#666">AMOUNT</th>
                </tr>
              </thead>
              <tbody>${lineItemsHtml}</tbody>
            </table>

            <div style="text-align:right;border-top:2px solid #eee;padding-top:16px">
              <p style="margin:4px 0;color:#666">Subtotal: <strong>${currencySymbol}${formatAmount(invoice.subtotal)}</strong></p>
              ${invoice.taxAmount > 0 ? '<p style="margin:4px 0;color:#666">' + invoice.taxDescription + ': <strong>' + currencySymbol + formatAmount(invoice.taxAmount) + '</strong></p>' : ''}
              <p style="margin:8px 0 0 0;font-size:18px;font-weight:bold">Total: ${currencySymbol}${formatAmount(invoice.total)}</p>
              <p style="margin:4px 0;color:#4CAF50;font-weight:bold">✓ PAID</p>
            </div>

            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee">
              <p style="color:#666;font-size:12px;margin:0">Billing period: ${new Date(invoice.periodStart).toLocaleDateString()} — ${new Date(invoice.periodEnd).toLocaleDateString()}</p>
              ${invoice.pdfUrl ? '<p style="margin:8px 0 0 0"><a href="' + invoice.pdfUrl + '" style="color:#4F46E5">Download PDF Invoice</a></p>' : ''}
            </div>
          </div>
        </div>
      `;

      await sendEmail({
        to: user.email,
        subject: 'CircleCore Invoice ' + invoice.invoiceNumber + ' — Payment Confirmed',
        html,
      });

      logger.info('Invoice email sent: ' + invoice.invoiceNumber + ' to: ' + user.email);
    } catch (error) {
      logger.warn('Invoice email failed: ' + error.message);
    }
  }

  /**
   * Extract tax description from Stripe invoice
   */
  _getTaxDescription(stripeInvoice) {
    if (stripeInvoice.tax_amounts && stripeInvoice.tax_amounts.length > 0) {
      const taxAmount = stripeInvoice.tax_amounts[0];
      if (taxAmount.tax_rate) {
        return taxAmount.tax_rate.display_name || 'Tax';
      }
    }
    return '';
  }
}

module.exports = new InvoiceService();