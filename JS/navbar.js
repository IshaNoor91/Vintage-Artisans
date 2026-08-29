/* ============================================
   NAVBAR — shared across every page
   - Populates the Shop dropdown using ONLY
     "product" type categories that really exist
     in the database (never fabricates a link).
   - Populates the Design Family dropdown using
     ONLY "design" type categories — kept
     completely separate so Design Family entries
     never show up in the Shop/category sidebar
     filters, and Shop entries never show up here.
   - Handles search and mobile menu toggling.
============================================ */

const API_BASE_NAV = "https://vintage-artisans-production.up.railway.app/api";

// Master list of expected Blue Pottery / Camel Skin Lamp / Decor items.
// Each is matched against real categories by name — only matched ones
// become clickable links.
const SHOP_MENU = {
    "Camel Skin Lamp": {
        // matchName is looked up against the real category list (same as
        // items below) so this heading links to OUR category page —
        // never the old thevintageartisans.com WordPress site.
        matchName: "Camel Skin Lamps",
        items: ["Box Shaped Lamps", "Glass Shaped Lamps", "Moon-Shaped Lamps", "Round Table Lamps", "Vase Shaped Lamps"]
    },
    "Blue Pottery": {
        matchName: "Blue Pottery",
        items: ["Bowls", "Blue Pottery Karahi", "Tea Sets", "Blue Pottery Jars", "Handies & Cover Pots", "Serving Dishes", "Plates & Platters", "Tea Coasters", "Tea Mugs", "Dinner Sets"]
    },
    "Decor": {
        matchName: "Decor",
        items: ["Vases", "Planters", "Handcrafted Wall Frames", "Handcrafted Aromatic Warmers", "Table Decoration", "Lamps"]
    }
};

// Design Family items — matched against real "design" type categories the
// same way the Shop menu matches "product" type categories below.
const FAMILY_DESIGN_ITEMS = [
    "Blue Felicity", "Blue Pattern", "Blue Flower", "Tranquility", "Serina Blue",
    "Blue Celico", "Spring Pattern", "Breeze Blue", "Green Flower", "Jungle Flower",
    "Kashmir Multi", "Ocean Blue", "Urban Blue", "Antique", "Islamic Calligraphy",
    "Women Art", "Light Serina Blue"
];

function normalizeName(name) {
    return name.trim().toLowerCase();
}

async function fetchCategories(type) {
    try {
        const response = await fetch(`${API_BASE_NAV}/categories?type=${type}`);
        const data = await response.json();
        return data.success ? data.categories : [];
    } catch (error) {
        console.error(`Failed to load ${type} categories for nav:`, error);
        return [];
    }
}

function buildByNameMap(categories) {
    const byName = new Map();
    categories.forEach(cat => {
        // category names may be "Parent > Child" — match on the last segment
        const parts = cat.name.split(">").map(p => p.trim());
        byName.set(normalizeName(parts[parts.length - 1]), cat);
    });
    return byName;
}

function buildShopDropdown(realCategories) {
    const byName = buildByNameMap(realCategories);

    const container = document.getElementById("shop-mega-dropdown");
    if (!container) return;

    let html = "";

    Object.entries(SHOP_MENU).forEach(([groupName, group]) => {
        // Link the column heading to OUR site's category page (found the
        // same way the items below are matched). If no match is found,
        // render it as plain (non-clickable) text instead of ever falling
        // back to the old WordPress site.
        const groupMatch = byName.get(normalizeName(group.matchName));
        const headingHtml = groupMatch
            ? `<a href="category.html?slug=${groupMatch.slug}">${groupName}</a>`
            : groupName;

        html += `<div class="mega-col"><h4>${headingHtml}</h4><ul>`;

        group.items.forEach(itemName => {
            const match = byName.get(normalizeName(itemName));

            if (match) {
                html += `<li><a href="category.html?slug=${match.slug}">${itemName}</a></li>`;
            } else {
                html += `<li class="menu-item-disabled">${itemName}</li>`;
            }
        });

        html += `</ul></div>`;
    });

    container.innerHTML = html;
}

