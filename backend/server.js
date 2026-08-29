const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
const { sendOrderToShipStation } = require("./shipstation");
const pool = require("./db");

// ========================================
// STRIPE
// Uses a placeholder key until you set STRIPE_SECRET_KEY in your
// environment (Railway → Variables). Needs `npm install stripe`.
// ========================================
const stripe = require("stripe")(
    process.env.STRIPE_SECRET_KEY || "sk_test_REPLACE_WITH_YOUR_SECRET_KEY"
);

const app = express();
app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5173",
        "https://cozy-trifle-37f6b4.netlify.app",
        "https://vintage-artisans.netlify.app"
    ]
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


const PORT = process.env.PORT || 3000;

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

        res.json({
            success: true,
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
            products: productsResult.rows
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
       res.json({
    success: true,
    category: result.rows.length > 0
        ? result.rows[0].category_name
        : slug,
    count: result.rows.length,
    products: result.rows
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

        res.json({
            success: true,
            products: productsResult.rows,
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

        res.json({
            success: true,
            product: {
                ...product,
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

    const { customer, items, subtotal, total, paymentMethod, paymentReference } = req.body;

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
    // PAYMENT METHOD
    // ========================================

    const allowedMethods = ["cod", "stripe", "bank_transfer"];
    const method = allowedMethods.includes(paymentMethod) ? paymentMethod : "cod";

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
                (customer.country || "Pakistan").trim(),
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
        const orderCountry = (customer.country || "Pakistan").trim();
        if (orderCountry.toLowerCase() !== "pakistan") {
            syncOrderToShipStation(orderId).catch(error => {
                console.error(`[shipstation] Unexpected error syncing order ${orderId}:`, error);
            });
        }

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
            `SELECT id, username, password_hash FROM admin_users WHERE username = $1`,
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

        const token = jwt.sign(
            { id: admin.id, username: admin.username },
            JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            success: true,
            token: token,
            username: admin.username
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

// Full list for the admin table (published + unpublished, no pagination limit games)
app.get("/api/admin/products", requireAdminAuth, async (req, res) => {

    try {
        const result = await pool.query(`
            SELECT id, sku, name, product_type, regular_price, sale_price,
                   stock, in_stock, images, published, featured
            FROM products
            ORDER BY id DESC
        `);

        res.json({ success: true, products: result.rows });

    } catch (error) {
        console.error("Error fetching admin products:", error);
        res.status(500).json({ success: false, message: "Failed to fetch products" });
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

    } catch (error) {
        console.error("Error saving contact message:", error);
        res.status(500).json({ success: false, message: "Failed to send message" });
    }

});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});