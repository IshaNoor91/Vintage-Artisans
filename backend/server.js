const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
const {
    sendOrderToShipStation,
    listCarriers,
    listCarrierServices,
    listCarrierPackages,
    purchaseLabelForOrder
} = require("./shipstation");
const pool = require("./db");
const { getClientIP, getCountryFromIP } = require("./geolocation");
const { resolveProductPrices } = require("./pricing");
const { FLAGS, isFeatureEnabled, getAllFeatureFlags, setFeatureFlag } = require("./feature-flags");
const { sendContactNotification, sendOrderConfirmation, sendOrderNotificationToStore } = require("./mailer");

// ========================================
// STRIPE
// Uses a placeholder key until you set STRIPE_SECRET_KEY in your
// environment (Railway → Variables). Needs `npm install stripe`.
// ========================================
const stripe = require("stripe")(
    process.env.STRIPE_SECRET_KEY || "sk_test_REPLACE_WITH_YOUR_SECRET_KEY"
);

const app = express();

// Any localhost/127.0.0.1 port is allowed automatically (Live Server on
// :5500, the Admin panel's Vite dev server, which bumps to a new port
// like :5174 or :5175 whenever an earlier one is still running) — so a
// busy port never breaks "Failed to fetch" on the admin login again.
// Only the two live Netlify sites are separately allow-listed for
// production.
const PROD_ORIGINS = [
    "https://cozy-trifle-37f6b4.netlify.app",
    "https://vintage-artisans.netlify.app"
];

app.use(cors({
    origin: (origin, callback) => {
        // No Origin header at all (e.g. a server-to-server request) — allow.
        if (!origin) return callback(null, true);

        if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            return callback(null, true);
        }

        if (PROD_ORIGINS.includes(origin)) {
            return callback(null, true);
        }

        callback(new Error(`Not allowed by CORS: ${origin}`));
    }
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

// ========================================
// PRODUCT IMAGE UPLOADS (Azure Blob Storage)
// Admin panel "choose file" uploads land here instead of someone having
// to paste a URL by hand — see POST /api/admin/upload below.
// Uses the same AZURE_STORAGE_CONNECTION_STRING / AZURE_CONTAINER_NAME
// env vars as migrate-images-to-azure.js and setup-azure-storage.js.
// ========================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB per image
});

// Wrapped in try/catch so a missing/invalid AZURE_STORAGE_CONNECTION_STRING
// on this server doesn't crash the whole app on startup — it just makes the
// /api/admin/upload route report a clear error until the Railway variable
// is set (see the note below the route for what to add).
let azureContainerClient = null;
try {
    azureContainerClient = BlobServiceClient
        .fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
        .getContainerClient(process.env.AZURE_CONTAINER_NAME || "product-images");
} catch (error) {
    console.error("Azure Blob Storage not configured — image uploads will fail until AZURE_STORAGE_CONNECTION_STRING is set:", error.message);
}

// ========================================
// ADMIN AUTH MIDDLEWARE
// Protects any route it's attached to.
// Expects: Authorization: Bearer <token>
// ========================================

function requireAdminAuth(req, res, next) {

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "No token provided"
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }

}

// Goes right after requireAdminAuth on any route that only a Super
// Admin should reach (currently just Team/user management). A Store
// Admin still passes requireAdminAuth (they can log in) but is
// blocked here.
function requireSuperAdmin(req, res, next) {
    if (!req.admin || req.admin.role !== "super_admin") {
        return res.status(403).json({
            success: false,
            message: "Only a Super Admin can do this."
        });
    }
    next();
}


const PORT = process.env.PORT || 3000;

// ========================================
// LOCATION-BASED PRICING
// Works out which country a request is coming from — an explicit
// ?country=XX query param wins (used for testing, or a future manual
// currency switcher), otherwise it's detected from the request's IP.
// Never throws: returns null if detection fails, and every caller
// treats null the same as Pakistan/PKR (see pricing.js).
// ========================================
async function resolveRequestCountry(req) {
    if (req.query.country && /^[A-Za-z]{2}$/.test(req.query.country)) {
        return req.query.country.toUpperCase();
    }

    try {
        const ip = getClientIP(req);
        return await getCountryFromIP(ip);
    } catch (error) {
        console.error("[pricing] Country detection failed:", error.message);
        return null;
    }
}

// Public — lets the frontend show "Prices shown in GBP" style messaging
// if it wants to, without duplicating the IP-detection logic itself.
app.get("/api/detect-location", async (req, res) => {
    try {
        const countryCode = await resolveRequestCountry(req);
        res.json({ success: true, countryCode: countryCode || null });
    } catch (error) {
        console.error("Error detecting location:", error);
        res.json({ success: true, countryCode: null });
    }
});

app.get("/", (req, res) => {
    res.send("Vintage Artisans backend is running!");
});

