console.log("CART JS LOADED");


const CART_KEY =
    "vintageArtisansCart";


const cartContainer =
    document.getElementById(
        "cart-container"
    );


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

}


// ========================================
// RENDER CART
// ========================================

function renderCart() {

    const cart =
        getCart();


    if (
        cart.length === 0
    ) {

        cartContainer.innerHTML = `

            <div class="empty-cart">

                <i class="fa-solid fa-bag-shopping"></i>

                <h2>
                    Your cart is empty
                </h2>

                <p>
                    Looks like you haven't added
                    anything to your cart yet.
                </p>

                <a
                    href="shop.html"
                    class="btn"
                >
                    Continue Shopping
                </a>

            </div>

        `;

        return;

    }


    let subtotal = 0;

    // All items in a cart share one currency — they were all priced for
    // the same visitor in the same browsing session.
    const cartCurrency = cart[0] && cart[0].currency ? cart[0].currency : "PKR";

    let itemsHTML = "";


    cart.forEach(
        (item, index) => {

            const price =
                Number(
                    item.price || 0
                );


            const quantity =
                Number(
                    item.quantity || 1
                );


            const itemTotal =
                price * quantity;


            subtotal +=
                itemTotal;


            itemsHTML += `

                <div
                    class="cart-item"
                    data-index="${index}"
                >


                    <div class="cart-item-image">

                        <img
                            src="${item.image}"
                            alt="${item.name}"
                        >

                    </div>



                    <div class="cart-item-details">

                        <h3>
                            ${item.name}
                        </h3>


                        <p class="cart-item-price">

                            ${formatPrice(price, item.currency)}

                        </p>


                        <div
                            class="cart-quantity"
                        >

                            <button
                                class="cart-minus"
                                data-index="${index}"
                            >
                                −
                            </button>


                            <input
                                type="number"
                                min="1"
                                value="${quantity}"
                                class="cart-quantity-input"
                                data-index="${index}"
                            >


                            <button
                                class="cart-plus"
                                data-index="${index}"
                            >
                                +
                            </button>

                        </div>


                        <p class="cart-item-total">

                            Total:
                            <strong>
                                ${formatPrice(itemTotal, item.currency)}
                            </strong>

                        </p>


                        <button
                            class="remove-cart-item"
                            data-index="${index}"
                        >

                            <i class="fa-solid fa-trash"></i>

                            Remove

                        </button>

                    </div>

                </div>

            `;

        }
    );


    cartContainer.innerHTML = `

        <div class="cart-layout">


            <div class="cart-items">

                <h2>
                    Your Cart
                </h2>

                ${itemsHTML}

            </div>



            <div class="cart-summary">

                <h2>
                    Cart Summary
                </h2>


                <div class="cart-summary-row">

                    <span>
                        Subtotal
                    </span>

                    <strong>
                        ${formatPrice(subtotal, cartCurrency)}
                    </strong>

                </div>


                <div class="cart-summary-row">

                    <span>
                        Shipping
                    </span>

                    <span>
                        Calculated at checkout
                    </span>

                </div>


                <hr>


                <div class="cart-total">

                    <span>
                        Total
                    </span>

                    <strong>
                        ${formatPrice(subtotal, cartCurrency)}
                    </strong>

                </div>


                <button
                    class="checkout-btn"
                    id="checkout-btn"
                >
                    Proceed to Checkout
                </button>


                <a
                    href="shop.html"
                    class="continue-shopping"
                >
                    Continue Shopping
                </a>

            </div>

        </div>

    `;


    setupCartEvents();

}


// ========================================
// CART EVENTS
// ========================================

function setupCartEvents() {


    // ========================================
    // PLUS
    // ========================================

    document
        .querySelectorAll(
            ".cart-plus"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const index =
                            Number(
                                button.dataset.index
                            );


                        const cart =
                            getCart();


                        cart[index].quantity++;


                        saveCart(cart);

                        renderCart();

                    }
                );

            }
        );


    // ========================================
    // MINUS
    // ========================================

    document
        .querySelectorAll(
            ".cart-minus"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const index =
                            Number(
                                button.dataset.index
                            );


                        const cart =
                            getCart();


                        if (
                            cart[index].quantity > 1
                        ) {

                            cart[index].quantity--;

                        }


                        saveCart(cart);

                        renderCart();

                    }
                );

            }
        );


    // ========================================
    // INPUT
    // ========================================

    document
        .querySelectorAll(
            ".cart-quantity-input"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "change",
                    () => {

                        const index =
                            Number(
                                input.dataset.index
                            );


                        const cart =
                            getCart();


                        let quantity =
                            Number(
                                input.value
                            );


                        if (
                            !quantity ||
                            quantity < 1
                        ) {

                            quantity = 1;

                        }


                        cart[index].quantity =
                            quantity;


                        saveCart(cart);

                        renderCart();

                    }
                );

            }
        );


    // ========================================
    // REMOVE
    // ========================================

    document
        .querySelectorAll(
            ".remove-cart-item"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const index =
                            Number(
                                button.dataset.index
                            );


                        const cart =
                            getCart();


                        cart.splice(
                            index,
                            1
                        );


                        saveCart(cart);

                        renderCart();

                    }
                );

            }
        );


    // ========================================
    // CHECKOUT
    // ========================================

    const checkoutButton =
        document.getElementById(
            "checkout-btn"
        );


    if (checkoutButton) {

        checkoutButton.addEventListener(
            "click",
            () => {

                window.location.href =
                    "checkout.html";

            }
        );

    }

}


// ========================================
// START
// ========================================

renderCart();