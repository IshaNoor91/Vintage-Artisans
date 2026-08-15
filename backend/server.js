const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors({
    origin: "http://127.0.0.1:5500"
}));


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
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});