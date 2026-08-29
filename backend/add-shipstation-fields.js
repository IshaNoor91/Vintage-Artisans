/* ============================================================
   ADD: orders.country + ShipStation tracking columns
   One-time script.

   Adds:
     - country                (defaults existing orders to 'Pakistan',
                                since the checkout form never asked for
                                a country before now)
     - shipstation_order_id    (ShipStation's own order id, once sent)
     - shipstation_synced_at   (when it was successfully sent)
     - shipstation_sync_error  (last error message, if sending failed —
                                cleared automatically on a successful send)

   Safe to re-run — every step uses IF NOT EXISTS.

   Usage (from the backend/ folder):
       node add-shipstation-fields.js --env-file=.env.production
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
            ADD COLUMN IF NOT EXISTS country VARCHAR(100) NOT NULL DEFAULT 'Pakistan'
        `);
        console.log("orders.country ready (existing orders default to 'Pakistan').");

        await pool.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS shipstation_order_id VARCHAR(50)
        `);
        console.log("orders.shipstation_order_id ready.");

        await pool.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS shipstation_synced_at TIMESTAMP
        `);
        console.log("orders.shipstation_synced_at ready.");

        await pool.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS shipstation_sync_error TEXT
        `);
        console.log("orders.shipstation_sync_error ready.");

        console.log("\nDone.");

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
