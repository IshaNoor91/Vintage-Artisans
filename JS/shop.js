const container = document.getElementById("products-container");

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

const API_BASE = "https://vintage-artisans-production.up.railway.app/api";
const API_URL = `${API_BASE}/products`;

const productsPerPage = 24;

let currentPage = 1;
let totalPages = 1;

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
// category: null means "All Categories"
// ========================================

const filterState = {
    category: null,
    minPrice: null,
    maxPrice: null,
    sort: "default"
};


// ========================================
// LOAD CATEGORY LIST FOR SIDEBAR
// ========================================

function loadCategoryFilterList() {

    if (!categoryFilterList) return;

    // type=product excludes the Design Family categories (Blue Felicity,
    // Blue Pattern, ...) — those only belong in the Design Family nav
    // menu, never in this sidebar filter.
    fetch(`${API_BASE}/categories?type=product`)

        .then(response => response.json())

        .then(data => {

            if (!data.success) return;

            renderCategoryFilterList(data.categories);

        })

        .catch(error => {
            console.error("CATEGORIES API ERROR:", error);
        });

}


// Show only the last segment of a "Parent > Child" category name
function getCategoryDisplayName(name) {
    return name.split(">").map(part => part.trim()).pop();
}

function renderCategoryFilterList(categories) {

    categoryFilterList.innerHTML = "";

    // ---- "All Categories" option ----
    const allLi = document.createElement("li");
    const allBtn = document.createElement("button");
    allBtn.textContent = "All Categories";
    allBtn.classList.add("active");
    allBtn.dataset.slug = "";

    allBtn.addEventListener("click", () => selectCategory(null, allBtn));

    allLi.appendChild(allBtn);
    categoryFilterList.appendChild(allLi);

    // ---- individual categories ----
    categories.forEach(cat => {

        const li = document.createElement("li");
        const button = document.createElement("button");
        button.textContent = getCategoryDisplayName(cat.name);
        button.title = cat.name;
        button.dataset.slug = cat.slug;

        button.addEventListener("click", () => selectCategory(cat.slug, button));

        li.appendChild(button);
        categoryFilterList.appendChild(li);

    });

}


function selectCategory(slug, clickedButton) {

    filterState.category = slug;

    // toggle active state across all buttons
    categoryFilterList
        .querySelectorAll("button")
        .forEach(btn => btn.classList.remove("active"));

    clickedButton.classList.add("active");

    loadProducts(1);
    closeMobileFilters();

}


// ========================================
// LOAD PRICE RANGE BOUNDS FOR SLIDERS
// ========================================

function loadPriceRangeBounds() {

    if (!priceMinSlider || !priceMaxSlider) return;

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

}


// ========================================
// LOAD PRODUCTS
// ========================================

