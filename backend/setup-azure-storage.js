/* ============================================================
   SETUP AZURE STORAGE
   One-time script: connects to the Azure Storage account using
   the connection string in .env, and makes sure the blob
   container that will hold product images exists with the
   right public-read access so <img> tags on the site can load
   photos directly from it.

   Usage (from the backend/ folder):
       npm install
       node setup-azure-storage.js

   Requires in backend/.env:
       AZURE_STORAGE_CONNECTION_STRING=...   (the full string your manager gave you)
       AZURE_CONTAINER_NAME=product-images   (optional, this is the default)
   ============================================================ */

require("dotenv").config();

const { BlobServiceClient } = require("@azure/storage-blob");

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_CONTAINER_NAME || "product-images";

async function main() {

    if (!connectionString) {
        console.error(
            "\nAZURE_STORAGE_CONNECTION_STRING is not set.\n" +
            "Add it to backend/.env, e.g.:\n\n" +
            "  AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net\n"
        );
        process.exit(1);
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // Quick sanity check that the connection string actually works
    // before we try to touch anything.
    try {
        await blobServiceClient.getAccountInfo();
    } catch (error) {
        console.error("\nCould not connect to the storage account. Double-check the connection string in .env.");
        console.error(error.message);
        process.exit(1);
    }

    console.log(`Connected to storage account: ${blobServiceClient.accountName}`);

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const alreadyExists = await containerClient.exists();

    if (!alreadyExists) {
        // access: "blob" = anyone with the direct URL can read a file,
        // but no one can list everything in the container. That's the
        // right level for product photos an <img> tag needs to load.
        await containerClient.create({ access: "blob" });
        console.log(`Created container "${containerName}" with public read access on blobs.`);
    } else {
        console.log(`Container "${containerName}" already exists.`);
    }

    // Whether the container was just created or already existed (e.g. made
    // manually through Storage Explorer, which defaults to private), make
    // sure its access level is actually "blob" (public read on files).
    const accessPolicy = await containerClient.getAccessPolicy();

    if (accessPolicy.blobPublicAccess !== "blob") {
        await containerClient.setAccessPolicy("blob");
        console.log(`Access level was "${accessPolicy.blobPublicAccess || "private"}" — updated it to public read on blobs.`);
    } else {
        console.log("Access level already set to public read on blobs.");
    }

    const baseUrl = containerClient.url;
    console.log("\nDone. Product image URLs will look like:");
    console.log(`  ${baseUrl}/<filename>\n`);
}

main().catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
});
