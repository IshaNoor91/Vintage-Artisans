console.log("CATEGORY JS LOADED");

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

const container = document.getElementById("products-container");
const categoryTitle = document.getElementById("category-title");
const breadcrumbParent = document.getElementById("breadcrumb-parent");
const breadcrumbCategory = document.getElementById("breadcrumb-category");


// ========================================
// CHECK SLUG
// ========================================

if (!slug) {

    categoryTitle.textContent = "Category Not Found";

} else {


    // ========================================
    // LOAD CATEGORY NAME + BREADCRUMB
    // ========================================

    fetch("https://vintage-artisans-production.up.railway.app/api/categories")

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
    // LOAD CATEGORY PRODUCTS
    // ========================================

    fetch(
        `https://vintage-artisans-production.up.railway.app/api/products/category/${slug}`
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
                        No products found in this category.
                    </p>

                `;

                return;

            }


            console.log(
                "Products received:",
                data.products.length
            );


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
                                Rs. ${product.sale_price}
                            </span>

                            <span class="regular-price">
                                Rs. ${product.regular_price}
                            </span>

                        </div>

                    `;

                } else {

                    const price =
                        product.regular_price ||
                        product.sale_price ||
                        "Price unavailable";


                    priceHTML = `

                        <div class="product-price">

                            <span class="sale-price">
                                Rs. ${price}
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


            // ========================================
            // DISPLAY PRODUCTS ONCE
            // ========================================

            container.innerHTML =
                productsHTML;


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