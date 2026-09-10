console.log("CATEGORY JS LOADED");

const API_BASE = "https://vintage-artisans-production.up.railway.app/api";

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

const container = document.getElementById("products-container");
const categoryTitle = document.getElementById("category-title");
const breadcrumbParent = document.getElementById("breadcrumb-parent");
const breadcrumbCategory = document.getElementById("breadcrumb-category");

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
    const image = product.images ? product.images.split(",")[0].trim() : "images/bowl.webp";

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

// ========================================
// FILTER / SORT UI ELEMENTS
// ========================================

const categoryFilterList = document.getElementById("category-filter-list");
const priceMinInput = document.getElementById("price-min-input");
const priceMaxInput = document.getElementById("price-max-input");
const priceMinSlider = document.getElementById("price-min-slider");
const priceMaxSlider = document.getElementById("price-max-slider");
const priceMinLabel = document.getElementById("price-min-label");
const priceMaxLabel = document.getElementById("price-max-label");
const applyPriceBtn = document.getElementById("apply-price-btn");
const clearFiltersBtn = document.getElementById("clear-filters-btn");
const sortSelect = document.getElementById("sort-select");
const resultsCount = document.getElementById("results-count");

const filtersSidebar = document.getElementById("filters-sidebar");
const filtersBackdrop = document.getElementById("filters-backdrop");
const filtersClose = document.getElementById("filters-close");
const mobileFilterToggle = document.getElementById("mobile-filter-toggle");

// ========================================
// FILTER STATE
// ========================================

const filterState = {
    minPrice: null,
    maxPrice: null,
    sort: "default"
};


// ========================================
// CHECK SLUG
// ========================================

if (!slug) {

    categoryTitle.textContent = "Category Not Found";

} else {


    // ========================================
    // LOAD CATEGORY NAME + BREADCRUMB + SIDEBAR LIST
    // ========================================

    // Sidebar filter list must never include the Design Family categories
    // (Blue Felicity, Blue Pattern, ...) — only real product categories.
    fetch(`${API_BASE}/categories?type=product`)

        .then(response => response.json())

        .then(data => {
            if (data.success) renderCategoryFilterList(data.categories);
        })

        .catch(error => {
            console.error("CATEGORIES SIDEBAR API ERROR:", error);
        });

    // Unfiltered fetch — the page being viewed could be a Design Family
    // category (e.g. category.html?slug=blue-felicity), so the title and
    // breadcrumb lookup below needs to see every category, not just
    // product ones.
    fetch(`${API_BASE}/categories`)

        .then(response => {

            if (!response.ok) {
                throw new Error("Categories API failed");
            }

            return response.json();

        })

        .then(data => {

            console.log("Categories API:", data);

            const category = data.categories.find(
                item => item.slug === slug
            );


            if (!category) {

                categoryTitle.textContent =
                    "Category Not Found";

                breadcrumbCategory.textContent =
                    "Category Not Found";

                return;
            }


            // ========================================
            // CATEGORY HIERARCHY
            // ========================================

            const categoryParts = category.name
                .split(">")
                .map(part => part.trim());


            // ========================================
            // CURRENT CATEGORY
            // ========================================

            const currentCategory =
                categoryParts[categoryParts.length - 1];


            // ========================================
            // H1
            // ========================================

            categoryTitle.textContent =
                currentCategory;


            // ========================================
            // CURRENT CATEGORY IN BREADCRUMB
            // ========================================

            breadcrumbCategory.textContent =
                currentCategory;


            // ========================================
            // PARENT CATEGORY
            // ========================================

            if (categoryParts.length > 1) {

                const parentName =
                    categoryParts[0];


                // Find parent category
                const parentCategory =
                    data.categories.find(
                        item =>
                            item.name.trim() ===
                            parentName
                    );


                if (parentCategory) {

                    breadcrumbParent.style.display =
                        "inline";


                    breadcrumbParent.innerHTML = `

                        <a
                            href="category.html?slug=${parentCategory.slug}"
                        >
                            ${parentCategory.name}
                        </a>

                    `;

                } else {

                    breadcrumbParent.style.display =
                        "none";

                }

            } else {

                breadcrumbParent.style.display =
                    "none";

            }

        })

        .catch(error => {

            console.error(
                "CATEGORY NAME API ERROR:",
                error
            );

            categoryTitle.textContent =
                "Error loading category";

        });


    // ========================================
    // LOAD PRICE RANGE BOUNDS FOR SLIDERS
    // ========================================

    fetch(`${API_BASE}/products/price-range`)

        .then(response => response.json())

        .then(data => {

            if (!data.success) return;

            const min = Math.floor(data.minPrice);
            const max = Math.ceil(data.maxPrice);

            [priceMinSlider, priceMaxSlider].forEach(slider => {
                slider.min = min;
                slider.max = max;
            });

            priceMinSlider.value = min;
            priceMaxSlider.value = max;

            priceMinInput.placeholder = `Rs. ${min}`;
            priceMaxInput.placeholder = `Rs. ${max}`;

            priceMinLabel.textContent = `Rs. ${min}`;
            priceMaxLabel.textContent = `Rs. ${max}`;

        })

        .catch(error => {
            console.error("PRICE RANGE API ERROR:", error);
        });


    // ========================================
    // INITIAL PRODUCTS LOAD
    // ========================================

    loadCategoryProducts();

}


