/* ============================================================
   IMPORT: Signeon product catalogue from a WooCommerce-style CSV
   export (columns: ID, Title, Price, Regular Price, Sale Price,
   Product categories, Content, SKU, Product Type, Parent Product ID,
   URL).

   Important: the CSV's own "ID" column is NOT reused as our
   products.id — those numbers (a few hundred/thousand) can collide
   with real Vintage Artisans product ids already in the shared
   `products` table (which run up into the tens of thousands). Every
   row gets a fresh, auto-assigned id instead, and every row +
   category is stamped store_id = the Signeon store.

   Categories: "Product categories" is pipe-separated
   ("Bedroom|Birthday Signs"), and some entries are already
   "Parent>Child" (matching the hierarchical category naming Vintage
   Artisans already uses) — kept as one category with that full name,
   scoped to Signeon so it never collides with a same-named Vintage
   category.

   Images: "URL" is pipe-separated real signeon360.com CDN links —
   stored as-is (comma-separated, matching the `images` column's
   existing convention) rather than re-uploading anything.

   Safe to re-run: matches products by SKU (skips ones already
   imported) rather than blindly inserting duplicates.

   Usage (from the backend/ folder):
       node import-signeon-products.js --env-file=.env.production --csv="C:\path\to\file.csv"
   ============================================================ */

const fs = require("fs");
const csv = require("csv-parser");

const args = process.argv.slice(2);
const envFileArg = args.find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const csvArg = args.find(arg => arg.startsWith("--csv="));
const csvFile = csvArg ? csvArg.split("=")[1].replace(/^"|"$/g, "") : null;

if (!csvFile) {
    console.error('Usage: node import-signeon-products.js --env-file=.env [--csv="C:\\path\\to\\file.csv"]');
    process.exit(1);
}

const pool = require("./db");

function decodeEntities(text) {
    if (!text) return text;
    return text
        .replace(/&amp;/g, "&")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'");
}

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"`);
    console.log(`CSV file: ${csvFile}\n`);

    const storeResult = await pool.query(`SELECT id FROM stores WHERE slug = 'signeon'`);
    if (storeResult.rows.length === 0) {
        throw new Error("No 'signeon' row in stores — run add-roles-permissions.js first.");
    }
    const storeId = storeResult.rows[0].id;

    const rows = await new Promise((resolve, reject) => {
        const out = [];
        fs.createReadStream(csvFile)
            .pipe(csv({ mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim() }))
            .on("data", (row) => out.push(row))
            .on("end", () => resolve(out))
            .on("error", reject);
    });

    console.log(`CSV loaded: ${rows.length} rows`);

    const client = await pool.connect();
    let imported = 0;
    let skipped = 0;

    try {
        await client.query("BEGIN");

        const categoryMap = new Map(); // name -> id, scoped to this store

        // Feature the first 8 products so the homepage "Featured Neon
        // Signs" strip isn't empty — everything else is unfeatured but
        // still shows up in the shop.
        let featuredCount = 0;
        const FEATURE_LIMIT = 8;

        for (const row of rows) {
            const type = (row["Product Type"] || "").trim();
            if (type !== "simple" && type !== "variable") continue;

            const name = decodeEntities((row["Title"] || "").trim());
            const sku = (row["SKU"] || "").trim() || null;

            if (!name) continue;

            // Re-run safety: a product with this SKU already imported
            // for this store is skipped, not duplicated.
            if (sku) {
                const existing = await client.query(
                    `SELECT id FROM products WHERE sku = $1 AND store_id = $2`,
                    [sku, storeId]
                );
                if (existing.rows.length > 0) {
                    skipped++;
                    continue;
                }
            }

            const regularPrice = row["Regular Price"] ? parseFloat(row["Regular Price"]) : null;
            let salePrice = row["Sale Price"] ? parseFloat(row["Sale Price"]) : null;
            if (salePrice !== null && regularPrice !== null && salePrice >= regularPrice) {
                salePrice = null; // not actually a discount — don't show a fake sale badge
            }

            const description = decodeEntities((row["Content"] || "").trim()) || null;

            const images = (row["URL"] || "")
                .split("|")
                .map(u => u.trim())
                .filter(Boolean)
                .join(",") || null;

            const featured = Boolean(featuredCount < FEATURE_LIMIT && images);
            if (featured) featuredCount++;

            const productResult = await client.query(
                `
                INSERT INTO products (
                    sku, name, product_type, short_description, description,
                    regular_price, sale_price, stock, in_stock, images, tags,
                    published, featured, store_id
                )
                VALUES ($1,$2,'simple',NULL,$3,$4,$5,NULL,true,$6,NULL,true,$7,$8)
                RETURNING id
                `,
                [sku, name, description, regularPrice, salePrice, images, featured, storeId]
            );

            const productId = productResult.rows[0].id;

            const categories = (row["Product categories"] || "")
                .split("|")
                .map(c => decodeEntities(c.trim()))
                .filter(Boolean);

            for (const categoryName of categories) {
                let categoryId = categoryMap.get(categoryName);

                if (!categoryId) {
                    const existingCategory = await client.query(
                        `SELECT id FROM categories WHERE name = $1 AND store_id = $2`,
                        [categoryName, storeId]
                    );

                    if (existingCategory.rows.length > 0) {
                        categoryId = existingCategory.rows[0].id;
                    } else {
                        const created = await client.query(
                            `INSERT INTO categories (name, slug, store_id) VALUES ($1, $2, $3) RETURNING id`,
                            [categoryName, slugify(categoryName), storeId]
                        );
                        categoryId = created.rows[0].id;
                    }

                    categoryMap.set(categoryName, categoryId);
                }

                await client.query(
                    `INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [productId, categoryId]
                );
            }

            imported++;
        }

        await client.query("COMMIT");

        console.log(`\nDone. Imported: ${imported}, skipped (already present): ${skipped}, categories: ${categoryMap.size}.`);

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("IMPORT FAILED:", error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