app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            success: true,
            message: "PostgreSQL connected successfully!",
            time: result.rows[0].now
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});
app.get("/api/products", async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 24;
        const offset = (page - 1) * limit;

        // ========================================
        // FILTER / SORT PARAMS
        // category: category slug (optional)
        // minPrice / maxPrice: numeric range (optional)
        // sort: name-asc | name-desc | price-asc | price-desc | newest | default
        // ========================================
        const category = req.query.category || null;
        const minPrice = req.query.minPrice !== undefined ? parseFloat(req.query.minPrice) : null;
        const maxPrice = req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice) : null;
        const sort = req.query.sort || "default";
        const search = req.query.search ? req.query.search.trim() : null;

        let joinClause = "";
        const whereConditions = ["p.published = true"];
        const params = [];
        let paramIndex = 1;

        if (category) {
            joinClause = `
                JOIN product_categories pc ON p.id = pc.product_id
                JOIN categories c ON pc.category_id = c.id
            `;
            whereConditions.push(`c.slug = $${paramIndex}`);
            params.push(category);
            paramIndex++;
        }

        if (search) {
            whereConditions.push(`(p.name ILIKE $${paramIndex} OR p.short_description ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (minPrice !== null && !Number.isNaN(minPrice)) {
            whereConditions.push(`COALESCE(p.sale_price, p.regular_price) >= $${paramIndex}`);
            params.push(minPrice);
            paramIndex++;
        }

        if (maxPrice !== null && !Number.isNaN(maxPrice)) {
            whereConditions.push(`COALESCE(p.sale_price, p.regular_price) <= $${paramIndex}`);
            params.push(maxPrice);
            paramIndex++;
        }

        const whereClause = whereConditions.join(" AND ");

        let orderBy = "p.id ASC";
        switch (sort) {
            case "price-asc": orderBy = "effective_price ASC"; break;
            case "price-desc": orderBy = "effective_price DESC"; break;
            case "name-asc": orderBy = "p.name ASC"; break;
            case "name-desc": orderBy = "p.name DESC"; break;
            case "newest": orderBy = "p.id DESC"; break;
            default: orderBy = "p.id ASC";
        }

        const productsQuery = `
            SELECT DISTINCT
                p.id,
                p.name,
                p.product_type,
                p.short_description,
                p.description,
                p.regular_price,
                p.sale_price,
                p.stock,
                p.in_stock,
                p.images,
                p.tags,
                p.published,
                p.featured,
                COALESCE(p.sale_price, p.regular_price) AS effective_price
            FROM products p
            ${joinClause}
            WHERE ${whereClause}
            ORDER BY ${orderBy}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const productsParams = [...params, limit, offset];
        const productsResult = await pool.query(productsQuery, productsParams);

        const countQuery = `
            SELECT COUNT(DISTINCT p.id) AS total
            FROM products p
            ${joinClause}
            WHERE ${whereClause}
        `;
        const countResult = await pool.query(countQuery, params);

        const total = parseInt(countResult.rows[0].total, 10);

        // Filtering/sorting above happens in PKR (min/max price bounds
        // and "price-asc"/"price-desc" all come from the price-range
        // slider, which is PKR-denominated) — converting AFTER doesn't
        // change sort order (currency conversion is just multiplying by
        // a positive number), it only changes what price is displayed.
        const countryCode = await resolveRequestCountry(req);
        const products = await resolveProductPrices(productsResult.rows, countryCode);

        res.json({
            success: true,
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
            products: products
        });

    } catch (error) {
        console.error("Error fetching products:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch products"
        });
    }
});app.get("/api/products/category/:slug", async (req, res) => {
    try {
        const { slug } = req.params;

        // ========================================
        // FILTER / SORT PARAMS
        // ========================================
        const minPrice = req.query.minPrice !== undefined ? parseFloat(req.query.minPrice) : null;
        const maxPrice = req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice) : null;
        const sort = req.query.sort || "default";

        const whereConditions = ["c.slug = $1", "p.published = true"];
        const params = [slug];
        let paramIndex = 2;

        if (minPrice !== null && !Number.isNaN(minPrice)) {
            whereConditions.push(`COALESCE(p.sale_price, p.regular_price) >= $${paramIndex}`);
            params.push(minPrice);
            paramIndex++;
        }

        if (maxPrice !== null && !Number.isNaN(maxPrice)) {
            whereConditions.push(`COALESCE(p.sale_price, p.regular_price) <= $${paramIndex}`);
            params.push(maxPrice);
            paramIndex++;
        }

        let orderBy = "p.id ASC";
        switch (sort) {
            case "price-asc": orderBy = "effective_price ASC"; break;
            case "price-desc": orderBy = "effective_price DESC"; break;
            case "name-asc": orderBy = "p.name ASC"; break;
            case "name-desc": orderBy = "p.name DESC"; break;
            case "newest": orderBy = "p.id DESC"; break;
            default: orderBy = "p.id ASC";
        }

        const result = await pool.query(
    `
    SELECT DISTINCT
        p.id,
        p.name,
        p.product_type,
        p.short_description,
        p.regular_price,
        p.sale_price,
        p.images,
        p.in_stock,
        p.featured,
        c.name AS category_name,
        COALESCE(p.sale_price, p.regular_price) AS effective_price
    FROM products p
    JOIN product_categories pc
        ON p.id = pc.product_id
    JOIN categories c
        ON pc.category_id = c.id
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY ${orderBy}
    `,
    params
);

        const countryCode = await resolveRequestCountry(req);
        const products = await resolveProductPrices(result.rows, countryCode);

        res.json({
    success: true,
    category: result.rows.length > 0
        ? result.rows[0].category_name
        : slug,
    count: result.rows.length,
    products: products
});
    } catch (error) {
        console.error("Error fetching category products:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch category products"
        });
    }
});
// ========================================
// SEARCH — used by the header search dropdown (navbar.js)
// Returns a small set of matching products AND categories
// ========================================

app.get("/api/search", async (req, res) => {
    try {
        const q = req.query.q ? req.query.q.trim() : "";

        if (!q) {
            return res.json({
                success: true,
                products: [],
                categories: []
            });
        }

        const likeTerm = `%${q}%`;

        const productsResult = await pool.query(
            `
            SELECT
                id,
                name,
                regular_price,
                sale_price,
                images
            FROM products
            WHERE published = true
              AND name ILIKE $1
            ORDER BY name ASC
            LIMIT 6
            `,
            [likeTerm]
        );

        const categoriesResult = await pool.query(
            `
            SELECT id, name, slug
            FROM categories
            WHERE name ILIKE $1
            ORDER BY name ASC
            LIMIT 5
            `,
            [likeTerm]
        );

        const countryCode = await resolveRequestCountry(req);
        const products = await resolveProductPrices(productsResult.rows, countryCode);

        res.json({
            success: true,
            products: products,
            categories: categoriesResult.rows
        });

    } catch (error) {
        console.error("Error in /api/search:", error);

        res.status(500).json({
            success: false,
            message: "Search failed"
        });
    }
});

app.get("/api/categories", async (req, res) => {
    try {
        // ?type=product or ?type=design filters to just that kind of
        // category (used by the storefront's Shop/Design Family menus and
        // the shop/category sidebar filters, which should never mix the
        // two). No ?type= at all (e.g. the admin panel) returns everything.
        const { type } = req.query;
        const params = [];
        let query = `SELECT id, name, slug FROM categories`;

        if (type === "product" || type === "design") {
            query += ` WHERE category_type = $1`;
            params.push(type);
        }

        query += ` ORDER BY name`;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            categories: result.rows
        });

    } catch (error) {
        console.error("Error fetching categories:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch categories"
        });
    }
});
// ========================================
// SHIPPING COUNTRIES — public, enabled-only list for the checkout
// Country dropdown (JS/checkout.js). Which countries are enabled is
// configured from Admin -> Shipping Countries, never hardcoded here.
// ========================================
app.get("/api/shipping-countries", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT name, code
            FROM shipping_countries
            WHERE enabled = true
            ORDER BY (name = 'Pakistan') DESC, name ASC
        `);

        res.json({
            success: true,
            countries: result.rows
        });

    } catch (error) {
        console.error("Error fetching shipping countries:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch shipping countries"
        });
    }
});

// ========================================
// PAYMENT METHODS — public, enabled-only list for the checkout
// Payment Method selector (JS/checkout.js). Which methods are enabled,
// and which are Pakistan-only (mobile wallets like Easypaisa/JazzCash),
// is configured from Admin -> Payment Methods, never hardcoded here.
// ========================================
app.get("/api/payment-methods", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT key, label, country_only
            FROM payment_methods
            WHERE enabled = true
            ORDER BY sort_order ASC
        `);

        res.json({
            success: true,
            methods: result.rows
        });

    } catch (error) {
        console.error("Error fetching payment methods:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch payment methods"
        });
    }
});

