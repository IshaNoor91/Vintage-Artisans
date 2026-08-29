console.log("ALL-CATEGORIES JS LOADED");

const API_BASE_CATS = "https://vintage-artisans-production.up.railway.app/api";

// Show only the last segment of a "Parent > Child" category name
// (e.g. "Blue Pottery > Bowls" -> "Bowls"). Top-level categories like
// "Blue Pottery" or "Blue Felicity" have no ">" and are shown as-is.
function getDisplayName(name) {
    return name.split(">").map(part => part.trim()).pop();
}

// Grab the first product image for a category so the tile isn't blank.
// The categories table itself has no image field, so the image always
// comes from a real product inside that category ("koi bhi product ki
// image" — any product's image).
async function getCategoryImage(slug) {

    try {

        const response = await fetch(`${API_BASE_CATS}/products/category/${slug}`);

        if (!response.ok) return "";

        const data = await response.json();

        if (!data.success || !data.products || data.products.length === 0) {
            return "";
        }

        const firstProduct = data.products[0];

        return firstProduct.images
            ? firstProduct.images.split(",")[0].trim()
            : "";

    } catch (error) {

        console.error(`Failed to load image for category "${slug}":`, error);
        return "";

    }

}

// Fetch categories, then fetch a representative image for each one in
// parallel, then render all the tiles at once.
async function loadCategoryGrid(containerId, type) {

    const container = document.getElementById(containerId);
    if (!container) return;

    try {

        const response = await fetch(`${API_BASE_CATS}/categories?type=${type}`);
        const data = await response.json();

        if (!data.success || !data.categories || data.categories.length === 0) {
            container.innerHTML = `<p>No categories found.</p>`;
            return;
        }

        const categories = data.categories;

        const images = await Promise.all(
            categories.map(cat => getCategoryImage(cat.slug))
        );

        container.innerHTML = categories.map((cat, index) => {

            const name = getDisplayName(cat.name);
            const image = images[index];

            return `
                <a href="category.html?slug=${cat.slug}" class="category-tile">
                    <div class="category-tile-image">
                        ${image ? `<img src="${image}" alt="${name}" loading="lazy">` : `<i class="fa-solid fa-shapes"></i>`}
                    </div>
                    <span>${name}</span>
                </a>
            `;

        }).join("");

    } catch (error) {

        console.error(`Failed to load "${type}" categories:`, error);
        container.innerHTML = `<p>Unable to load categories.</p>`;

    }

}

function loadAllCategoryGrids() {
    loadCategoryGrid("product-categories-grid", "product");
    loadCategoryGrid("design-categories-grid", "design");
}

document.addEventListener("DOMContentLoaded", loadAllCategoryGrids);
