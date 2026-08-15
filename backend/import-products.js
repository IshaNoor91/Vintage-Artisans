const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "vintage_artisans",
    password: "VintageDB@2026",
    port: 5432,
});

const csvFile = path.join(
    __dirname,
    "wc-product-export-11-8-2026-1786431579512.csv"
);

const rows = [];

fs.createReadStream(csvFile)
    .pipe(csv({
    mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "")
}))
    .on("data", (row) => {
        rows.push(row);
    })
    .on("end", async () => {

        console.log(`CSV loaded: ${rows.length} rows`);

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // --------------------------------
            // 1. IMPORT PARENT PRODUCTS
            // --------------------------------

            for (const row of rows) {

                const type = row["Type"]?.trim();

                if (type !== "simple" && type !== "variable") {
                    continue;
                }

                const productId = parseInt(row["ID"], 10);

                if (!productId) {
                    continue;
                }

                const regularPrice = row["Regular price"]
                    ? parseFloat(row["Regular price"])
                    : null;

                const salePrice = row["Sale price"]
                    ? parseFloat(row["Sale price"])
                    : null;

                const stock = row["Stock"]
                    ? parseInt(row["Stock"], 10)
                    : null;

                const inStock =
                    row["In stock?"] === "1" ||
                    row["In stock?"]?.toLowerCase() === "yes";

                await client.query(
                    `
                    INSERT INTO products (
                        id,
                        sku,
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
                    )
                    VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,
                        $9,$10,$11,$12,$13,$14
                    )
                    ON CONFLICT (id) DO NOTHING
                    `,
                    [
                        productId,
                        row["SKU"] || null,
                        row["Name"] || "",
                        type,
                        row["Short description"] || null,
                        row["Description"] || null,
                        regularPrice,
                        salePrice,
                        stock,
                        inStock,
                        row["Images"] || null,
                        row["Tags"] || null,
                        row["Published"] === "1",
                        row["Is featured?"] === "1"
                    ]
                );
            }

            console.log("Parent products imported.");

            // --------------------------------
            // 2. IMPORT CATEGORIES
            // --------------------------------

            const categoryMap = new Map();

            for (const row of rows) {

                const type = row["Type"]?.trim();

                if (type !== "simple" && type !== "variable") {
                    continue;
                }

                const productId = parseInt(row["ID"], 10);

                if (!productId) {
                    continue;
                }

                const categories = (row["Categories"] || "")
                    .split(",")
                    .map(category => category.trim())
                    .filter(Boolean);

                for (const categoryName of categories) {

                    let categoryId = categoryMap.get(categoryName);

                    if (!categoryId) {

                        const existing = await client.query(
                            `
                            SELECT id
                            FROM categories
                            WHERE name = $1
                            `,
                            [categoryName]
                        );

                        if (existing.rows.length > 0) {

                            categoryId = existing.rows[0].id;

                        } else {

                            const result = await client.query(
                                `
                                INSERT INTO categories (name, slug)
                                VALUES ($1, $2)
                                RETURNING id
                                `,
                                [
                                    categoryName,
                                    categoryName
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, "-")
                                        .replace(/^-|-$/g, "")
                                ]
                            );

                            categoryId = result.rows[0].id;
                        }

                        categoryMap.set(categoryName, categoryId);
                    }

                    await client.query(
                        `
                        INSERT INTO product_categories (
                            product_id,
                            category_id
                        )
                        VALUES ($1,$2)
                        ON CONFLICT DO NOTHING
                        `,
                        [productId, categoryId]
                    );
                }
            }

            console.log("Categories imported.");

            // --------------------------------
            // 3. IMPORT VARIATIONS
            // --------------------------------

            for (const row of rows) {

                const type = row["Type"]?.trim();

                if (type !== "variation") {
                    continue;
                }

                const variationId = parseInt(row["ID"], 10);

                const parentId = parseInt(
    (row["Parent"] || "").replace(/^id:/, ""),
    10
);

                if (!variationId || !parentId) {
                    continue;
                }

                const regularPrice = row["Regular price"]
                    ? parseFloat(row["Regular price"])
                    : null;

                const salePrice = row["Sale price"]
                    ? parseFloat(row["Sale price"])
                    : null;

                const stock = row["Stock"]
                    ? parseInt(row["Stock"], 10)
                    : null;

                const inStock =
                    row["In stock?"] === "1" ||
                    row["In stock?"]?.toLowerCase() === "yes";

                const attribute1Name =
                    row["Attribute 1 name"] || null;

                const attribute1Value =
                    row["Attribute 1 value(s)"] || null;

                const attribute2Name =
                    row["Attribute 2 name"] || null;

                const attribute2Value =
                    row["Attribute 2 value(s)"] || null;

                await client.query(
                    `
                    INSERT INTO product_variations (
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
                    )
                    VALUES (
                        $1,$2,$3,$4,$5,$6,
                        $7,$8,$9,$10,$11,$12,$13
                    )
                    ON CONFLICT (id) DO NOTHING
                    `,
                    [
                        variationId,
                        parentId,
                        row["SKU"] || null,
                        row["Name"] || null,
                        regularPrice,
                        salePrice,
                        stock,
                        inStock,
                        attribute1Name,
                        attribute1Value,
                        attribute2Name,
                        attribute2Value,
                        row["Images"] || null
                    ]
                );
            }

            console.log("Variations imported.");

            await client.query("COMMIT");

            console.log("");
            console.log("================================");
            console.log("IMPORT COMPLETED SUCCESSFULLY");
            console.log("================================");

        } catch (error) {

            await client.query("ROLLBACK");

            console.error("IMPORT FAILED:");
            console.error(error);

        } finally {

            client.release();
            await pool.end();

        }
    });