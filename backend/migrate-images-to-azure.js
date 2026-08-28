/* ============================================================
   MIGRATE PRODUCT IMAGES TO AZURE BLOB STORAGE
   One-time script: for every product in the database, downloads
   each image currently hosted on the old WordPress site, uploads
   it into the Azure "product-images" container, and rewrites the
   product's `images` column to point at the new Azure URL.

   Safe to re-run: any image URL that's already pointing at this
   Azure container is left alone, so a second run only picks up
   whatever didn't finish (or new products added since).

   Usage (from the backend/ folder):
       node migrate-images-to-azure.js

   By default this reads DB credentials from .env, which is normally your
   LOCAL database. To point it at the production database instead — without
   touching .env — create backend/.env.production (gitignored, same DB_USER
   / DB_HOST / DB_NAME / DB_PASSWORD / DB_PORT keys, copied from Railway's
   Variables tab) and run:
       node migrate-images-to-azure.js --env-file=.env.production

   Requires (in whichever env file is used):
       AZURE_STORAGE_CONNECTION_STRING=...
       AZURE_CONTAINER_NAME=product-images   (optional, this is the default)
   Also uses the same DB_* variables db.js already reads from .env.
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";

require("dotenv").config({ path: envFile });

const { BlobServiceClient } = require("@azure/storage-blob");
const pool = require("./db");

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_CONTAINER_NAME || "product-images";

const EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg"
};

function guessExtension(url, contentType) {
    if (contentType && EXTENSION_BY_CONTENT_TYPE[contentType.split(";")[0].trim()]) {
        return EXTENSION_BY_CONTENT_TYPE[contentType.split(";")[0].trim()];
    }

    try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
        if (match) return match[1].toLowerCase();
    } catch {
        // ignore, fall through to default below
    }

    return "jpg";
}

async function downloadImage(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());

    return { buffer, contentType };
}

async function migrateOneImage(containerClient, productId, imageIndex, url, azureBaseUrl) {
    // Already migrated in a previous run — leave it as-is.
    if (url.startsWith(azureBaseUrl)) {
        return { url, skipped: true };
    }

    const { buffer, contentType } = await downloadImage(url);
    const extension = guessExtension(url, contentType);
    const blobName = `${productId}-${imageIndex + 1}.${extension}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType }
    });

    return { url: blockBlobClient.url, skipped: false };
}

async function main() {

    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"`);
    console.log(`DB_USER: "${process.env.DB_USER}"`);
    console.log(`DB_NAME: "${process.env.DB_NAME}"`);
    console.log(`DB_PORT: "${process.env.DB_PORT}"`);
    console.log(`DB_PASSWORD length: ${(process.env.DB_PASSWORD || "").length} characters (not shown)\n`);

    if (!connectionString) {
        console.error(
            "\nAZURE_STORAGE_CONNECTION_STRING is not set in backend/.env — run setup-azure-storage.js first.\n"
        );
        process.exit(1);
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const azureBaseUrl = `${containerClient.url}/`;

    const { rows: products } = await pool.query(
        `SELECT id, images FROM products WHERE images IS NOT NULL AND images <> '' ORDER BY id`
    );

    console.log(`Found ${products.length} product(s) with images to check.\n`);

    let imagesMigrated = 0;
    let imagesSkipped = 0;
    let imagesFailed = 0;
    let productsUpdated = 0;

    for (const product of products) {

        const originalUrls = product.images
            .split(",")
            .map(u => u.trim())
            .filter(Boolean);

        const newUrls = [];
        let changed = false;

        for (let i = 0; i < originalUrls.length; i++) {
            const originalUrl = originalUrls[i];

            try {
                const result = await migrateOneImage(containerClient, product.id, i, originalUrl, azureBaseUrl);

                newUrls.push(result.url);

                if (result.skipped) {
                    imagesSkipped++;
                } else {
                    imagesMigrated++;
                    changed = true;
                    console.log(`  [product ${product.id}] migrated image ${i + 1}: ${result.url}`);
                }

            } catch (error) {
                // Keep the old URL so we don't lose the reference — just
                // report it so it can be looked at by hand.
                newUrls.push(originalUrl);
                imagesFailed++;
                console.error(`  [product ${product.id}] FAILED to migrate image ${i + 1} (${originalUrl}): ${error.message}`);
            }
        }

        if (changed) {
            await pool.query(
                `UPDATE products SET images = $1 WHERE id = $2`,
                [newUrls.join(","), product.id]
            );
            productsUpdated++;
        }
    }

    console.log("\n===== Done =====");
    console.log(`Images migrated: ${imagesMigrated}`);
    console.log(`Images already on Azure (skipped): ${imagesSkipped}`);
    console.log(`Images failed: ${imagesFailed}`);
    console.log(`Products updated in the database: ${productsUpdated}`);

    if (imagesFailed > 0) {
        console.log("\nSome images failed to download from the old site — re-run this script later to retry just those (everything already migrated is skipped automatically).");
    }

    await pool.end();
}

main().catch(async (error) => {
    console.error("Migration failed:", error);
    await pool.end();
    process.exit(1);
});
