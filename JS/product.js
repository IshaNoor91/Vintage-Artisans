console.log("PRODUCT JS LOADED");


// ========================================
// API
// ========================================

const API_BASE = "http://localhost:3000/api";


// ========================================
// PRODUCT ID
// ========================================

const params = new URLSearchParams(window.location.search);

const productId = params.get("id");


// ========================================
// DOM ELEMENTS
// ========================================

const heroTitle =
    document.getElementById("product-hero-title");

const productTitle =
    document.getElementById("product-title");

const productPrice =
    document.getElementById("product-price");

const mainImage =
    document.getElementById("main-product-image");

const thumbnails =
    document.getElementById("product-thumbnails");

const shortDescription =
    document.getElementById("product-short-description");

const description =
    document.getElementById("product-description");

const quantityInput =
    document.getElementById("quantity");

const quantityMinus =
    document.getElementById("quantity-minus");

const quantityPlus =
    document.getElementById("quantity-plus");

const addToCartButton =
    document.getElementById("add-to-cart");

const buyNowButton =
    document.getElementById("buy-now");

const productMaterial =
    document.getElementById("product-material");

const productDimensions =
    document.getElementById("product-dimensions");

const productCategory =
    document.getElementById("product-category");

const breadcrumbCategory =
    document.getElementById("breadcrumb-category");

const breadcrumbProduct =
    document.getElementById("breadcrumb-product");

const recommendedContainer =
    document.getElementById("recommended-products");

const relatedContainer =
    document.getElementById("related-products");


// ========================================
// CART STORAGE KEY
// ========================================

const CART_KEY = "vintageArtisansCart";


// ========================================
// LOAD PRODUCT
// ========================================

async function loadProduct() {

    if (!productId) {

        console.error("No product ID found.");

        if (productTitle) {
            productTitle.textContent =
                "Product Not Found";
        }

        return;
    }


    console.log(
        "Loading product ID:",
        productId
    );


    try {

        const response = await fetch(
            `${API_BASE}/products/${productId}`
        );


        if (!response.ok) {

            throw new Error(
                `Product API failed: ${response.status}`
            );

        }


        const data =
            await response.json();


        console.log(
            "PRODUCT API:",
            data
        );


        if (!data.success || !data.product) {

            throw new Error(
                "Product not found"
            );

        }


        const product =
            data.product;


        console.log(
            "PRODUCT:",
            product
        );


        displayProduct(product);

        setupQuantity();

        setupCartButtons(product);

        loadRelatedProducts(product);

        updateCartCount();


    } catch (error) {

        console.error(
            "PRODUCT LOAD ERROR:",
            error
        );


        if (productTitle) {

            productTitle.textContent =
                "Unable to load product";

        }

    }

}


// ========================================
// DISPLAY PRODUCT
// ========================================

function displayProduct(product) {


    // ========================================
    // TITLE
    // ========================================

    if (heroTitle) {

        heroTitle.textContent =
            product.name;

    }


    if (productTitle) {

        productTitle.textContent =
            product.name;

    }


    if (breadcrumbProduct) {

        breadcrumbProduct.textContent =
            product.name;

    }


    // ========================================
    // PRICE
    // ========================================

    const regularPrice =
        Number(product.regular_price || 0);

    const salePrice =
        Number(product.sale_price || 0);


    if (
        salePrice &&
        regularPrice &&
        salePrice < regularPrice
    ) {

        productPrice.innerHTML = `

            <span class="sale-price">
                Rs. ${salePrice.toFixed(2)}
            </span>

            <span class="regular-price">
                Rs. ${regularPrice.toFixed(2)}
            </span>

        `;

    } else {

        const price =
            regularPrice ||
            salePrice;


        productPrice.innerHTML = `

            <span class="sale-price">
                ${
                    price
                        ? `Rs. ${price.toFixed(2)}`
                        : "Price unavailable"
                }
            </span>

        `;

    }


    // ========================================
    // MAIN IMAGE
    // ========================================

    const images =
        product.images
            ? product.images
                .split(",")
                .map(image => image.trim())
                .filter(Boolean)
            : [];


    if (images.length > 0) {

        mainImage.src =
            images[0];

        mainImage.alt =
            product.name;


        thumbnails.innerHTML =
            "";


        images.forEach(
            (image, index) => {

                const thumbnail =
                    document.createElement("img");


                thumbnail.src =
                    image;


                thumbnail.alt =
                    product.name;


                thumbnail.className =
                    "product-thumbnail";


                if (index === 0) {

                    thumbnail.classList.add(
                        "active"
                    );

                }


                thumbnail.addEventListener(
                    "click",
                    () => {

                        mainImage.src =
                            image;


                        document
                            .querySelectorAll(
                                ".product-thumbnail"
                            )
                            .forEach(
                                item =>
                                    item.classList.remove(
                                        "active"
                                    )
                            );


                        thumbnail.classList.add(
                            "active"
                        );

                    }
                );


                thumbnails.appendChild(
                    thumbnail
                );

            }
        );

    }


    // ========================================
    // SHORT DESCRIPTION
    // ========================================

    if (shortDescription) {

        shortDescription.innerHTML =
            cleanDescription(
                product.short_description
            );

    }


    // ========================================
    // FULL DESCRIPTION
    // ========================================

    if (description) {

        description.innerHTML =
            cleanDescription(
                product.description
            );

    }


    // ========================================
    // CATEGORY
    // ========================================

    const categories =
        Array.isArray(product.categories)
            ? product.categories
            : [];


    if (categories.length > 0) {

        // Last category = most specific category
        const currentCategory =
            categories[categories.length - 1];


        if (productCategory) {

            productCategory.textContent =
                getCategoryName(
                    currentCategory.name
                );


            productCategory.href =
                `category.html?slug=${currentCategory.slug}`;

        }


        if (breadcrumbCategory) {

            breadcrumbCategory.textContent =
                getCategoryName(
                    currentCategory.name
                );


            breadcrumbCategory.href =
                `category.html?slug=${currentCategory.slug}`;

        }

    }


    // ========================================
    // MATERIAL
    // ========================================

    if (productMaterial) {

        productMaterial.textContent =
            extractField(
                product.short_description,
                "Material"
            ) || "—";

    }


    // ========================================
    // DIMENSIONS
    // ========================================

    if (productDimensions) {

        productDimensions.textContent =
            extractField(
                product.short_description,
                "Dimensions"
            ) || "—";

    }

}


