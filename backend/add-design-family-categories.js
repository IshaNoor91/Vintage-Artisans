/* ============================================================
   ADD: category_type column + Design Family categories
   One-time script.

   1. Adds a `category_type` column to `categories` (values:
      'product' or 'design'). Existing categories default to
      'product' so nothing already on the site changes.
   2. Creates the 17 "Design Family" categories (Blue Felicity,
      Blue Pattern, ...) as real categories with category_type
      = 'design', so they can be assigned to products and linked
      to from the Design Family nav dropdown — but they are kept
      OUT of the Shop/category-page sidebar filters, because those
      only ask the API for ?type=product categories.

   Safe to re-run: the column add uses IF NOT EXISTS, and each
   category insert is skipped if a category with that slug
   already exists.

   Usage (from the backend/ folder):
       node add-design-family-categories.js --env-file=.env.production
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const pool = require("./db");

const DESIGN_FAMILY_NAMES = [
    "Blue Felicity", "Blue Pattern", "Blue Flower", "Tranquility", "Serina Blue",
    "Blue Celico", "Spring Pattern", "Breeze Blue", "Green Flower", "Jungle Flower",
    "Kashmir Multi", "Ocean Blue", "Urban Blue", "Antique", "Islamic Calligraphy",
    "Women Art", "Light Serina Blue"
];

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"\n`);

    try {
        await pool.query(`
            ALTER TABLE categories
            ADD COLUMN IF NOT EXISTS category_type VARCHAR(20) NOT NULL DEFAULT 'product'
        `);
        console.log("categories.category_type column ready (existing categories = 'product').\n");

        let created = 0;
        let skipped = 0;

        for (const name of DESIGN_FAMILY_NAMES) {
            const slug = slugify(name);

            const existing = await pool.query(
                `SELECT id FROM categories WHERE slug = $1`,
                [slug]
            );

            if (existing.rows.length > 0) {
                console.log(`Skipped (already exists): ${name}`);
                skipped++;
                continue;
            }

            await pool.query(
                `INSERT INTO categories (name, slug, category_type) VALUES ($1, $2, 'design')`,
                [name, slug]
            );
            console.log(`Created: ${name}  (slug: ${slug})`);
            created++;
        }

        console.log(`\nDone. Created: ${created}, Skipped (already existed): ${skipped}.`);

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