function buildFamilyDesignDropdown(realDesignCategories) {
    const container = document.getElementById("family-design-dropdown");
    if (!container) return;

    const byName = buildByNameMap(realDesignCategories);

    const third = Math.ceil(FAMILY_DESIGN_ITEMS.length / 3);
    const columns = [
        FAMILY_DESIGN_ITEMS.slice(0, third),
        FAMILY_DESIGN_ITEMS.slice(third, third * 2),
        FAMILY_DESIGN_ITEMS.slice(third * 2)
    ];

    container.innerHTML = columns.map(col => `
        <div class="mega-col">
            <ul>
                ${col.map(name => {
                    const match = byName.get(normalizeName(name));
                    return match
                        ? `<li><a href="category.html?slug=${match.slug}">${name}</a></li>`
                        : `<li class="menu-item-disabled">${name}</li>`;
                }).join("")}
            </ul>
        </div>
    `).join("");
}

// ========================================
// SEARCH
// ========================================

function setupSearch() {
    const searchToggle = document.getElementById("search-toggle");
    const searchOverlay = document.getElementById("search-overlay");
    const searchInput = document.getElementById("search-input");
    const searchResults = document.getElementById("search-results");
    const searchClose = document.getElementById("search-close");

    if (!searchToggle || !searchOverlay) return;

    searchToggle.addEventListener("click", (e) => {
        e.preventDefault();
        searchOverlay.classList.add("open");
        searchInput.focus();
    });

    searchClose.addEventListener("click", () => {
        searchOverlay.classList.remove("open");
        searchInput.value = "";
        searchResults.innerHTML = "";
    });

    let debounceTimer;

    searchInput.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();

        if (query.length < 2) {
            searchResults.innerHTML = "";
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_NAV}/search?q=${encodeURIComponent(query)}`);
                const data = await response.json();

                if (!data.success) return;

                renderSearchResults(data.products, data.categories);

            } catch (error) {
                console.error("Search error:", error);
            }
        }, 300);
    });
}

function renderSearchResults(products, categories) {
    const searchResults = document.getElementById("search-results");

    if (products.length === 0 && categories.length === 0) {
        searchResults.innerHTML = `<p class="search-empty">No results found.</p>`;
        return;
    }

    let html = "";

    if (categories.length > 0) {
        html += `<div class="search-group"><h5>Categories</h5>`;
        categories.forEach(cat => {
            html += `<a href="category.html?slug=${cat.slug}" class="search-result-item">${cat.name}</a>`;
        });
        html += `</div>`;
    }

    if (products.length > 0) {
        html += `<div class="search-group"><h5>Products</h5>`;
        products.forEach(product => {
            const price = product.sale_price || product.regular_price || "";
            const image = product.images ? product.images.split(",")[0].trim() : "";

            html += `
                <a href="product.html?id=${product.id}" class="search-result-item search-result-product">
                    ${image ? `<img src="${image}" alt="">` : ""}
                    <span>${product.name}${price ? ` — Rs. ${price}` : ""}</span>
                </a>
            `;
        });
        html += `</div>`;
    }

    searchResults.innerHTML = html;
}

// ========================================
// MOBILE MENU
// ========================================

function setupMobileMenu() {
    const mobileMenuBtn = document.querySelector(".mobile-menu");
    const navLinks = document.querySelector(".nav-links");

    if (!mobileMenuBtn || !navLinks) return;

    mobileMenuBtn.addEventListener("click", () => {
        navLinks.classList.toggle("mobile-open");
    });

    // On mobile, dropdowns open on tap instead of hover
    document.querySelectorAll(".nav-item.has-dropdown > a").forEach(link => {
        link.addEventListener("click", (e) => {
            if (window.innerWidth <= 900) {
                e.preventDefault();
                const parent = link.parentElement;
                const isOpen = parent.classList.contains("dropdown-open");

                document.querySelectorAll(".nav-item.has-dropdown").forEach(item => {
                    item.classList.remove("dropdown-open");
                });

                if (!isOpen) parent.classList.add("dropdown-open");
            }
        });
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const [productCategories, designCategories] = await Promise.all([
        fetchCategories("product"),
        fetchCategories("design")
    ]);
    buildShopDropdown(productCategories);
    buildFamilyDesignDropdown(designCategories);
    setupSearch();
    setupMobileMenu();
});