app.get("/api/products/price-range", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                MIN(COALESCE(sale_price, regular_price)) AS min_price,
                MAX(COALESCE(sale_price, regular_price)) AS max_price
            FROM products
            WHERE published = true
        `);

        res.json({
            success: true,
            minPrice: Number(result.rows[0].min_price) || 0,
            maxPrice: Number(result.rows[0].max_price) || 0
        });

    } catch (error) {
        console.error("Error fetching price range:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch price range"
        });
    }
});

app.get("/api/products/:id", async (req, res) => {
    try {
        const productId = req.params.id;

        // Get product
        const productResult = await pool.query(
            `
            SELECT
                id,
                name,
                product_type,
                short_description,
                description,
                regular_price,
                sale_price,
                stock,
                in_stock,
                weight_kg,
                length_cm,
                width_cm,
                height_cm,
                images,
                tags,
                published,
                featured
            FROM products
            WHERE id = $1
            `,
            [productId]
        );

        // Product doesn't exist
        if (productResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const product = productResult.rows[0];

        // Get categories
        const categoryResult = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.slug
            FROM categories c
            JOIN product_categories pc
                ON c.id = pc.category_id
            WHERE pc.product_id = $1
            `,
            [productId]
        );

        // Get variations
        const variationResult = await pool.query(
            `
            SELECT
                id,
                product_id,
                sku,
                name,
                regular_price,
                sale_price,
                stock,
                in_stock,
                attribute_1_name,
                attribute_1_value,
                attribute_2_name,
                attribute_2_value,
                image
            FROM product_variations
            WHERE product_id = $1
            ORDER BY id
            `,
            [productId]
        );

        const countryCode = await resolveRequestCountry(req);
        const [resolvedProduct] = await resolveProductPrices([product], countryCode);

        res.json({
            success: true,
            product: {
                ...resolvedProduct,
                categories: categoryResult.rows,
                variations: variationResult.rows
            }
        });

    } catch (error) {
        console.error("Error fetching product:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch product"
        });
    }
});
// ========================================
// STRIPE — create a PaymentIntent for checkout
// NOTE: Stripe does not support merchant accounts registered in
// Pakistan directly (as of 2026). You'll need a Stripe account
// registered in a supported country before this can go live.
// Set STRIPE_CURRENCY in your environment once you know which
// currency your Stripe account will settle in (defaults to usd).
// ========================================

app.post("/api/create-payment-intent", async (req, res) => {
    try {
        const amount = Number(req.body.amount);

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid amount"
            });
        }

        const currency = process.env.STRIPE_CURRENCY || "usd";

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // smallest currency unit
            currency: currency
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret
        });

    } catch (error) {
        console.error("Error creating payment intent:", error);

        res.status(500).json({
            success: false,
            message: "Could not start payment"
        });
    }
});

// ========================================
// SHIPSTATION SYNC
// Runs AFTER an order's DB transaction has already committed (never as
// part of it — an external API call is too slow/unreliable to hold a DB
// transaction open for). Used both automatically (non-Pakistan orders,
// right after checkout) and manually (admin panel "Resend to ShipStation"
// button, for retrying a failed/skipped attempt).
// ========================================
async function syncOrderToShipStation(orderId) {
    // Admin -> Settings -> "ShipStation Integration" switch. Off means
    // orders are still placed/stored normally — they just aren't sent to
    // ShipStation until the flag is turned back on (and can be resent
    // manually afterwards from the Order Detail page).
    if (!(await isFeatureEnabled(FLAGS.SHIPSTATION_ENABLED))) {
        console.log(`[shipstation] Order ${orderId} skipped: ShipStation is disabled (feature flag).`);
        await pool.query(
            `UPDATE orders SET shipstation_sync_error = $1 WHERE id = $2`,
            ["ShipStation is currently disabled in Admin -> Settings.", orderId]
        );
        return;
    }

    const orderResult = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    if (orderResult.rows.length === 0) return;
    const order = orderResult.rows[0];

    const itemsResult = await pool.query(
        `SELECT product_id, product_name, price, quantity FROM order_items WHERE order_id = $1`,
        [orderId]
    );

    try {
        const result = await sendOrderToShipStation(order, itemsResult.rows);

        if (result.success) {
            await pool.query(
                `UPDATE orders
                 SET shipstation_order_id = $1, shipstation_synced_at = NOW(), shipstation_sync_error = NULL
                 WHERE id = $2`,
                [result.shipstationOrderId ? String(result.shipstationOrderId) : null, orderId]
            );
            console.log(`[shipstation] Order ${orderId} sent successfully.`);
        } else {
            await pool.query(
                `UPDATE orders SET shipstation_sync_error = $1 WHERE id = $2`,
                [result.message, orderId]
            );
            console.log(`[shipstation] Order ${orderId} skipped: ${result.message}`);
        }
    } catch (error) {
        console.error(`[shipstation] Order ${orderId} failed:`, error.message);
        await pool.query(
            `UPDATE orders SET shipstation_sync_error = $1 WHERE id = $2`,
            [error.message, orderId]
        );
    }
}