// ========================================
// CLEAN DESCRIPTION
// ========================================

function cleanDescription(text) {

    if (!text) {

        return "";

    }


    return text
        .replace(/\r\\n/g, "\n")
        .replace(/\\r\\n/g, "\n")
        .replace(/&nbsp;/g, " ")
        .trim();

}


// ========================================
// CATEGORY NAME
// ========================================

function getCategoryName(name) {

    if (!name) {

        return "";

    }


    const parts =
        name
            .split(">")
            .map(
                part => part.trim()
            );


    return parts[
        parts.length - 1
    ];

}


// ========================================
// EXTRACT PRODUCT FIELD
// ========================================

function extractField(
    text,
    field
) {

    if (!text) {

        return "";

    }


    const regex =
        new RegExp(
            `${field}\\s*:?\\s*([^<\\n]+)`,
            "i"
        );


    const match =
        text.match(regex);


    if (!match) {

        return "";

    }


    return match[1]
        .replace(/<\/?[^>]+>/g, "")
        .trim();

}


// ========================================
// QUANTITY
// ========================================

function setupQuantity() {


    if (!quantityInput) {

        return;

    }


    quantityInput.value = 1;


    quantityMinus.addEventListener(
        "click",
        () => {

            let quantity =
                Number(
                    quantityInput.value
                );


            if (quantity > 1) {

                quantity--;

            }


            quantityInput.value =
                quantity;

        }
    );


    quantityPlus.addEventListener(
        "click",
        () => {

            let quantity =
                Number(
                    quantityInput.value
                );


            quantity++;

            quantityInput.value =
                quantity;

        }
    );


    quantityInput.addEventListener(
        "change",
        () => {

            let quantity =
                Number(
                    quantityInput.value
                );


            if (!quantity || quantity < 1) {

                quantity = 1;

            }


            quantityInput.value =
                quantity;

        }
    );

}


// ========================================
// CART BUTTONS
// ========================================

function setupCartButtons(product) {


    if (addToCartButton) {

        addToCartButton.onclick =
            () => {

                const quantity =
                    getQuantity();


                addProductToCart(
                    product,
                    quantity
                );


                showCartMessage(
                    `${product.name} added to cart`
                );

            };

    }


    if (buyNowButton) {

        buyNowButton.onclick =
            () => {

                const quantity =
                    getQuantity();


                addProductToCart(
                    product,
                    quantity
                );


                window.location.href =
                    "cart.html";

            };

    }

}


// ========================================
// GET QUANTITY
// ========================================

function getQuantity() {

    let quantity =
        Number(
            quantityInput?.value || 1
        );


    if (!quantity || quantity < 1) {

        quantity = 1;

    }


    return quantity;

}


// ========================================
// GET CART
// ========================================

function getCart() {

    try {

        const cart =
            JSON.parse(
                localStorage.getItem(
                    CART_KEY
                )
            );


        return Array.isArray(cart)
            ? cart
            : [];

    } catch {

        return [];

    }

}


// ========================================
// SAVE CART
// ========================================

function saveCart(cart) {

    localStorage.setItem(
        CART_KEY,
        JSON.stringify(cart)
    );


    updateCartCount();

}


// ========================================
// ADD PRODUCT TO CART
// ========================================

