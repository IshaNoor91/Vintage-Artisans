/* ============================================================
   ADD: label purchase / tracking columns to orders
   One-time script.

   Adds:
     - tracking_number   (from ShipStation once a label is bought)
     - label_url         (public link to the purchased label PDF —
                           uploaded to the same Azure Blob Storage
                           container product images already use)
     - shipping_cost     (what ShipStation charged for the label)
     - carrier_code      (which carrier the label was bought from)
     - service_code      (which service level, e.g. "usps_priority_mail")

   Safe to re-run — every step uses IF NOT EXISTS.

   Usage (from the backend/ folder):
       node add-shipping-label-fields.js --env-file=.env.production
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
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100)
        `);
        console.log("orders.tracking_number ready.");

        await pool.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS label_url TEXT
        `);
        console.log("orders.label_url ready.");

        await pool.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10, 2)
        `);
        console.log("orders.shipping_cost ready.");

        await pool.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS carrier_code VARCHAR(50)
        `);
        console.log("orders.carrier_code ready.");

        await pool.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS service_code VARCHAR(50)
        `);
        console.log("orders.service_code ready.");

        console.log("\nDone.");

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