app.post("/api/orders", async (req, res) => {

    const { customer, items, subtotal, total, currency, paymentMethod, paymentReference } = req.body;

    if (!customer || !customer.fullName || !customer.phone || !customer.address) {
        return res.status(400).json({
            success: false,
            message: "Missing required customer details"
        });
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Order has no items"
        });
    }

    // ========================================
    // COUNTRY — must be one of the countries currently enabled in
    // Admin -> Shipping Countries. Checked server-side too (not just in
    // the checkout dropdown) so a request that bypasses the frontend
    // can't create an order for a country we don't actually ship to.
    // ========================================

    const orderCountry = (customer.country || "Pakistan").trim();

    try {
        const countryCheck = await pool.query(
            `SELECT 1 FROM shipping_countries WHERE name = $1 AND enabled = true`,
            [orderCountry]
        );

        if (countryCheck.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `Sorry, we don't currently ship to "${orderCountry}".`
            });
        }
    } catch (error) {
        console.error("Error checking shipping country:", error);
        return res.status(500).json({
            success: false,
            message: "Could not verify shipping country"
        });
    }

    // ========================================
    // PAYMENT METHOD — must be one of the methods currently enabled in
    // Admin -> Payment Methods. Checked server-side too (not just in the
    // checkout UI) so a request that bypasses the frontend can't use a
    // method the store has turned off, or a wallet (Easypaisa/JazzCash)
    // for a country it isn't offered in.
    // ========================================

    const requestedMethod = paymentMethod || "cod";
    let methodRow;

    try {
        const methodResult = await pool.query(
            `SELECT key, country_only FROM payment_methods WHERE key = $1 AND enabled = true`,
            [requestedMethod]
        );
        methodRow = methodResult.rows[0];
    } catch (error) {
        console.error("Error checking payment method:", error);
        return res.status(500).json({
            success: false,
            message: "Could not verify payment method"
        });
    }

    if (!methodRow) {
        return res.status(400).json({
            success: false,
            message: `"${requestedMethod}" is not an available payment method right now.`
        });
    }

    if (methodRow.country_only && methodRow.country_only !== orderCountry) {
        return res.status(400).json({
            success: false,
            message: `${methodRow.key} is only available for orders shipping to ${methodRow.country_only}.`
        });
    }

    const method = methodRow.key;

    let orderStatus = "pending";

    if (method === "stripe") {

        if (!paymentReference) {
            return res.status(400).json({
                success: false,
                message: "Missing payment confirmation"
            });
        }

        try {

            const intent = await stripe.paymentIntents.retrieve(paymentReference);

            if (intent.status !== "succeeded") {
                return res.status(400).json({
                    success: false,
                    message: "Payment not completed"
                });
            }

            orderStatus = "paid";

        } catch (error) {

            console.error("Error verifying Stripe payment:", error);

            return res.status(400).json({
                success: false,
                message: "Could not verify payment"
            });

        }

    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const orderResult = await client.query(
            `
            INSERT INTO orders (
                customer_name,
                email,
                phone,
                address,
                city,
                postal_code,
                country,
                notes,
                subtotal,
                total,
                payment_method,
                payment_reference,
                status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id
            `,
            [
                customer.fullName,
                customer.email || null,
                customer.phone,
                customer.address,
                customer.city || null,
                customer.postalCode || null,
                orderCountry,
                customer.notes || null,
                subtotal || 0,
                total || subtotal || 0,
                method,
                paymentReference || null,
                orderStatus
            ]
        );

        const orderId = orderResult.rows[0].id;

        for (const item of items) {
            await client.query(
                `
                INSERT INTO order_items (
                    order_id,
                    product_id,
                    product_name,
                    price,
                    quantity
                )
                VALUES ($1,$2,$3,$4,$5)
                `,
                [
                    orderId,
                    item.productId || null,
                    item.name || "Unknown product",
                    item.price || 0,
                    item.quantity || 1
                ]
            );
        }

        await client.query("COMMIT");

        res.json({
            success: true,
            orderId: orderId
        });

        // Non-Pakistan orders go to ShipStation automatically — done AFTER
        // responding, in the background, so the customer's checkout is
        // never slowed down by (or dependent on) ShipStation being up.
        if (orderCountry.toLowerCase() !== "pakistan") {
            syncOrderToShipStation(orderId).catch(error => {
                console.error(`[shipstation] Unexpected error syncing order ${orderId}:`, error);
            });
        }

        // Confirmation email to the customer + a heads-up to the store
        // inbox — also done after responding, in the background. Both
        // fail silently (logged, not thrown) if email isn't configured
        // yet, so this never affects the order itself.
        const orderCustomer = { ...customer, country: orderCountry };

        sendOrderConfirmation({
            orderId,
            customer: orderCustomer,
            items,
            total: total || subtotal || 0,
            currency,
            paymentMethod: method
        });

        sendOrderNotificationToStore({
            orderId,
            customer: orderCustomer,
            total: total || subtotal || 0,
            currency,
            paymentMethod: method
        });

    } catch (error) {

        await client.query("ROLLBACK");

        console.error("Error creating order:", error);

        res.status(500).json({
            success: false,
            message: "Failed to place order"
        });

    } finally {

        client.release();

    }

});


// ========================================================
// ============  ADMIN: AUTH  ==============================
// ========================================================

app.post("/api/admin/login", async (req, res) => {

    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required"
            });
        }

        const result = await pool.query(
            `SELECT id, username, password_hash, role, store_id FROM admin_users WHERE username = $1`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        const admin = result.rows[0];
        const passwordMatches = await bcrypt.compare(password, admin.password_hash);

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        // role/storeId baked into the token itself, so every protected
        // route can tell who's allowed to see what without an extra
        // database lookup on every request.
        const token = jwt.sign(
            { id: admin.id, username: admin.username, role: admin.role, storeId: admin.store_id },
            JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            success: true,
            token: token,
            username: admin.username,
            role: admin.role,
            storeId: admin.store_id
        });

    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ success: false, message: "Login failed" });
    }

});

app.get("/api/admin/me", requireAdminAuth, (req, res) => {
    res.json({ success: true, admin: req.admin });
});


// ========================================================
// ============  ADMIN: STORES  ==============================
// ========================================================
// Just the list of storefronts sharing this backend — used by the
// Team page's "which store" dropdown when creating/editing a Store
// Admin. Every logged-in admin can read this (it's just names), not
// only Super Admins.

app.get("/api/admin/stores", requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, slug FROM stores ORDER BY name ASC`);
        res.json({ success: true, stores: result.rows });
    } catch (error) {
        console.error("Error fetching stores:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stores" });
    }
});


// ========================================================
// ============  ADMIN: TEAM (USERS)  =========================
// ========================================================
// Super Admin only — create/manage the login accounts for this admin
// panel. 'store_admin' accounts are limited to one store (store_id);
// 'super_admin' accounts aren't limited to any (store_id stays null).
// Passwords are never returned in any response here.

app.get("/api/admin/users", requireAdminAuth, requireSuperAdmin, async (req, res) => {

    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.role, u.store_id, s.name AS store_name, u.created_at
            FROM admin_users u
            LEFT JOIN stores s ON s.id = u.store_id
            ORDER BY u.created_at ASC
        `);

        res.json({ success: true, users: result.rows });

    } catch (error) {
        console.error("Error fetching admin users:", error);
        res.status(500).json({ success: false, message: "Failed to fetch users" });
    }

});

