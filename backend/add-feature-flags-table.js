/* ============================================================
   ADD: feature_flags table
   One-time script.

   Simple on/off switches stored in the database so they can be
   toggled from Admin -> Settings without touching code or waiting
   for a redeploy — same "nothing hardcoded" rule already used for
   shipping countries and price overrides.

   Seeds one flag: "shipstation_enabled", defaulting to true (ON) so
   nothing changes for the store until someone turns it off in the
   admin panel.

   Safe to re-run — CREATE TABLE IF NOT EXISTS and ON CONFLICT DO
   NOTHING mean re-running this never overwrites a flag someone has
   already changed.

   Usage (from the backend/ folder):
       node add-feature-flags-table.js --env-file=.env.production
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
            CREATE TABLE IF NOT EXISTS feature_flags (
                key TEXT PRIMARY KEY,
                enabled BOOLEAN NOT NULL DEFAULT true,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
        console.log("feature_flags table ready.");

        await pool.query(`
            INSERT INTO feature_flags (key, enabled)
            VALUES ('shipstation_enabled', true)
            ON CONFLICT (key) DO NOTHING
        `);
        console.log("shipstation_enabled flag ready (defaults to ON).");

        console.log("\nDone.");

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
