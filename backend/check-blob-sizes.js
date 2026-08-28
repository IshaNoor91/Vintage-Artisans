/* ============================================================
   CHECK BLOB SIZES
   Diagnostic only — makes no changes.

   Theory being tested: when migrate-images-to-azure.js originally ran,
   it downloaded each old image with a plain fetch() over this machine's
   internet connection. If that connection was intercepting/redirecting
   some requests (the same "security check" page behavior we saw when
   opening blob URLs directly), the script could have uploaded that fake
   error page's HTML/XML instead of the real photo — and would never have
   noticed, because it only checks that the HTTP request succeeded, not
   that what came back was actually an image.

   A real product photo is realistically at least tens of KB. A captured
   HTML/XML error page is usually under 5KB. This script lists every blob
   in the container with its size, so we can see whether any of the 358
   migrated images are suspiciously small.

   Usage (from the backend/ folder):
       node check-blob-sizes.js --env-file=.env.production
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";

require("dotenv").config({ path: envFile });

const { BlobServiceClient } = require("@azure/storage-blob");

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_CONTAINER_NAME || "product-images";
const SUSPICIOUS_SIZE_BYTES = 5 * 1024; // under 5KB is suspicious for a real photo

async function main() {
    console.log(`Using env file: ${envFile}\n`);

    if (!connectionString) {
        console.error("AZURE_STORAGE_CONNECTION_STRING is not set in this env file.");
        process.exit(1);
    }

    const containerClient = BlobServiceClient
        .fromConnectionString(connectionString)
        .getContainerClient(containerName);

    let total = 0;
    let suspicious = [];

    for await (const blob of containerClient.listBlobsFlat()) {
        total++;
        const sizeBytes = blob.properties.contentLength ?? 0;

        if (sizeBytes < SUSPICIOUS_SIZE_BYTES) {
            suspicious.push({ name: blob.name, sizeBytes, contentType: blob.properties.contentType });
        }
    }

    console.log(`Checked ${total} blob(s) in container "${containerName}".\n`);

    if (suspicious.length === 0) {
        console.log("None are suspiciously small — this theory doesn't explain the broken images.");
    } else {
        console.log(`${suspicious.length} blob(s) are suspiciously small (under 5KB) — likely corrupted uploads:\n`);
        for (const item of suspicious) {
            console.log(`  ${item.name}  —  ${item.sizeBytes} bytes  (${item.contentType || "unknown type"})`);
        }
    }
}

main().catch((error) => {
    console.error("Check failed:", error);
    process.exit(1);
});