app.post("/api/admin/users", requireAdminAuth, requireSuperAdmin, async (req, res) => {

    const { username, password, role, storeId } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    if (role !== "super_admin" && role !== "store_admin") {
        return res.status(400).json({ success: false, message: "Role must be Super Admin or Store Admin" });
    }

    if (role === "store_admin" && !storeId) {
        return res.status(400).json({ success: false, message: "A Store Admin must be assigned a store" });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO admin_users (username, password_hash, role, store_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, username, role, store_id, created_at
            `,
            [username, passwordHash, role, role === "store_admin" ? storeId : null]
        );

        res.json({ success: true, user: result.rows[0] });

    } catch (error) {
        if (error.code === "23505") { // unique_violation on username
            return res.status(400).json({ success: false, message: "That username is already taken" });
        }
        console.error("Error creating admin user:", error);
        res.status(500).json({ success: false, message: "Failed to create user" });
    }

});

// Body: { role, storeId, password } — password is optional (only sent
// when resetting it); role/storeId are optional too (omit both to
// only reset the password).
app.put("/api/admin/users/:id", requireAdminAuth, requireSuperAdmin, async (req, res) => {

    const userId = req.params.id;
    const { role, storeId, password } = req.body;

    if (role !== undefined && role !== "super_admin" && role !== "store_admin") {
        return res.status(400).json({ success: false, message: "Role must be Super Admin or Store Admin" });
    }

    if (role === "store_admin" && !storeId) {
        return res.status(400).json({ success: false, message: "A Store Admin must be assigned a store" });
    }

    try {
        // Never let the panel end up with zero accounts that can log in
        // as Super Admin.
        if (role === "store_admin") {
            const remaining = await pool.query(
                `SELECT COUNT(*)::int AS count FROM admin_users WHERE role = 'super_admin' AND id != $1`,
                [userId]
            );
            if (remaining.rows[0].count === 0) {
                return res.status(400).json({ success: false, message: "Can't remove the last Super Admin." });
            }
        }

        const fields = [];
        const values = [];
        let i = 1;

        if (role !== undefined) {
            fields.push(`role = $${i++}`);
            values.push(role);
            fields.push(`store_id = $${i++}`);
            values.push(role === "store_admin" ? storeId : null);
        }

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            fields.push(`password_hash = $${i++}`);
            values.push(passwordHash);
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: "Nothing to update" });
        }

        values.push(userId);

        const result = await pool.query(
            `UPDATE admin_users SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, username, role, store_id`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, user: result.rows[0] });

    } catch (error) {
        console.error("Error updating admin user:", error);
        res.status(500).json({ success: false, message: "Failed to update user" });
    }

});

app.delete("/api/admin/users/:id", requireAdminAuth, requireSuperAdmin, async (req, res) => {

    const userId = req.params.id;

    if (String(req.admin.id) === String(userId)) {
        return res.status(400).json({ success: false, message: "You can't delete your own account while logged in." });
    }

    try {
        const target = await pool.query(`SELECT role FROM admin_users WHERE id = $1`, [userId]);

        if (target.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (target.rows[0].role === "super_admin") {
            const remaining = await pool.query(
                `SELECT COUNT(*)::int AS count FROM admin_users WHERE role = 'super_admin' AND id != $1`,
                [userId]
            );
            if (remaining.rows[0].count === 0) {
                return res.status(400).json({ success: false, message: "Can't delete the last Super Admin." });
            }
        }

        await pool.query(`DELETE FROM admin_users WHERE id = $1`, [userId]);
        res.json({ success: true });

    } catch (error) {
        console.error("Error deleting admin user:", error);
        res.status(500).json({ success: false, message: "Failed to delete user" });
    }

});


// ========================================================
// ============  ADMIN: DASHBOARD STATS  ===================
// ========================================================

app.get("/api/admin/stats", requireAdminAuth, async (req, res) => {

    try {
        const [
            productCount,
            lowStockCount,
            orderStats,
            recentOrders
        ] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS total FROM products WHERE published = true`),
            pool.query(`SELECT COUNT(*) AS total FROM products WHERE stock IS NOT NULL AND stock < 5`),
            pool.query(`
                SELECT
                    COUNT(*) AS total_orders,
                    COALESCE(SUM(total), 0) AS total_revenue,
                    COUNT(*) FILTER (WHERE status = 'pending') AS pending_orders
                FROM orders
            `),
            pool.query(`
                SELECT id, customer_name, total, status, created_at
                FROM orders
                ORDER BY created_at DESC
                LIMIT 5
            `)
        ]);

        res.json({
            success: true,
            totalProducts: parseInt(productCount.rows[0].total, 10),
            lowStockProducts: parseInt(lowStockCount.rows[0].total, 10),
            totalOrders: parseInt(orderStats.rows[0].total_orders, 10),
            totalRevenue: parseFloat(orderStats.rows[0].total_revenue),
            pendingOrders: parseInt(orderStats.rows[0].pending_orders, 10),
            recentOrders: recentOrders.rows
        });

    } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stats" });
    }

});


// ========================================================
// ============  ADMIN: IMAGE UPLOAD  =======================
// ========================================================
// Takes files straight from the "choose file" input in ProductForm.jsx,
// uploads each to Azure Blob Storage, and returns their public URLs so
// the frontend can drop them into the product's `images` field — no more
// needing to paste a URL (or a bare filename) by hand.

app.post("/api/admin/upload", requireAdminAuth, upload.array("images", 6), async (req, res) => {

    if (!azureContainerClient) {
        return res.status(500).json({
            success: false,
            message: "Image storage isn't configured on the server (AZURE_STORAGE_CONNECTION_STRING is missing)."
        });
    }

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: "No files were uploaded" });
    }

    try {
        const urls = [];

        for (const file of req.files) {
            const extension = (file.originalname.split(".").pop() || "jpg").toLowerCase();
            const blobName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

            const blockBlobClient = azureContainerClient.getBlockBlobClient(blobName);
            await blockBlobClient.uploadData(file.buffer, {
                blobHTTPHeaders: { blobContentType: file.mimetype }
            });

            urls.push(blockBlobClient.url);
        }

        res.json({ success: true, urls });

    } catch (error) {
        console.error("Image upload failed:", error);
        res.status(500).json({ success: false, message: "Upload failed" });
    }

});

// Multer reports problems (e.g. a file over the 5MB limit) by calling
// next(err) instead of throwing inside the route above — this catches
// those and returns clean JSON instead of Express's default HTML error page.
app.use("/api/admin/upload", (err, req, res, next) => {
    if (err instanceof multer.MulterError || err) {
        const message = err.code === "LIMIT_FILE_SIZE"
            ? "One of those images is over the 5MB limit."
            : err.message || "Upload failed";
        return res.status(400).json({ success: false, message });
    }
    next();
});

// ========================================================
// ============  ADMIN: REPAIR BROKEN IMAGES  ===============
// ========================================================
// One-time repair for the original 358 images migrated from WordPress.
// What happened: migrate-images-to-azure.js downloaded each photo over
// the machine's home internet connection, which was intercepting some
// requests and silently substituting a small fake "security check" page
// instead of the real photo — the script only checked that the download
// "succeeded", not that what came back was actually an image, so those
// fake pages got uploaded to Azure as if they were the real files (they
// show up as ~211-byte "text/html" blobs instead of real photos).
//
// The fix has to download the real photos from a connection that ISN'T
// affected by that interference. This server runs on Railway (not the
// affected home network), so running the repair from here — instead of
// from the office computer — re-downloads clean copies and overwrites
// the bad blobs.
//
// originalImageUrls.json holds the pre-migration WordPress URLs (pulled
// from full-backup.sql, taken before the migration overwrote them),
// keyed by product id.

const originalImageUrls = require("./original-image-urls.json");

const repairState = {
    running: false,
    total: 0,
    done: 0,
    fixed: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
    errors: []
};

