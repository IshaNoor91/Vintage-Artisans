/* ============================================================
   BULK UPLOAD: original images (downloaded from SiteGround) -> Azure
   One-time repair script — replaces the corrupted migrated images
   with the real photos, downloaded manually via UpdraftPlus instead
   of over HTTP (which SiteGround was blocking for server requests).

   How it works:
     1. Reads original-image-urls.json (productId -> original
        thevintageartisans.com URLs, e.g. ".../2025/09/100.webp").
     2. Walks the local images folder (and all its subfolders) and
        builds a lookup of filename -> full path on disk.
     3. For each product image URL, finds the matching file on disk
        by its filename ("100.webp"), and uploads it to Azure using
        the SAME blob name the broken image already has
        (`${productId}-${imageNumber}.${extension}`) — so the
        product's stored image URL doesn't need to change at all,
        the blob just gets overwritten with the real photo.

   Skips (and reports) any image it can't find on disk, and any file
   under 1KB (too small to be a real photo — same corruption check
   used by check-blob-sizes.js).

   Usage (from the backend/ folder):
       node bulk-upload-original-images.js --env-file=.env.production --dry-run
       node bulk-upload-original-images.js --env-file=.env.production

   --dry-run   : reports what WOULD be uploaded, uploads nothing.
   --images-folder=PATH : defaults to ./original-images
   ============================================================ */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const envFileArg = args.find(a => a.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const imagesFolderArg = args.find(a => a.startsWith("--images-folder="));
const imagesFolder = imagesFolderArg
    ? imagesFolderArg.split("=")[1]
    : path.join(__dirname, "original-images");

const dryRun = args.includes("--dry-run");

const { BlobServiceClient } = require("@azure/storage-blob");

const MIN_SIZE_BYTES = 1024; // under 1KB is not a real photo

const CONTENT_TYPES = {
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif"
};

function walk(dir, fileMap) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, fileMap);
        } else if (entry.isFile()) {
            // First match wins if the same filename appears more than once.
            if (!fileMap.has(entry.name)) {
                fileMap.set(entry.name, fullPath);
            }
        }
    }
}

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Images folder: ${imagesFolder}`);
    console.log(dryRun ? "Mode: DRY RUN (nothing will be uploaded)\n" : "Mode: LIVE (will upload to Azure)\n");

    if (!fs.existsSync(imagesFolder)) {
        console.error(`Images folder not found: ${imagesFolder}`);
        process.exit(1);
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME || "product-images";
    if (!connectionString) {
        console.error("AZURE_STORAGE_CONNECTION_STRING is not set in this env file.");
        process.exit(1);
    }
    const containerClient = BlobServiceClient
        .fromConnectionString(connectionString)
        .getContainerClient(containerName);

    console.log("Scanning local images folder...");
    const fileMap = new Map(); // filename -> full path
    walk(imagesFolder, fileMap);
    console.log(`Found ${fileMap.size} local file(s).\n`);

    const originalImageUrls = require("./original-image-urls.json");
    const entries = Object.entries(originalImageUrls);

    let uploaded = 0;
    let tooSmall = 0;
    let missing = 0;
    const missingList = [];
    const tooSmallList = [];

    for (const [productId, urlsString] of entries) {
        const urls = urlsString.split(",").map(u => u.trim()).filter(Boolean);

        for (let i = 0; i < urls.length; i++) {
            const originalUrl = urls[i];
            const filename = path.basename(new URL(originalUrl).pathname);
            const localPath = fileMap.get(filename);

            if (!localPath) {
                missing++;
                missingList.push(`Product ${productId} image ${i + 1}: ${filename} not found on disk`);
                continue;
            }

            const buffer = fs.readFileSync(localPath);
            if (buffer.length < MIN_SIZE_BYTES) {
                tooSmall++;
                tooSmallList.push(`Product ${productId} image ${i + 1}: ${filename} is only ${buffer.length} bytes — skipped`);
                continue;
            }

            const extension = (path.extname(filename).slice(1) || "jpg").toLowerCase();
            const contentType = CONTENT_TYPES[`.${extension}`] || "application/octet-stream";
            const blobName = `${productId}-${i + 1}.${extension}`;

            if (dryRun) {
                console.log(`[dry-run] Would upload ${blobName}  <-  ${filename}  (${buffer.length} bytes)`);
            } else {
                const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                await blockBlobClient.uploadData(buffer, {
                    blobHTTPHeaders: { blobContentType: contentType }
                });
                console.log(`Uploaded ${blobName}  <-  ${filename}  (${buffer.length} bytes)`);
            }
            uploaded++;
        }
    }

    console.log("\n============================================================");
    console.log(dryRun ? "DRY RUN COMPLETE" : "UPLOAD COMPLETE");
    console.log(`  ${dryRun ? "Would upload" : "Uploaded"}: ${uploaded}`);
    console.log(`  Too small / skipped: ${tooSmall}`);
    console.log(`  Missing (not found on disk): ${missing}`);
    console.log("============================================================\n");

    if (tooSmallList.length) {
        console.log("Too small:");
        tooSmallList.forEach(line => console.log(`  ${line}`));
        console.log("");
    }

    if (missingList.length) {
        console.log("Missing (first 30 shown):");
        missingList.slice(0, 30).forEach(line => console.log(`  ${line}`));
        if (missingList.length > 30) {
            console.log(`  ...and ${missingList.length - 30} more`);
        }
    }
}

main().catch(error => {
    console.error("Bulk upload failed:", error);
    process.exit(1);
});
