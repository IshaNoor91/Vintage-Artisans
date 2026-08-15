const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "vintage_artisans",
    password: "VintageDB@2026",
    port: 5432,
});

module.exports = pool;