async function runImageRepair() {
    repairState.running = true;
    repairState.total = 0;
    repairState.done = 0;
    repairState.fixed = 0;
    repairState.failed = 0;
    repairState.startedAt = new Date().toISOString();
    repairState.finishedAt = null;
    repairState.errors = [];

    const entries = Object.entries(originalImageUrls);

    // Count how many individual images we're about to attempt, so
    // progress (done / total) means something on the status endpoint.
    repairState.total = entries.reduce(
        (sum, [, urls]) => sum + urls.split(",").map(u => u.trim()).filter(Boolean).length,
        0
    );

    console.log(`[image-repair] Starting — ${repairState.total} image(s) across ${entries.length} product(s).`);

    for (const [productId, urlsString] of entries) {
        const urls = urlsString.split(",").map(u => u.trim()).filter(Boolean);

        for (let i = 0; i < urls.length; i++) {
            const originalUrl = urls[i];

            try {
                // The old host (SiteGround) appears to challenge/block plain
                // server-to-server requests (no browser fingerprint) and serve
                // back an HTML "security check" page instead of the image —
                // which is exactly what happened during the original migration
                // too. Sending realistic browser-style headers is the first,
                // no-VPN thing worth trying to get past that.
                const response = await fetch(originalUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Referer": "https://thevintageartisans.com/"
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const contentType = response.headers.get("content-type") || "";
                if (!contentType.startsWith("image/")) {
                    // Same failure mode as before — didn't get a real image back.
                    throw new Error(`Got "${contentType || "unknown"}" instead of an image`);
                }

                const buffer = Buffer.from(await response.arrayBuffer());
                const extensionMatch = new URL(originalUrl).pathname.match(/\.([a-zA-Z0-9]+)$/);
                const extension = (extensionMatch ? extensionMatch[1] : "jpg").toLowerCase();
                const blobName = `${productId}-${i + 1}.${extension}`;

                const blockBlobClient = azureContainerClient.getBlockBlobClient(blobName);
                await blockBlobClient.uploadData(buffer, {
                    blobHTTPHeaders: { blobContentType: contentType }
                });

                repairState.fixed++;
                console.log(`[image-repair] Fixed ${blobName} (${buffer.length} bytes)`);

            } catch (error) {
                repairState.failed++;
                const message = `Product ${productId} image ${i + 1}: ${error.message}`;
                repairState.errors.push(message);
                console.error(`[image-repair] FAILED — ${message}`);
            }

            repairState.done++;
        }
    }

    repairState.running = false;
    repairState.finishedAt = new Date().toISOString();
    console.log(`[image-repair] Done. Fixed: ${repairState.fixed}, Failed: ${repairState.failed}`);
}

app.post("/api/admin/repair-images", requireAdminAuth, (req, res) => {

    if (!azureContainerClient) {
        return res.status(500).json({ success: false, message: "Image storage isn't configured on the server." });
    }

    if (repairState.running) {
        return res.status(409).json({ success: false, message: "A repair is already running." });
    }

    // Deliberately not awaited — this can take several minutes for 358
    // images, so it runs in the background and the button just polls
    // GET /api/admin/repair-images for progress instead of hanging.
    runImageRepair();

    res.json({ success: true, message: "Repair started." });

});

app.get("/api/admin/repair-images", requireAdminAuth, (req, res) => {
    res.json({ success: true, ...repairState });
});

// ========================================================
// ============  ADMIN: PRODUCTS CRUD  =====================
// ========================================================

// Full list for the admin table (published + unpublished, no pagination limit games).
// price_overrides comes back as { "GB": { "regularPrice": 120, "salePrice": null }, ... }
// so the Products page can show one editable price column per enabled
// shipping country without a separate request per product.
app.get("/api/admin/products", requireAdminAuth, async (req, res) => {

    try {
        const result = await pool.query(`
            SELECT
                p.id, p.sku, p.name, p.product_type, p.regular_price, p.sale_price,
                p.stock, p.in_stock, p.images, p.published, p.featured,
                COALESCE(
                    json_object_agg(o.country_code, json_build_object(
                        'regularPrice', o.regular_price,
                        'salePrice', o.sale_price
                    )) FILTER (WHERE o.country_code IS NOT NULL),
                    '{}'
                ) AS price_overrides
            FROM products p
            LEFT JOIN product_price_overrides o ON o.product_id = p.id
            GROUP BY p.id
            ORDER BY p.id DESC
        `);

        res.json({ success: true, products: result.rows });

    } catch (error) {
        console.error("Error fetching admin products:", error);
        res.status(500).json({ success: false, message: "Failed to fetch products" });
    }

});

// Upserts (or clears) one product's price override for one country.
// Body: { countryCode, regularPrice, salePrice } — regularPrice: null
// deletes the override for that country (falls back to live conversion).
app.put("/api/admin/products/:id/price-overrides", requireAdminAuth, async (req, res) => {

    const productId = req.params.id;
    const { countryCode, regularPrice, salePrice } = req.body;

    if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) {
        return res.status(400).json({ success: false, message: "A valid 2-letter countryCode is required" });
    }

    try {
        if (regularPrice === null || regularPrice === undefined || regularPrice === "") {
            await pool.query(
                `DELETE FROM product_price_overrides WHERE product_id = $1 AND country_code = $2`,
                [productId, countryCode.toUpperCase()]
            );
            return res.json({ success: true, cleared: true });
        }

        await pool.query(
            `
            INSERT INTO product_price_overrides (product_id, country_code, regular_price, sale_price)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, country_code)
            DO UPDATE SET regular_price = EXCLUDED.regular_price, sale_price = EXCLUDED.sale_price
            `,
            [productId, countryCode.toUpperCase(), regularPrice, salePrice || null]
        );

        res.json({ success: true });

    } catch (error) {
        console.error("Error saving price override:", error);
        res.status(500).json({ success: false, message: "Failed to save price override" });
    }

});

app.get("/api/admin/products/:id", requireAdminAuth, async (req, res) => {

    try {
        const productResult = await pool.query(
            `SELECT * FROM products WHERE id = $1`,
            [req.params.id]
        );

        if (productResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const categoryResult = await pool.query(
            `SELECT c.id, c.name FROM categories c
             JOIN product_categories pc ON pc.category_id = c.id
             WHERE pc.product_id = $1`,
            [req.params.id]
        );

        res.json({
            success: true,
            product: {
                ...productResult.rows[0],
                categoryIds: categoryResult.rows.map(row => row.id)
            }
        });

    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ success: false, message: "Failed to fetch product" });
    }

});

app.post("/api/admin/products", requireAdminAuth, async (req, res) => {

    const {
        name, sku, productType, shortDescription, description,
        regularPrice, salePrice, stock, inStock, images, tags,
        published, featured, categoryIds
    } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: "Product name is required" });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `
            INSERT INTO products (
                sku, name, product_type, short_description, description,
                regular_price, sale_price, stock, in_stock, images, tags,
                published, featured
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id
            `,
            [
                sku || null, name, productType || "simple",
                shortDescription || null, description || null,
                regularPrice || null, salePrice || null,
                stock ?? null, inStock ?? true, images || null, tags || null,
                published ?? true, featured ?? false
            ]
        );

        const productId = result.rows[0].id;

        if (Array.isArray(categoryIds)) {
            for (const categoryId of categoryIds) {
                await client.query(
                    `INSERT INTO product_categories (product_id, category_id)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [productId, categoryId]
                );
            }
        }

        await client.query("COMMIT");

        res.json({ success: true, productId: productId });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error creating product:", error);
        res.status(500).json({ success: false, message: "Failed to create product" });
    } finally {
        client.release();
    }

});

app.put("/api/admin/products/:id", requireAdminAuth, async (req, res) => {

    const productId = req.params.id;
    const {
        name, sku, productType, shortDescription, description,
        regularPrice, salePrice, stock, inStock, images, tags,
        published, featured, categoryIds
    } = req.body;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `
            UPDATE products SET
                sku = $1, name = $2, product_type = $3,
                short_description = $4, description = $5,
                regular_price = $6, sale_price = $7, stock = $8,
                in_stock = $9, images = $10, tags = $11,
                published = $12, featured = $13
            WHERE id = $14
            RETURNING id
            `,
            [
                sku || null, name, productType || "simple",
                shortDescription || null, description || null,
                regularPrice || null, salePrice || null,
                stock ?? null, inStock ?? true, images || null, tags || null,
                published ?? true, featured ?? false, productId
            ]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (Array.isArray(categoryIds)) {
            await client.query(
                `DELETE FROM product_categories WHERE product_id = $1`,
                [productId]
            );

            for (const categoryId of categoryIds) {
                await client.query(
                    `INSERT INTO product_categories (product_id, category_id)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [productId, categoryId]
                );
            }
        }

        await client.query("COMMIT");

        res.json({ success: true });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error updating product:", error);
        res.status(500).json({ success: false, message: "Failed to update product" });
    } finally {
        client.release();
    }

});

