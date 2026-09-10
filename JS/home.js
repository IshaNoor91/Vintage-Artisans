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
// CART — same localStorage cart every page shares (see product.js)
// ========================================
const CART_KEY = "vintageArtisansCart";

function getCart() {
    try {
        const cart = JSON.parse(localStorage.getItem(CART_KEY));
        return Array.isArray(cart) ? cart : [];
    } catch {
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const total = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    document.querySelectorAll(".fa-bag-shopping").forEach(icon => {
        const link = icon.closest("a");
        if (!link) return;
        let badge = link.querySelector(".cart-count");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "cart-count";
            link.style.position = "relative";
            link.appendChild(badge);
        }
        badge.textContent = total;
    });
}

function addProductToCart(product, quantity) {
    const cart = getCart();
    const existing = cart.find(item => Number(item.id) === Number(product.id));
    const price = Number(product.sale_price || product.regular_price || 0);
    const image = firstImage(product) || "images/bowl.webp";

    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price,
            regular_price: Number(product.regular_price || 0),
            sale_price: Number(product.sale_price || 0),
            currency: product.currency || "PKR",
            image,
            quantity
        });
    }

    saveCart(cart);
}

// Wires the −/+ buttons on every card's quantity stepper (.card-qty) found
// inside the given container. Safe to call after each re-render.
function wireCardQuantitySteppers(scope) {
    scope.querySelectorAll(".card-qty").forEach(wrapper => {
        const input = wrapper.querySelector(".card-qty-input");
        wrapper.querySelector(".card-qty-minus")?.addEventListener("click", () => {
            input.value = Math.max(1, (Number(input.value) || 1) - 1);
        });
        wrapper.querySelector(".card-qty-plus")?.addEventListener("click", () => {
            input.value = (Number(input.value) || 1) + 1;
        });
    });
}

// Delegated add-to-cart wiring — call after any innerHTML render that used
// productCardHTML(), passing that same list of products.
function wireAddToCartButtons(container, products) {
    wireCardQuantitySteppers(container);

    container.querySelectorAll(".add-to-cart-btn").forEach(button => {
        button.addEventListener("click", () => {
            const product = products.find(p => Number(p.id) === Number(button.dataset.id));
            if (!product) return;

            const qtyInput = button.closest(".nh-product-info").querySelector(".card-qty-input");
            const quantity = Math.max(1, Number(qtyInput?.value) || 1);

            addProductToCart(product, quantity);

            const original = button.textContent;
            button.textContent = "Added ✓";
            setTimeout(() => { button.textContent = original; }, 1500);
        });
    });
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
            <a href="product.html?id=${product.id}" class="nh-product-image">
                ${badge}
                <img src="${image}" alt="${product.name}" loading="lazy" decoding="async">
            </a>
            <div class="nh-product-info">
                <h3>${product.name}</h3>
                <div class="nh-product-price">${priceHTML}</div>
                <div class="card-qty">
                    <button type="button" class="card-qty-minus">−</button>
                    <input type="number" class="card-qty-input" value="1" min="1">
                    <button type="button" class="card-qty-plus">+</button>
                </div>
                <button type="button" class="nh-view-btn add-to-cart-btn" data-id="${product.id}">Add to Cart</button>
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
        wireAddToCartButtons(container, picks);

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
        wireAddToCartButtons(container, data.products);

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
