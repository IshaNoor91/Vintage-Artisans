const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();
app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5173",
        "https://cozy-trifle-37f6b4.netlify.app"
    ]
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

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


const PORT = 3000;

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

        const productsResult = await pool.query(`
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
                images,
                tags,
                published,
                featured
            FROM products
            WHERE published = true
            ORDER BY id
            LIMIT $1
            OFFSET $2
        `, [limit, offset]);

        const countResult = await pool.query(`
            SELECT COUNT(*) AS total
            FROM products
            WHERE published = true
        `);

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
        c.name AS category_name
    FROM products p
    JOIN product_categories pc
        ON p.id = pc.product_id
    JOIN categories c
        ON pc.category_id = c.id
    WHERE c.slug = $1
    AND p.published = true
    ORDER BY p.id
    `,
    [slug]
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
app.get("/api/categories", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                name,
                slug
            FROM categories
            ORDER BY name
        `);

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
app.post("/api/orders", async (req, res) => {

    const { customer, items, subtotal, total } = req.body;

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
                notes,
                subtotal,
                total,
                status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
            RETURNING id
            `,
            [
                customer.fullName,
                customer.email || null,
                customer.phone,
                customer.address,
                customer.city || null,
                customer.postalCode || null,
                customer.notes || null,
                subtotal || 0,
                total || subtotal || 0
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


app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});