function addProductToCart(
    product,
    quantity
) {

    const cart =
        getCart();


    const existing =
        cart.find(
            item =>
                Number(item.id) ===
                Number(product.id)
        );


    const price =
        Number(
            product.sale_price ||
            product.regular_price ||
            0
        );


    const image =
        product.images
            ? product.images
                .split(",")[0]
                .trim()
            : "images/bowl.webp";


    if (existing) {

        existing.quantity +=
            quantity;

    } else {

        cart.push({

            id: product.id,

            name: product.name,

            price: price,

            regular_price:
                Number(
                    product.regular_price ||
                    0
                ),

            sale_price:
                Number(
                    product.sale_price ||
                    0
                ),

            image: image,

            quantity: quantity

        });

    }


    saveCart(cart);

}


// ========================================
// UPDATE CART COUNT
// ========================================

function updateCartCount() {

    const cart =
        getCart();


    const total =
        cart.reduce(
            (
                sum,
                item
            ) =>
                sum +
                Number(
                    item.quantity || 0
                ),
            0
        );


    const cartLinks =
        document.querySelectorAll(
            ".fa-bag-shopping"
        );


    cartLinks.forEach(
        icon => {

            const link =
                icon.closest("a");


            if (!link) {

                return;

            }


            let badge =
                link.querySelector(
                    ".cart-count"
                );


            if (!badge) {

                badge =
                    document.createElement(
                        "span"
                    );


                badge.className =
                    "cart-count";


                link.style.position =
                    "relative";


                link.appendChild(
                    badge
                );

            }


            badge.textContent =
                total;

        }
    );

}


// ========================================
// CART MESSAGE
// ========================================

function showCartMessage(message) {


    const existing =
        document.querySelector(
            ".cart-message"
        );


    if (existing) {

        existing.remove();

    }


    const messageBox =
        document.createElement(
            "div"
        );


    messageBox.className =
        "cart-message";


    messageBox.textContent =
        message;


    document.body.appendChild(
        messageBox
    );


    setTimeout(
        () => {

            messageBox.classList.add(
                "show"
            );

        },
        50
    );


    setTimeout(
        () => {

            messageBox.classList.remove(
                "show"
            );


            setTimeout(
                () =>
                    messageBox.remove(),
                300
            );

        },
        2500
    );

}


// ========================================
// RELATED PRODUCTS
// ========================================

async function loadRelatedProducts(product) {

    try {

        const categories =
            Array.isArray(
                product.categories
            )
                ? product.categories
                : [];


        if (
            categories.length === 0
        ) {

            console.log(
                "No categories found for product."
            );

            return;

        }


        const currentCategory =
            categories[
                categories.length - 1
            ];


        const slug =
            currentCategory.slug;


        console.log(
            "Loading related products:",
            slug
        );


        const response =
            await fetch(
                `${API_BASE}/products/category/${slug}`
            );


        if (!response.ok) {

            throw new Error(
                "Related products API failed"
            );

        }


        const data =
            await response.json();


        if (
            !data.success ||
            !Array.isArray(data.products)
        ) {

            return;

        }


        const related =
            data.products
                .filter(
                    item =>
                        Number(item.id) !==
                        Number(product.id)
                );


        const recommended =
            related.slice(0, 4);


        const moreRelated =
            related.slice(4, 8);


        renderRelatedProducts(
            recommendedContainer,
            recommended
        );


        renderRelatedProducts(
            relatedContainer,
            moreRelated
        );


    } catch (error) {

        console.error(
            "RELATED PRODUCTS ERROR:",
            error
        );

    }

}


// ========================================
// RENDER RELATED PRODUCTS
// ========================================

function renderRelatedProducts(
    container,
    products
) {

    if (!container) {

        return;

    }


    if (
        !products ||
        products.length === 0
    ) {

        container.innerHTML =
            `<p>No related products found.</p>`;

        return;

    }


    let html = "";


    products.forEach(
        product => {

            const image =
                product.images
                    ? product.images
                        .split(",")[0]
                        .trim()
                    : "images/bowl.webp";


            const regular =
                Number(
                    product.regular_price ||
                    0
                );


            const sale =
                Number(
                    product.sale_price ||
                    0
                );


            let priceHTML;


            if (
                sale &&
                regular &&
                sale < regular
            ) {

                priceHTML = `

                    <span class="sale-price">
                        Rs. ${sale.toFixed(2)}
                    </span>

                    <span class="regular-price">
                        Rs. ${regular.toFixed(2)}
                    </span>

                `;

            } else {

                priceHTML = `

                    <span class="sale-price">
                        Rs. ${
                            regular ||
                            sale ||
                            "Price unavailable"
                        }
                    </span>

                `;

            }


            html += `

                <div class="product-card">

                    <div class="product-image">

                        <img
                            src="${image}"
                            alt="${product.name}"
                            loading="lazy"
                        >

                    </div>


                    <div class="product-info">

                        <h3>
                            ${product.name}
                        </h3>


                        <div class="product-price">

                            ${priceHTML}

                        </div>


                        <a
                            href="product.html?id=${product.id}"
                            class="btn"
                        >
                            View Details
                        </a>

                    </div>

                </div>

            `;

        }
    );


    container.innerHTML =
        html;

}


// ========================================
// START
// ========================================

loadProduct();