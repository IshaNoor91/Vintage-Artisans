const container = document.getElementById("products-container");

const API_URL = "https://vintage-artisans-production.up.railway.app/api/products";

const productsPerPage = 24;

let currentPage = 1;
let totalPages = 1;


// ========================================
// LOAD PRODUCTS
// ========================================

function loadProducts(page = 1) {

    currentPage = page;

    container.innerHTML = `
        <p>Loading products...</p>
    `;


    fetch(`${API_URL}?page=${page}&limit=${productsPerPage}`)

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
                No products found.
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
                        Rs. ${product.sale_price}
                    </span>

                    <span class="regular-price">
                        Rs. ${product.regular_price}
                    </span>

                </div>

            `;

        } else {

            priceHTML = `

                <div class="product-price">

                    <span class="sale-price">

                        Rs. ${
                            product.regular_price ||
                            product.sale_price ||
                            "Price unavailable"
                        }

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

                <div class="product-image">

                    ${saleBadge}

                    <img
                        src="${image}"
                        alt="${product.name}"
                        loading="lazy"
                        decoding="async"
                    >

                </div>


                <div class="product-info">

                    <h3>
                        ${product.name}
                    </h3>


                    ${priceHTML}


                    <a
                        href="product.html?id=${product.id}"
                        class="btn"
                    >
                        View Details
                    </a>

                </div>

            </div>

        `;

    });


    container.innerHTML =
        productsHTML;

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
// INITIAL LOAD
// ========================================

loadProducts(1);