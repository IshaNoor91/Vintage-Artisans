/* ============================================================
   ASSIGN: products -> Design Family categories, by name match
   One-time script.

   For every product, checks whether its NAME contains one of the
   17 Design Family category names (case-insensitive), e.g. a
   product called "Breeze Blue Large Serving Bowl" contains
   "Breeze Blue" -> gets linked to the "Breeze Blue" category.

   A product can match more than one Design Family name if its
   name contains more than one (e.g. a product containing both
   "Serina Blue" and "Light Serina Blue" gets linked to both) —
   that's intentional, not a bug.

   Safe to re-run: a product already linked to a category is
   skipped for that category, never linked twice.

   Usage (from the backend/ folder):
       node assign-design-family-categories.js --env-file=.env.production --dry-run
       node assign-design-family-categories.js --env-file=.env.production
   ============================================================ */

const args = process.argv.slice(2);
const envFileArg = args.find(a => a.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const dryRun = args.includes("--dry-run");
const pool = require("./db");

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(dryRun ? "Mode: DRY RUN (nothing will be linked)\n" : "Mode: LIVE (will link products to categories)\n");

    try {
        const categoriesResult = await pool.query(
            `SELECT id, name FROM categories WHERE category_type = 'design' ORDER BY name`
        );
        const designCategories = categoriesResult.rows;

        if (designCategories.length === 0) {
            console.error("No design categories found — run add-design-family-categories.js first.");
            process.exit(1);
        }

        const productsResult = await pool.query(`SELECT id, name FROM products ORDER BY id`);
        const products = productsResult.rows;

        console.log(`Checking ${products.length} product(s) against ${designCategories.length} Design Family categories...\n`);

        let linked = 0;
        let alreadyLinked = 0;
        const matchesByCategory = new Map();

        for (const product of products) {
            const productNameLower = product.name.toLowerCase();

            for (const category of designCategories) {
                const categoryNameLower = category.name.toLowerCase();

                if (!productNameLower.includes(categoryNameLower)) continue;

                const existing = await pool.query(
                    `SELECT 1 FROM product_categories WHERE product_id = $1 AND category_id = $2`,
                    [product.id, category.id]
                );

                if (existing.rows.length > 0) {
                    alreadyLinked++;
                    continue;
                }

                if (!matchesByCategory.has(category.name)) matchesByCategory.set(category.name, []);
                matchesByCategory.get(category.name).push(product.name);

                if (!dryRun) {
                    await pool.query(
                        `INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)`,
                        [product.id, category.id]
                    );
                }

                linked++;
            }
        }

        console.log("============================================================");
        console.log(dryRun ? "DRY RUN COMPLETE" : "DONE");
        console.log(`  ${dryRun ? "Would link" : "Linked"}: ${linked}`);
        console.log(`  Already linked (skipped): ${alreadyLinked}`);
        console.log("============================================================\n");

        for (const [categoryName, productNames] of matchesByCategory) {
            console.log(`${categoryName} (${productNames.length}):`);
            productNames.forEach(name => console.log(`  - ${name}`));
            console.log("");
        }

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