// ========================================
// BUILD SIDEBAR CATEGORY LIST
// (clicking a category navigates to that category page)
// ========================================

// Show only the last segment of a "Parent > Child" category name
function getCategoryDisplayName(name) {
    return name.split(">").map(part => part.trim()).pop();
}

function renderCategoryFilterList(categories) {

    if (!categoryFilterList) return;

    categoryFilterList.innerHTML = "";

    categories.forEach(cat => {

        const li = document.createElement("li");

        const button = document.createElement("button");
        button.textContent = getCategoryDisplayName(cat.name);
        button.title = cat.name;

        if (cat.slug === slug) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            window.location.href = `category.html?slug=${cat.slug}`;
        });

        li.appendChild(button);
        categoryFilterList.appendChild(li);

    });

}


// ========================================
// LOAD CATEGORY PRODUCTS (with filters/sort)
// ========================================

function loadCategoryProducts() {

    container.innerHTML = `<p>Loading products...</p>`;

    const query = new URLSearchParams();

    if (filterState.minPrice !== null) {
        query.set("minPrice", filterState.minPrice);
    }

    if (filterState.maxPrice !== null) {
        query.set("maxPrice", filterState.maxPrice);
    }

    if (filterState.sort && filterState.sort !== "default") {
        query.set("sort", filterState.sort);
    }

    fetch(
        `${API_BASE}/products/category/${slug}?${query.toString()}`
    )

        .then(response => {

            console.log(
                "Products API status:",
                response.status
            );


            if (!response.ok) {

                throw new Error(
                    `Products API failed with status ${response.status}`
                );

            }


            return response.json();

        })

        .then(data => {

            console.log(
                "CATEGORY PRODUCTS API:",
                data
            );


            if (!data.success) {

                throw new Error(
                    "Category products API returned success:false"
                );

            }


            // ========================================
            // CHECK PRODUCTS
            // ========================================

            if (
                !data.products ||
                data.products.length === 0
            ) {

                container.innerHTML = `

                    <p>
                        No products found for these filters.
                    </p>

                `;

                if (resultsCount) {
                    resultsCount.textContent = "0 results";
                }

                return;

            }


            console.log(
                "Products received:",
                data.products.length
            );

            if (resultsCount) {
                resultsCount.textContent =
                    `${data.products.length} result${data.products.length === 1 ? "" : "s"}`;
            }


            // ========================================
            // BUILD ALL PRODUCT CARDS
            // ========================================

            let productsHTML = "";


            data.products.forEach(product => {


                // ========================================
                // PRODUCT IMAGE
                // ========================================

                const image = product.images
                    ? product.images
                        .split(",")[0]
                        .trim()
                    : "images/bowl.webp";


                // ========================================
                // SALE CHECK
                // ========================================

                const hasSale =
                    product.sale_price &&
                    product.regular_price &&
                    Number(product.sale_price)
                    <
                    Number(product.regular_price);


                // ========================================
                // PRICE HTML
                // ========================================

                let priceHTML = "";


                if (hasSale) {

                    priceHTML = `

                        <div class="product-price">

                            <span class="sale-price">
                                ${formatPrice(product.sale_price, product.currency)}
                            </span>

                            <span class="regular-price">
                                ${formatPrice(product.regular_price, product.currency)}
                            </span>

                        </div>

                    `;

                } else {

                    const price =
                        product.regular_price ||
                        product.sale_price;


                    priceHTML = `

                        <div class="product-price">

                            <span class="sale-price">
                                ${formatPrice(price, product.currency)}
                            </span>

                        </div>

                    `;

                }


                // ========================================
                // SALE BADGE
                // ========================================

                const saleBadge = hasSale

                    ? `
                        <span class="sale-badge">
                            Sale
                        </span>
                    `

                    : "";


                // ========================================
                // PRODUCT CARD
                // ========================================

                productsHTML += `

                    <div class="product-card">


                        <a href="product.html?id=${product.id}" class="product-image">

                            ${saleBadge}


                            <img

                                src="${image}"

                                alt="${product.name}"

                                loading="lazy"

                                decoding="async"

                            >

                        </a>


                        <div class="product-info">


                            <h3>

                                ${product.name}

                            </h3>


                            ${priceHTML}


                            <div class="card-qty">
                                <button type="button" class="card-qty-minus">−</button>
                                <input type="number" class="card-qty-input" value="1" min="1">
                                <button type="button" class="card-qty-plus">+</button>
                            </div>

                            <button

                                class="btn add-to-cart-btn"

                                data-id="${product.id}"

                                type="button"

                            >

                                Add to Cart

                            </button>


                        </div>


                    </div>

                `;

            });


            // ========================================
            // DISPLAY PRODUCTS ONCE
            // ========================================

            container.innerHTML =
                productsHTML;

            wireCardQuantitySteppers(container);

            container.querySelectorAll(".add-to-cart-btn").forEach(button => {
                button.addEventListener("click", () => {
                    const product = data.products.find(p => Number(p.id) === Number(button.dataset.id));
                    if (!product) return;

                    const qtyInput = button.closest(".product-info").querySelector(".card-qty-input");
                    const quantity = Math.max(1, Number(qtyInput?.value) || 1);

                    addProductToCart(product, quantity);

                    const original = button.textContent;
                    button.textContent = "Added ✓";
                    setTimeout(() => { button.textContent = original; }, 1500);
                });
            });


            console.log(
                "Cards rendered:",
                container.querySelectorAll(".product-card").length
            );

        })

        .catch(error => {

            console.error(
                "CATEGORY PRODUCTS API ERROR:",
                error
            );


            container.innerHTML = `

                <p>
                    Unable to load products.
                </p>

            `;

        });

}