function loadProducts(page = 1) {

    currentPage = page;

    container.innerHTML = `
        <p>Loading products...</p>
    `;

    const query = new URLSearchParams();
    query.set("page", page);
    query.set("limit", productsPerPage);

    if (filterState.category) {
        query.set("category", filterState.category);
    }

    if (filterState.minPrice !== null) {
        query.set("minPrice", filterState.minPrice);
    }

    if (filterState.maxPrice !== null) {
        query.set("maxPrice", filterState.maxPrice);
    }

    if (filterState.sort && filterState.sort !== "default") {
        query.set("sort", filterState.sort);
    }


    fetch(`${API_URL}?${query.toString()}`)

        .then(response => {

            if (!response.ok) {

                throw new Error(
                    "Failed to fetch products"
                );

            }

            return response.json();

        })


        .then(data => {

            console.log("Shop API:", data);


            if (!data.success) {

                throw new Error(
                    "Products API returned an error"
                );

            }


            /*
            ========================================
            PAGINATION DATA FROM API
            ========================================
            */

            totalPages = data.totalPages;

            if (resultsCount) {
                resultsCount.textContent =
                    `${data.total} result${data.total === 1 ? "" : "s"}`;
            }


            /*
            ========================================
            DISPLAY PRODUCTS
            ========================================
            */

            displayProducts(data.products);


            /*
            ========================================
            DISPLAY PAGINATION
            ========================================
            */

            renderPagination();

        })


        .catch(error => {

            console.error(
                "Error loading shop products:",
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
// DISPLAY PRODUCTS
// ========================================

function displayProducts(products) {

    if (!products || products.length === 0) {

        container.innerHTML = `
            <p>
                No products found for these filters.
            </p>
        `;

        return;

    }


    let productsHTML = "";


    products.forEach(product => {


        const image = product.images
            ? product.images
                .split(",")[0]
                .trim()
            : "images/bowl.webp";


        const hasSale =
            product.sale_price &&
            product.regular_price &&
            Number(product.sale_price) <
            Number(product.regular_price);


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

            priceHTML = `

                <div class="product-price">

                    <span class="sale-price">
                        ${formatPrice(product.regular_price || product.sale_price, product.currency)}
                    </span>

                </div>

            `;

        }


        const saleBadge =
            hasSale
                ? `<span class="sale-badge">Sale</span>`
                : "";


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


    container.innerHTML =
        productsHTML;

    wireCardQuantitySteppers(container);

    container.querySelectorAll(".add-to-cart-btn").forEach(button => {
        button.addEventListener("click", () => {
            const product = products.find(p => Number(p.id) === Number(button.dataset.id));
            if (!product) return;

            const qtyInput = button.closest(".product-info").querySelector(".card-qty-input");
            const quantity = Math.max(1, Number(qtyInput?.value) || 1);

            addProductToCart(product, quantity);

            const original = button.textContent;
            button.textContent = "Added ✓";
            setTimeout(() => { button.textContent = original; }, 1500);
        });
    });

}


// ========================================
// PAGINATION
// ========================================

function renderPagination() {

    let pagination =
        document.getElementById("pagination");


    if (!pagination) {

        pagination =
            document.createElement("div");

        pagination.id =
            "pagination";

        pagination.className =
            "pagination";


        container.parentElement.appendChild(
            pagination
        );

    }


    let html = "";


    /*
    ========================================
    PREVIOUS
    ========================================
    */

    html += `

        <button
            class="pagination-btn"
            id="prev-btn"
            ${currentPage === 1 ? "disabled" : ""}
        >
            ‹ PREV
        </button>

    `;


    /*
    ========================================
    PAGE NUMBERS
    ========================================
    */

    for (
        let page = 1;
        page <= totalPages;
        page++
    ) {

        html += `

            <button
                class="page-number ${
                    page === currentPage
                        ? "active"
                        : ""
                }"
                data-page="${page}"
            >
                ${page}
            </button>

        `;

    }


    /*
    ========================================
    NEXT
    ========================================
    */

    html += `

        <button
            class="pagination-btn"
            id="next-btn"
            ${currentPage === totalPages ? "disabled" : ""}
        >
            NEXT ›
        </button>

    `;


    pagination.innerHTML =
        html;


    /*
    ========================================
    PAGE NUMBER CLICK
    ========================================
    */

    document
        .querySelectorAll(".page-number")
        .forEach(button => {

            button.addEventListener(
                "click",
                function () {

                    const page =
                        Number(
                            this.dataset.page
                        );

                    loadProducts(page);

                    window.scrollTo({
                        top: 0,
                        behavior: "smooth"
                    });

                }
            );

        });


    /*
    ========================================
    NEXT BUTTON
    ========================================
    */

    const nextButton =
        document.getElementById("next-btn");


    if (nextButton) {

        nextButton.addEventListener(
            "click",
            function () {

                if (
                    currentPage <
                    totalPages
                ) {

                    loadProducts(
                        currentPage + 1
                    );

                    window.scrollTo({
                        top: 0,
                        behavior: "smooth"
                    });

                }

            }
        );

    }


    /*
    ========================================
    PREVIOUS BUTTON
    ========================================
    */

    const prevButton =
        document.getElementById("prev-btn");


    if (prevButton) {

        prevButton.addEventListener(
            "click",
            function () {

                if (currentPage > 1) {

                    loadProducts(
                        currentPage - 1
                    );

                    window.scrollTo({
                        top: 0,
                        behavior: "smooth"}
                    );

                }

            }
        );

    }

}


// ========================================
// SORT DROPDOWN
// ========================================

if (sortSelect) {

    sortSelect.addEventListener("change", (e) => {
        filterState.sort = e.target.value;
        loadProducts(1);
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

        loadProducts(1);
        closeMobileFilters();

    });

}


// ========================================
// CLEAR ALL FILTERS
// ========================================

if (clearFiltersBtn) {

    clearFiltersBtn.addEventListener("click", () => {

        filterState.category = null;
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

        if (categoryFilterList) {
            categoryFilterList
                .querySelectorAll("button")
                .forEach(btn => btn.classList.remove("active"));

            const allBtn = categoryFilterList.querySelector('button[data-slug=""]');
            if (allBtn) allBtn.classList.add("active");
        }

        loadProducts(1);
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


//.............................
//sidebar toggle
//.........................

// ========================================
// INITIAL LOAD
// ========================================

loadCategoryFilterList();
loadPriceRangeBounds();
loadProducts(1);
