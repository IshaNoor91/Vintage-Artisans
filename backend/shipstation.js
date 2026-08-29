/* ============================================================
   SHIPSTATION — send an order to ShipStation for shipping/labels.
   Only used for orders whose country is NOT Pakistan (Pakistan
   orders are shipped locally, not through ShipStation).

   Needs two environment variables to actually do anything:
       SHIPSTATION_API_KEY
       SHIPSTATION_API_SECRET
   Get these from the ShipStation account: Settings (gear icon,
   top right) -> Account -> API Settings -> "API Keys" (generate
   if none exist yet). Until both are set, sendOrderToShipStation
   just reports itself as "not configured" and does nothing —
   it never blocks or breaks placing an order.
   ============================================================ */

const countryCodes = require("./country-codes");

const SHIPSTATION_BASE_URL = "https://ssapi.shipstation.com";

function isConfigured() {
    return Boolean(process.env.SHIPSTATION_API_KEY && process.env.SHIPSTATION_API_SECRET);
}

// order: a row from the `orders` table.
// items: rows from `order_items` for that order.
async function sendOrderToShipStation(order, items) {
    if (!isConfigured()) {
        return {
            success: false,
            skipped: true,
            message: "ShipStation isn't connected yet (API key/secret not set)."
        };
    }

    const countryCode = countryCodes[order.country];
    if (!countryCode) {
        return {
            success: false,
            skipped: true,
            message: `"${order.country}" isn't a recognized country name — couldn't send to ShipStation.`
        };
    }

    const address = {
        name: order.customer_name,
        street1: order.address,
        city: order.city,
        postalCode: order.postal_code || "",
        country: countryCode,
        phone: order.phone || ""
    };

    const payload = {
        // Re-using the same orderNumber on every call means ShipStation
        // UPDATES the existing order instead of creating a duplicate —
        // that makes this function safe to call more than once for the
        // same order (e.g. a manual retry from the admin panel).
        orderNumber: `VA-${order.id}`,
        orderDate: new Date(order.created_at || Date.now()).toISOString(),
        orderStatus: "awaiting_shipment",
        billTo: address,
        shipTo: address,
        items: items.map(item => ({
            sku: item.product_id ? String(item.product_id) : undefined,
            name: item.product_name,
            quantity: item.quantity,
            unitPrice: Number(item.price)
        })),
        amountPaid: order.payment_method === "cod" ? 0 : Number(order.total),
        orderTotal: Number(order.total)
    };

    const auth = Buffer.from(
        `${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`
    ).toString("base64");

    const response = await fetch(`${SHIPSTATION_BASE_URL}/orders/createorder`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${auth}`
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = (data && (data.Message || data.message)) || `ShipStation responded with HTTP ${response.status}`;
        throw new Error(message);
    }

    return {
        success: true,
        shipstationOrderId: data && data.orderId,
        shipstationOrderKey: data && data.orderKey
    };
}

module.exports = { sendOrderToShipStation, isConfigured };