// ========================================
// SORT DROPDOWN
// ========================================

if (sortSelect) {

    sortSelect.addEventListener("change", (e) => {
        filterState.sort = e.target.value;
        loadCategoryProducts();
    });

}


// ========================================
// PRICE RANGE — sync sliders <-> number inputs
// ========================================

if (priceMinSlider && priceMaxSlider) {

    priceMinSlider.addEventListener("input", () => {

        if (Number(priceMinSlider.value) > Number(priceMaxSlider.value)) {
            priceMinSlider.value = priceMaxSlider.value;
        }

        priceMinLabel.textContent = `Rs. ${priceMinSlider.value}`;
        priceMinInput.value = priceMinSlider.value;

    });

    priceMaxSlider.addEventListener("input", () => {

        if (Number(priceMaxSlider.value) < Number(priceMinSlider.value)) {
            priceMaxSlider.value = priceMinSlider.value;
        }

        priceMaxLabel.textContent = `Rs. ${priceMaxSlider.value}`;
        priceMaxInput.value = priceMaxSlider.value;

    });

}

if (priceMinInput && priceMaxInput) {

    priceMinInput.addEventListener("input", () => {
        if (priceMinInput.value !== "") {
            priceMinSlider.value = priceMinInput.value;
            priceMinLabel.textContent = `Rs. ${priceMinInput.value}`;
        }
    });

    priceMaxInput.addEventListener("input", () => {
        if (priceMaxInput.value !== "") {
            priceMaxSlider.value = priceMaxInput.value;
            priceMaxLabel.textContent = `Rs. ${priceMaxInput.value}`;
        }
    });

}


// ========================================
// APPLY PRICE FILTER
// ========================================

if (applyPriceBtn) {

    applyPriceBtn.addEventListener("click", () => {

        const min = priceMinInput.value !== "" ? Number(priceMinInput.value) : Number(priceMinSlider.value);
        const max = priceMaxInput.value !== "" ? Number(priceMaxInput.value) : Number(priceMaxSlider.value);

        filterState.minPrice = min;
        filterState.maxPrice = max;

        loadCategoryProducts();
        closeMobileFilters();

    });

}


// ========================================
// CLEAR ALL FILTERS
// ========================================

if (clearFiltersBtn) {

    clearFiltersBtn.addEventListener("click", () => {

        filterState.minPrice = null;
        filterState.maxPrice = null;
        filterState.sort = "default";

        priceMinInput.value = "";
        priceMaxInput.value = "";

        if (priceMinSlider && priceMaxSlider) {
            priceMinSlider.value = priceMinSlider.min;
            priceMaxSlider.value = priceMaxSlider.max;
            priceMinLabel.textContent = `Rs. ${priceMinSlider.min}`;
            priceMaxLabel.textContent = `Rs. ${priceMaxSlider.max}`;
        }

        if (sortSelect) sortSelect.value = "default";

        loadCategoryProducts();
        closeMobileFilters();

    });

}


// ========================================
// MOBILE FILTER DRAWER
// ========================================

function openMobileFilters() {
    filtersSidebar.classList.add("open");
    filtersBackdrop.classList.add("open");
}

function closeMobileFilters() {
    if (!filtersSidebar) return;
    filtersSidebar.classList.remove("open");
    filtersBackdrop.classList.remove("open");
}

if (mobileFilterToggle) {
    mobileFilterToggle.addEventListener("click", openMobileFilters);
}

if (filtersClose) {
    filtersClose.addEventListener("click", closeMobileFilters);
}

if (filtersBackdrop) {
    filtersBackdrop.addEventListener("click", closeMobileFilters);
}