/* ============================================================
   MAILER — sends the two customer-facing emails the store needs:

     1. Contact form notification  -> to the store inbox, whenever
        a visitor submits the Contact Us form.
     2. Order confirmation         -> to the customer, whenever an
        order is placed at checkout.

   Uses Hostinger's SMTP server (matches the MX records for
   thevintageartisans.com — mx1/mx2.hostinger.com), via nodemailer.
   Needs `npm install nodemailer`.

   Configure in your environment (Railway -> Variables):
     EMAIL_USER  = contact@thevintageartisans.com   (the mailbox to send from/to)
     EMAIL_PASS  = <that mailbox's password>          (NOT your hPanel login password)
     EMAIL_HOST  = smtp.hostinger.com                 (optional — this is the default)
     EMAIL_PORT  = 465                                (optional — this is the default)

   Fail-open by design: if email isn't configured yet, or a send
   fails, we log it and move on — a broken/missing mail setup must
   never break the contact form or checkout for the customer.
   ============================================================ */

const nodemailer = require("nodemailer");

const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.hostinger.com";
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 465);
const EMAIL_USER = process.env.EMAIL_USER; // e.g. contact@thevintageartisans.com
const EMAIL_PASS = process.env.EMAIL_PASS;

const STORE_NAME = "Vintage Artisans";

let transporter = null;

function isEmailConfigured() {
    return Boolean(EMAIL_USER && EMAIL_PASS);
}

function getTransporter() {
    if (transporter) return transporter;

    transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });

    return transporter;
}

// Every send goes through here so the fail-open behavior (log, don't
// throw) lives in exactly one place.
async function sendMail({ to, subject, html, replyTo }) {

    if (!isEmailConfigured()) {
        console.warn(
            `[mailer] EMAIL_USER / EMAIL_PASS not set — skipped email "${subject}" to ${to}.`
        );
        return { sent: false, reason: "not_configured" };
    }

    try {
        await getTransporter().sendMail({
            from: `"${STORE_NAME}" <${EMAIL_USER}>`,
            to,
            subject,
            html,
            replyTo: replyTo || undefined
        });

        return { sent: true };

    } catch (error) {
        console.error(`[mailer] Failed to send "${subject}" to ${to}:`, error.message);
        return { sent: false, reason: "send_failed" };
    }

}

// ========================================
// CONTACT FORM -> notify the store
// ========================================

async function sendContactNotification({ name, email, message }) {

    return sendMail({
        to: EMAIL_USER, // the store's own inbox
        replyTo: email, // hit "Reply" and it goes straight to the customer
        subject: `New contact form message from ${name}`,
        html: `
            <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
                <h2 style="margin:0 0 16px;">New message from your website</h2>
                <p><strong>Name:</strong> ${escapeHtml(name)}</p>
                <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                <p><strong>Message:</strong></p>
                <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
            </div>
        `
    });

}

// ========================================
// ORDER PLACED -> confirm to the customer
// ========================================

async function sendOrderConfirmation({ orderId, customer, items, total, currency, paymentMethod }) {

    if (!customer.email) {
        // Customer didn't provide an email — nothing to send.
        return { sent: false, reason: "no_customer_email" };
    }

    const paymentLabel = {
        cod: "Cash on Delivery",
        stripe: "Card (Stripe)",
        easypaisa: "Easypaisa",
        jazzcash: "JazzCash",
        bank_transfer: "Bank Transfer"
    }[paymentMethod] || paymentMethod;

    const itemsRows = items.map(item => `
        <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(item.name)} × ${item.quantity}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${formatMoney(item.price * item.quantity, currency)}</td>
        </tr>
    `).join("");

    return sendMail({
        to: customer.email,
        subject: `Order Confirmed — #${orderId} | ${STORE_NAME}`,
        html: `
            <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:520px;">
                <h2 style="margin:0 0 8px;color:#05295E;">Thanks for your order, ${escapeHtml(customer.fullName)}!</h2>
                <p>We've received order <strong>#${orderId}</strong> and we're getting it ready.</p>

                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    ${itemsRows}
                    <tr>
                        <td style="padding:8px 10px;font-weight:bold;">Total</td>
                        <td style="padding:8px 10px;text-align:right;font-weight:bold;">${formatMoney(total, currency)}</td>
                    </tr>
                </table>

                <p><strong>Payment Method:</strong> ${escapeHtml(paymentLabel)}</p>
                <p><strong>Shipping to:</strong><br>
                    ${escapeHtml(customer.address)}<br>
                    ${escapeHtml(customer.city || "")} ${escapeHtml(customer.postalCode || "")}<br>
                    ${escapeHtml(customer.country)}
                </p>

                <p style="margin-top:24px;color:#666;font-size:13px;">
                    Questions about your order? Just reply to this email.
                </p>
            </div>
        `
    });

}

// ========================================
// ORDER PLACED -> notify the store too, so a new order is never
// missed just because nobody happened to check the admin panel.
// ========================================

async function sendOrderNotificationToStore({ orderId, customer, total, currency, paymentMethod }) {

    return sendMail({
        to: EMAIL_USER,
        replyTo: customer.email || undefined,
        subject: `New order #${orderId} — ${formatMoney(total, currency)} (${paymentMethod})`,
        html: `
            <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
                <h2 style="margin:0 0 16px;">New order placed</h2>
                <p><strong>Order:</strong> #${orderId}</p>
                <p><strong>Customer:</strong> ${escapeHtml(customer.fullName)} (${escapeHtml(customer.phone)}${customer.email ? `, ${escapeHtml(customer.email)}` : ""})</p>
                <p><strong>Total:</strong> ${formatMoney(total, currency)}</p>
                <p><strong>Payment Method:</strong> ${escapeHtml(paymentMethod)}</p>
                <p><strong>Ship to:</strong> ${escapeHtml(customer.address)}, ${escapeHtml(customer.city || "")}, ${escapeHtml(customer.country)}</p>
                <p style="margin-top:16px;color:#666;font-size:13px;">Open the admin panel to see full order details.</p>
            </div>
        `
    });

}

// ---- small helpers ----

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Mirrors JS/price-format.js's formatPrice() so emails show the same
// currency the customer saw on the site (PKR by default, otherwise
// whatever currency their cart/order was in).
function formatMoney(amount, currency) {
    const n = Number(amount || 0);
    const code = (currency || "PKR").toUpperCase();

    if (code === "PKR") {
        return `Rs. ${n.toFixed(2)}`;
    }

    try {
        return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(n);
    } catch (error) {
        return `${code} ${n.toFixed(2)}`;
    }
}

module.exports = {
    isEmailConfigured,
    sendContactNotification,
    sendOrderConfirmation,
    sendOrderNotificationToStore
};