app.delete("/api/admin/products/:id", requireAdminAuth, async (req, res) => {

    try {
        const result = await pool.query(
            `DELETE FROM products WHERE id = $1 RETURNING id`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.json({ success: true });

    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ success: false, message: "Failed to delete product" });
    }

});


// ========================================================
// ============  ADMIN: CATEGORIES CRUD  ====================
// ========================================================

app.post("/api/admin/categories", requireAdminAuth, async (req, res) => {

    const { name, slug } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    try {
        const result = await pool.query(
            `INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id`,
            [name, finalSlug]
        );

        res.json({ success: true, categoryId: result.rows[0].id });

    } catch (error) {
        console.error("Error creating category:", error);
        res.status(500).json({ success: false, message: "Failed to create category" });
    }

});

app.put("/api/admin/categories/:id", requireAdminAuth, async (req, res) => {

    const { name, slug } = req.body;

    try {
        const result = await pool.query(
            `UPDATE categories SET name = $1, slug = $2 WHERE id = $3 RETURNING id`,
            [name, slug, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.json({ success: true });

    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ success: false, message: "Failed to update category" });
    }

});

app.delete("/api/admin/categories/:id", requireAdminAuth, async (req, res) => {

    try {
        const result = await pool.query(
            `DELETE FROM categories WHERE id = $1 RETURNING id`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.json({ success: true });

    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ success: false, message: "Failed to delete category" });
    }

});


// ========================================================
// ============  ADMIN: SHIPPING COUNTRIES  =================
// ========================================================
// Powers Admin -> Shipping Countries, where every country ShipStation
// knows how to map to a code (see country-codes.js) can be turned on/off
// for the checkout dropdown with a checkbox — nothing about which
// countries we ship to is hardcoded in the frontend.

app.get("/api/admin/shipping-countries", requireAdminAuth, async (req, res) => {

    try {
        const result = await pool.query(`
            SELECT id, name, code, enabled
            FROM shipping_countries
            ORDER BY name ASC
        `);

        res.json({ success: true, countries: result.rows });

    } catch (error) {
        console.error("Error fetching admin shipping countries:", error);
        res.status(500).json({ success: false, message: "Failed to fetch shipping countries" });
    }

});

// Body: { enabledIds: [1, 5, 12, ...] } — every id in the array becomes
// enabled, every other row becomes disabled. One statement, so the
// checkbox list always ends up matching exactly what was saved.
app.put("/api/admin/shipping-countries", requireAdminAuth, async (req, res) => {

    const { enabledIds } = req.body;

    if (!Array.isArray(enabledIds) || !enabledIds.every(id => Number.isInteger(id))) {
        return res.status(400).json({ success: false, message: "enabledIds must be an array of ids" });
    }

    try {
        await pool.query(
            `UPDATE shipping_countries SET enabled = (id = ANY($1::int[]))`,
            [enabledIds]
        );

        res.json({ success: true });

    } catch (error) {
        console.error("Error updating shipping countries:", error);
        res.status(500).json({ success: false, message: "Failed to update shipping countries" });
    }

});


// ========================================================
// ============  ADMIN: PAYMENT METHODS  =====================
// ========================================================
// Powers Admin -> Payment Methods, where each payment method checkout.js
// can offer (Cash on Delivery, Stripe, Easypaisa, JazzCash, Bank Transfer)
// can be turned on/off with a checkbox — nothing about which methods are
// available is hardcoded in the frontend.

app.get("/api/admin/payment-methods", requireAdminAuth, async (req, res) => {

    try {
        const result = await pool.query(`
            SELECT id, key, label, country_only, enabled, sort_order
            FROM payment_methods
            ORDER BY sort_order ASC
        `);

        res.json({ success: true, methods: result.rows });

    } catch (error) {
        console.error("Error fetching admin payment methods:", error);
        res.status(500).json({ success: false, message: "Failed to fetch payment methods" });
    }

});

// Body: { enabledIds: [1, 3, ...] } — every id in the array becomes
// enabled, every other row becomes disabled. Same one-statement approach
// as shipping countries above, so the checkbox list always ends up
// matching exactly what was saved.
app.put("/api/admin/payment-methods", requireAdminAuth, async (req, res) => {

    const { enabledIds } = req.body;

    if (!Array.isArray(enabledIds) || !enabledIds.every(id => Number.isInteger(id))) {
        return res.status(400).json({ success: false, message: "enabledIds must be an array of ids" });
    }

    try {
        await pool.query(
            `UPDATE payment_methods SET enabled = (id = ANY($1::int[]))`,
            [enabledIds]
        );

        res.json({ success: true });

    } catch (error) {
        console.error("Error updating payment methods:", error);
        res.status(500).json({ success: false, message: "Failed to update payment methods" });
    }

});


// ========================================================
// ============  ADMIN: FEATURE FLAGS / SETTINGS  ============
// ========================================================
// Powers Admin -> Settings, where features like ShipStation can be
// switched on/off from the admin panel — no code change or redeploy
// needed. See feature-flags.js for how these are read/cached.

app.get("/api/admin/feature-flags", requireAdminAuth, async (req, res) => {

    try {
        const flags = await getAllFeatureFlags();
        res.json({ success: true, flags });

    } catch (error) {
        console.error("Error fetching feature flags:", error);
        res.status(500).json({ success: false, message: "Failed to fetch feature flags" });
    }

});

// Body: { enabled: true|false }
app.put("/api/admin/feature-flags/:key", requireAdminAuth, async (req, res) => {

    const { key } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
        return res.status(400).json({ success: false, message: "enabled must be true or false" });
    }

    try {
        await setFeatureFlag(key, enabled);
        res.json({ success: true });

    } catch (error) {
        console.error("Error updating feature flag:", error);
        res.status(500).json({ success: false, message: "Failed to update feature flag" });
    }

});


