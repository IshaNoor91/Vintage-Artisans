// Run this once to create your first admin login:
//   node create-admin.js
//
// Then edit the USERNAME / PASSWORD constants below first,
// or pass them as arguments:
//   node create-admin.js myusername mypassword

require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("./db");

const USERNAME = process.argv[2] || "admin";
const PASSWORD = process.argv[3] || "changeme123";

async function createAdmin() {

    try {
        const passwordHash = await bcrypt.hash(PASSWORD, 10);

        const result = await pool.query(
            `
            INSERT INTO admin_users (username, password_hash)
            VALUES ($1, $2)
            ON CONFLICT (username) DO UPDATE
                SET password_hash = EXCLUDED.password_hash
            RETURNING id, username
            `,
            [USERNAME, passwordHash]
        );

        console.log("Admin user ready:");
        console.log(`  username: ${result.rows[0].username}`);
        console.log(`  password: ${PASSWORD}`);
        console.log("");
        console.log("You can now log in at the admin panel with these credentials.");

    } catch (error) {

        console.error("Failed to create admin user:", error);

    } finally {

        await pool.end();

    }

}

createAdmin();
