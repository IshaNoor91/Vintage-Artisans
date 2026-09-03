/* ============================================================
   ADD: stores table + role/store_id on admin_users
   One-time script.

   Sets up the "who can log in and what can they see" foundation for
   running more than one storefront (Vintage Artisans, and later
   Signeon) off the same shared backend/admin panel:

   - stores: one row per storefront (Vintage Artisans, Signeon).
   - admin_users.role: 'super_admin' (sees/manages everything, every
     store) or 'store_admin' (limited to one store).
   - admin_users.store_id: which store a 'store_admin' belongs to
     (NULL for a super_admin — they aren't limited to one store).

   Every EXISTING admin account becomes 'super_admin' automatically
   (the DEFAULT below applies to existing rows too), so nobody who can
   already log in loses access when this runs.

   This migration only sets up login/access. It does NOT yet filter
   products/categories/orders by store — that's a separate, later
   step once Signeon has its own catalog to actually separate from
   Vintage's.

   Safe to re-run — every statement is IF NOT EXISTS / ON CONFLICT.

   Usage (from the backend/ folder):
       node add-roles-permissions.js --env-file=.env.production
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const pool = require("./db");

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"\n`);

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stores (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log("stores table ready.");

        await pool.query(`
            INSERT INTO stores (name, slug)
            VALUES ('Vintage Artisans', 'vintage'), ('Signeon', 'signeon')
            ON CONFLICT (slug) DO NOTHING
        `);
        console.log("Vintage Artisans + Signeon store rows ready.");

        await pool.query(`
            ALTER TABLE admin_users
            ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'super_admin'
        `);
        console.log("admin_users.role ready (existing accounts default to Super Admin).");

        await pool.query(`
            ALTER TABLE admin_users
            ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id)
        `);
        console.log("admin_users.store_id ready.");

        console.log("\nDone.");

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
