/* ============================================
   HOME PAGE — Featured Collections, Best Selling
   Products, and New Arrivals. All three are loaded
   live from the real API (nothing hardcoded), same
   as the rest of the site.

   Needs price-format.js loaded first (formatPrice).
============================================ */

const API_BASE_HOME = "https://vintage-artisans-production.up.railway.app/api";

// How many cards each section shows.
const COLLECTIONS_COUNT = 4;
const PRODUCTS_COUNT = 4;

function firstImage(product) {
    return product.images ? product.images.split(",")[0].trim() : "";
}

// ========================================
// FEATURED COLLECTIONS
// Uses real Design Family categories, each represented by one of its
// own real products' image — same lookup all-categories.js uses.
// ========================================

async function getCategoryImage(slug) {
    try {
        const response = await fetch(`${API_BASE_HOME}/products/category/${slug}`);
        const data = await response.json();
        if (data.success && data.products && data.products.length > 0) {
            return firstImage(data.products[0]);
        }
    } catch (error) {
        console.error(`Failed to load image for category "${slug}":`, error);
    }
    return "";
}

async function loadFeaturedCollections() {
    const container = document.getElementById("featured-collections-grid");
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_HOME}/categories?type=design`);
        const data = await response.json();

        if (!data.success || !data.categories || data.categories.length === 0) {
            container.innerHTML = `<p class="nh-empty-note">No collections available yet.</p>`;
            return;
        }

        const picks = data.categories.slice(0, COLLECTIONS_COUNT);
        const images = await Promise.all(picks.map(cat => getCategoryImage(cat.slug)));

        container.innerHTML = picks.map((cat, i) => `
            <a href="category.html?slug=${cat.slug}" class="nh-collection-card">
                <div class="nh-collection-image">
                    ${images[i] ? `<img src="${images[i]}" alt="${cat.name}" loading="lazy">` : ""}
                </div>
                <h3>${cat.name}</h3>
                <span>Shop Collection →</span>
            </a>
        `).join("");

    } catch (error) {
        console.error("Failed to load featured collections:", error);
        container.innerHTML = `<p class="nh-empty-note">Couldn't load collections right now.</p>`;
    }
}

// ========================================
// PRODUCT CARD (shared by Best Selling + New Arrivals)
// ========================================

function productCardHTML(product) {
    const image = firstImage(product);
    const hasSale = product.sale_price && Number(product.sale_price) < Number(product.regular_price);

    const priceHTML = hasSale
        ? `
            <span class="nh-sale-price">${formatPrice(product.sale_price, product.currency)}</span>
            <span class="nh-regular-price">${formatPrice(product.regular_price, product.currency)}</span>
        `
        : `<span class="nh-sale-price">${formatPrice(product.regular_price || product.sale_price, product.currency)}</span>`;

    const badge = hasSale ? `<span class="nh-product-badge">Sale</span>` : "";

    return `
        <div class="nh-product-card">
            <div class="nh-product-image">
                ${badge}
                <img src="${image}" alt="${product.name}" loading="lazy" decoding="async">
            </div>
            <div class="nh-product-info">
                <h3>${product.name}</h3>
                <div class="nh-product-price">${priceHTML}</div>
                <a href="product.html?id=${product.id}" class="nh-view-btn">View Details</a>
            </div>
        </div>
    `;
}

// ========================================
// BEST SELLING — real products the admin has marked "featured";
// if fewer than PRODUCTS_COUNT are marked, the rest are filled in
// with other published products so the section is never empty.
// ========================================

async function loadBestSelling() {
    const container = document.getElementById("best-selling-grid");
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_HOME}/products?limit=24`);
        const data = await response.json();

        if (!data.success || !data.products || data.products.length === 0) {
            container.innerHTML = `<p class="nh-empty-note">No products available yet.</p>`;
            return;
        }

        const featured = data.products.filter(p => p.featured);
        const rest = data.products.filter(p => !p.featured);
        const picks = [...featured, ...rest].slice(0, PRODUCTS_COUNT);

        container.innerHTML = picks.map(productCardHTML).join("");

    } catch (error) {
        console.error("Failed to load best selling products:", error);
        container.innerHTML = `<p class="nh-empty-note">Couldn't load products right now.</p>`;
    }
}

// ========================================
// NEW ARRIVALS — most recently added published products.
// ========================================

async function loadNewArrivals() {
    const container = document.getElementById("new-arrivals-grid");
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_HOME}/products?limit=${PRODUCTS_COUNT}&sort=newest`);
        const data = await response.json();

        if (!data.success || !data.products || data.products.length === 0) {
            container.innerHTML = `<p class="nh-empty-note">No products available yet.</p>`;
            return;
        }

        container.innerHTML = data.products.map(productCardHTML).join("");

    } catch (error) {
        console.error("Failed to load new arrivals:", error);
        container.innerHTML = `<p class="nh-empty-note">Couldn't load products right now.</p>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadFeaturedCollections();
    loadBestSelling();
    loadNewArrivals();
});