// ========================================================
// ============  ADMIN: ORDERS  =============================
// ========================================================

app.get("/api/admin/orders", requireAdminAuth, async (req, res) => {

    try {
        const result = await pool.query(`
            SELECT o.id, o.customer_name, o.email, o.phone, o.city,
                   o.total, o.status, o.created_at,
                   COUNT(oi.id) AS item_count
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `);

        res.json({ success: true, orders: result.rows });

    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }

});

app.get("/api/admin/orders/:id", requireAdminAuth, async (req, res) => {

    try {
        const orderResult = await pool.query(
            `SELECT * FROM orders WHERE id = $1`,
            [req.params.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const itemsResult = await pool.query(
            `SELECT * FROM order_items WHERE order_id = $1`,
            [req.params.id]
        );

        res.json({
            success: true,
            order: { ...orderResult.rows[0], items: itemsResult.rows }
        });

    } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({ success: false, message: "Failed to fetch order" });
    }

});

// Manual retry button (Order Detail page in the admin panel) — for a
// non-Pakistan order whose automatic ShipStation send failed or was
// skipped (e.g. because the API key wasn't set yet at the time).
app.post("/api/admin/orders/:id/send-to-shipstation", requireAdminAuth, async (req, res) => {

    try {
        const orderResult = await pool.query(`SELECT id FROM orders WHERE id = $1`, [req.params.id]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        await syncOrderToShipStation(req.params.id);

        const updated = await pool.query(
            `SELECT shipstation_order_id, shipstation_synced_at, shipstation_sync_error FROM orders WHERE id = $1`,
            [req.params.id]
        );

        res.json({ success: true, ...updated.rows[0] });

    } catch (error) {
        console.error("Error sending order to ShipStation:", error);
        res.status(500).json({ success: false, message: "Failed to send order to ShipStation" });
    }

});

// ========================================================
// ============  ADMIN: SHIPSTATION LABELS  =================
// ========================================================
// Lets the admin panel ask ShipStation itself which carriers/services/
// packages are available (only carriers actually connected in the
// ShipStation account come back) instead of hardcoding any of it, then
// buy an actual shipping label + get a tracking number for an order
// that's already been sent to ShipStation.

app.get("/api/admin/shipstation/carriers", requireAdminAuth, async (req, res) => {
    if (!(await isFeatureEnabled(FLAGS.SHIPSTATION_ENABLED))) {
        return res.status(400).json({ success: false, message: "ShipStation is currently disabled in Admin -> Settings." });
    }

    try {
        const result = await listCarriers();

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        res.json({ success: true, carriers: result.carriers });

    } catch (error) {
        console.error("Error fetching ShipStation carriers:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to fetch carriers" });
    }
});

app.get("/api/admin/shipstation/carriers/:code/services", requireAdminAuth, async (req, res) => {
    if (!(await isFeatureEnabled(FLAGS.SHIPSTATION_ENABLED))) {
        return res.status(400).json({ success: false, message: "ShipStation is currently disabled in Admin -> Settings." });
    }

    try {
        const result = await listCarrierServices(req.params.code);

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        res.json({ success: true, services: result.services });

    } catch (error) {
        console.error("Error fetching ShipStation services:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to fetch services" });
    }
});

app.get("/api/admin/shipstation/carriers/:code/packages", requireAdminAuth, async (req, res) => {
    if (!(await isFeatureEnabled(FLAGS.SHIPSTATION_ENABLED))) {
        return res.status(400).json({ success: false, message: "ShipStation is currently disabled in Admin -> Settings." });
    }

    try {
        const result = await listCarrierPackages(req.params.code);

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        res.json({ success: true, packages: result.packages });

    } catch (error) {
        console.error("Error fetching ShipStation packages:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to fetch packages" });
    }
});

// Buys the actual label (real charge unless testLabel is true) and
// stores the tracking number + a public link to the label PDF back on
// the order.
app.post("/api/admin/orders/:id/purchase-label", requireAdminAuth, async (req, res) => {

    if (!(await isFeatureEnabled(FLAGS.SHIPSTATION_ENABLED))) {
        return res.status(400).json({ success: false, message: "ShipStation is currently disabled in Admin -> Settings." });
    }

    const orderId = req.params.id;
    const { carrierCode, serviceCode, packageCode, weightValue, weightUnits, testLabel } = req.body;

    try {
        const orderResult = await pool.query(
            `SELECT shipstation_order_id FROM orders WHERE id = $1`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const shipstationOrderId = orderResult.rows[0].shipstation_order_id;

        const result = await purchaseLabelForOrder(shipstationOrderId, {
            carrierCode, serviceCode, packageCode, weightValue, weightUnits, testLabel
        });

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        // Upload the label PDF to the same Azure Blob Storage container
        // product images already use, so the admin gets a plain public
        // link instead of a base64 blob sitting in the database.
        let labelUrl = null;

        if (result.labelBase64 && azureContainerClient) {
            const buffer = Buffer.from(result.labelBase64, "base64");
            const blobName = `labels/order-${orderId}-${Date.now()}.pdf`;
            const blockBlobClient = azureContainerClient.getBlockBlobClient(blobName);

            await blockBlobClient.uploadData(buffer, {
                blobHTTPHeaders: { blobContentType: "application/pdf" }
            });

            labelUrl = blockBlobClient.url;
        }

        await pool.query(
            `
            UPDATE orders
            SET tracking_number = $1, label_url = $2, shipping_cost = $3,
                carrier_code = $4, service_code = $5
            WHERE id = $6
            `,
            [
                result.trackingNumber || null,
                labelUrl,
                result.shipmentCost ?? null,
                carrierCode,
                serviceCode,
                orderId
            ]
        );

        res.json({
            success: true,
            trackingNumber: result.trackingNumber,
            labelUrl,
            shippingCost: result.shipmentCost
        });

    } catch (error) {
        console.error("Error purchasing shipping label:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to purchase shipping label" });
    }

});

app.patch("/api/admin/orders/:id/status", requireAdminAuth, async (req, res) => {

    const { status } = req.body;
    const allowedStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Status must be one of: ${allowedStatuses.join(", ")}`
        });
    }

    try {
        const result = await pool.query(
            `UPDATE orders SET status = $1 WHERE id = $2 RETURNING id`,
            [status, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        res.json({ success: true });

    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ success: false, message: "Failed to update order status" });
    }

});

app.post("/api/contact", async (req, res) => {

    try {
        const { name, email, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and message are required"
            });
        }

        await pool.query(
            `INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)`,
            [name, email, message]
        );

        res.json({ success: true });

        // Notify the store inbox — fails silently (logged, not thrown) if
        // EMAIL_USER/EMAIL_PASS aren't configured yet, so this never turns
        // a successfully-saved message into an error for the customer.
        sendContactNotification({ name, email, message });

    } catch (error) {
        console.error("Error saving contact message:", error);
        res.status(500).json({ success: false, message: "Failed to send message" });
    }

});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});