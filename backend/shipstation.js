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

function authHeader() {
    const auth = Buffer.from(
        `${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`
    ).toString("base64");
    return `Basic ${auth}`;
}

const NOT_CONFIGURED_RESULT = {
    success: false,
    skipped: true,
    message: "ShipStation isn't connected yet (API key/secret not set)."
};

// order: a row from the `orders` table.
// items: rows from `order_items` for that order.
async function sendOrderToShipStation(order, items) {
    if (!isConfigured()) {
        return NOT_CONFIGURED_RESULT;
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

    const response = await fetch(`${SHIPSTATION_BASE_URL}/orders/createorder`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader()
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

/* ============================================================
   LABEL PURCHASE — the part of ShipStation this project hadn't
   used yet: buying an actual shipping label (and getting a
   tracking number back) for an order that's already been created
   in ShipStation via sendOrderToShipStation() above.

   Nothing about which carrier/service/package to use is hardcoded
   here — listCarriers/listCarrierServices/listCarrierPackages let
   the admin panel ask ShipStation itself what's available (only
   carriers actually connected in the ShipStation account will show
   up), matching the "nothing hardcoded" rule used for shipping
   countries too.
   ============================================================ */

// Every carrier account connected in the ShipStation account
// (Settings -> Shipping -> Carriers). Empty array is normal if none
// are connected yet — the admin panel should say so, not error.
async function listCarriers() {
    if (!isConfigured()) return NOT_CONFIGURED_RESULT;

    const response = await fetch(`${SHIPSTATION_BASE_URL}/carriers`, {
        headers: { "Authorization": authHeader() }
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = (data && (data.Message || data.message)) || `ShipStation responded with HTTP ${response.status}`;
        throw new Error(message);
    }

    return { success: true, carriers: Array.isArray(data) ? data : [] };
}

// The shipping services (e.g. "USPS Priority Mail") a given carrier
// code offers.
async function listCarrierServices(carrierCode) {
    if (!isConfigured()) return NOT_CONFIGURED_RESULT;

    const response = await fetch(
        `${SHIPSTATION_BASE_URL}/carriers/listservices?carrierCode=${encodeURIComponent(carrierCode)}`,
        { headers: { "Authorization": authHeader() } }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = (data && (data.Message || data.message)) || `ShipStation responded with HTTP ${response.status}`;
        throw new Error(message);
    }

    return { success: true, services: Array.isArray(data) ? data : [] };
}

// The predefined package sizes (e.g. "Flat Rate Envelope") a given
// carrier code offers. Optional to use — plenty of services just need
// a weight, no specific package code.
async function listCarrierPackages(carrierCode) {
    if (!isConfigured()) return NOT_CONFIGURED_RESULT;

    const response = await fetch(
        `${SHIPSTATION_BASE_URL}/carriers/listpackages?carrierCode=${encodeURIComponent(carrierCode)}`,
        { headers: { "Authorization": authHeader() } }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = (data && (data.Message || data.message)) || `ShipStation responded with HTTP ${response.status}`;
        throw new Error(message);
    }

    return { success: true, packages: Array.isArray(data) ? data : [] };
}

// shipstationOrderId: the numeric id ShipStation assigned when the order
// was created (stored on our order as shipstation_order_id) — NOT our
// own order id.
async function purchaseLabelForOrder(shipstationOrderId, {
    carrierCode,
    serviceCode,
    packageCode,
    weightValue,
    weightUnits,
    testLabel
}) {
    if (!isConfigured()) return NOT_CONFIGURED_RESULT;

    if (!shipstationOrderId) {
        return {
            success: false,
            skipped: true,
            message: "This order hasn't been sent to ShipStation yet — send it there first."
        };
    }

    if (!carrierCode || !serviceCode) {
        return {
            success: false,
            skipped: true,
            message: "Carrier and service are required to purchase a label."
        };
    }

    const payload = {
        orderId: Number(shipstationOrderId),
        carrierCode,
        serviceCode,
        packageCode: packageCode || undefined,
        confirmation: "none",
        weight: {
            value: Number(weightValue) > 0 ? Number(weightValue) : 1,
            units: weightUnits || "pounds"
        },
        // Test labels don't actually get purchased/charged — useful for
        // trying this out before relying on it for a real order.
        testLabel: Boolean(testLabel)
    };

    const response = await fetch(`${SHIPSTATION_BASE_URL}/orders/createlabelfororder`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader()
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
        trackingNumber: data && data.trackingNumber,
        shipmentId: data && data.shipmentId,
        shipmentCost: data && data.shipmentCost,
        insuranceCost: data && data.insuranceCost,
        // Base64-encoded PDF — the caller uploads this somewhere
        // viewable (this project uploads it to the same Azure Blob
        // Storage container product images already use) rather than
        // storing the raw base64 in the database.
        labelBase64: data && data.labelData
    };
}

module.exports = {
    sendOrderToShipStation,
    isConfigured,
    listCarriers,
    listCarrierServices,
    listCarrierPackages,
    purchaseLabelForOrder
};
