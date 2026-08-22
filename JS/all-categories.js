const API_BASE_CATS = "https://vintage-artisans-production.up.railway.app/api";

const PRODUCT_CATEGORIES = [
    "Dinner Sets", "Tea Sets", "Serving Dishes", "Plates & Platters", "Bowls",
    "Blue Pottery Karahies", "Handies & Cover Pots", "Pottery Jars", "Tea Mugs",
    "Tea Coasters", "Planters", "Vases", "Wall Hangings", "Aromatic Warmers",
    "Table Decorations", "Camel Skin Lamps"
];

const DESIGN_CATEGORIES = [
    "Blue Felicity", "Blue Pattern", "Blue Flower", "Tranquility", "Serina Blue",
    "Blue Celico", "Spring Pattern", "Breeze Blue", "Green Flower", "Jungle Flower",
    "Kashmir Multi", "Ocean Blue", "Urban Blue", "Antique", "Islamic Calligraphy",
    "Women Art", "Light Serina Blue"
];

function normalize(name) {
    return name.trim().toLowerCase();
}

function renderTiles(containerId, names, categoryLookup) {
    const container = document.getElementById(containerId);

    container.innerHTML = names.map(name => {
        const match = categoryLookup.get(normalize(name));

        if (match) {
            const image = match.images ? match.images.split(",")[0].trim() : "";
            return `
                <a href="category.html?slug=${match.slug}" class="category-tile">
                    <div class="category-tile-image">
                        ${image ? `<img src="${image}" alt="${name}">` : `<i class="fa-solid fa-shapes"></i>`}
                    </div>
                    <span>${name}</span>
                </a>
            `;
        }

        return `
            <div class="category-tile disabled">
                <div class="category-tile-image"><i class="fa-solid fa-hourglass-half"></i></div>
                <span>${name}</span>
            </div>
        `;
    }).join("");
}

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_CATS}/categories`);
        const data = await response.json();
        const categories = data.success ? data.categories : [];

        const lookup = new Map();
        categories.forEach(cat => {
            const parts = cat.name.split(">").map(p => p.trim());
            lookup.set(normalize(parts[parts.length - 1]), cat);
        });

        renderTiles("product-categories-grid", PRODUCT_CATEGORIES, lookup);
        renderTiles("design-categories-grid", DESIGN_CATEGORIES, lookup);

    } catch (error) {
        console.error("Failed to load categories:", error);
    }
}

document.addEventListener("DOMContentLoaded", loadCategories);
