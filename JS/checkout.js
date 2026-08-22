console.log("CHECKOUT JS LOADED");


const CART_KEY = "vintageArtisansCart";

const API_BASE = "https://vintage-artisans-production.up.railway.app/api";

const container = document.getElementById("checkout-container");

// ========================================
// STRIPE CONFIG
// Replace with your real publishable key when ready.
// This only needs the PUBLISHABLE key (safe for the browser) —
// never put your secret key here.
// ========================================

const STRIPE_PUBLISHABLE_KEY = "pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY";

let stripe = null;
let cardElement = null;


// ========================================
// CART HELPERS
// ========================================

function getCart() {

    try {

        const cart = JSON.parse(localStorage.getItem(CART_KEY));
        return Array.isArray(cart) ? cart : [];

    } catch {

        return [];

    }

}

function clearCart() {
    localStorage.removeItem(CART_KEY);
}


// ========================================
// RENDER CHECKOUT
// ========================================

function renderCheckout() {

    const cart = getCart();

    if (cart.length === 0) {

        container.innerHTML = `

            <div class="empty-cart">

                <i class="fa-solid fa-bag-shopping"></i>

                <h2>Your cart is empty</h2>

                <p>Add something to your cart before checking out.</p>

                <a href="shop.html" class="btn">Continue Shopping</a>

            </div>

        `;

        return;

    }

    let subtotal = 0;

    const itemsHTML = cart.map(item => {

        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);
        const lineTotal = price * quantity;

        subtotal += lineTotal;

        return `
            <div class="cart-summary-row">
                <span>${item.name} × ${quantity}</span>
                <span>Rs. ${lineTotal.toFixed(2)}</span>
            </div>
        `;

    }).join("");

    container.innerHTML = `

        <div class="cart-layout checkout-layout">

            <div class="cart-items checkout-form">

                <h2>Contact & Shipping</h2>

                <form id="checkout-form">

                    <div class="form-group">
                        <label for="full-name">Full Name</label>
                        <input type="text" id="full-name" name="fullName" required>
                    </div>

                    <div class="form-row">

                        <div class="form-group">
                            <label for="email">Email</label>
                            <input type="email" id="email" name="email" required>
                        </div>

                        <div class="form-group">
                            <label for="phone">Phone</label>
                            <input type="tel" id="phone" name="phone" required>
                        </div>

                    </div>

                    <div class="form-group">
                        <label for="address">Address</label>
                        <input type="text" id="address" name="address" required>
                    </div>

                    <div class="form-row">

                        <div class="form-group">
                            <label for="city">City</label>
                            <input type="text" id="city" name="city" required>
                        </div>

                        <div class="form-group">
                            <label for="postal-code">Postal Code</label>
                            <input type="text" id="postal-code" name="postalCode">
                        </div>

                    </div>

                    <div class="form-group">
                        <label for="notes">Order Notes (optional)</label>
                        <textarea id="notes" name="notes" rows="3"></textarea>
                    </div>


                    <!-- ============ PAYMENT METHOD ============ -->

                    <div class="payment-method-group">

                        <h3>Payment Method</h3>

                        <label class="payment-option">
                            <input type="radio" name="paymentMethod" value="cod" checked>
                            <span>Cash on Delivery</span>
                        </label>

                        <label class="payment-option">
                            <input type="radio" name="paymentMethod" value="stripe">
                            <span>Pay with Card (Stripe)</span>
                        </label>

                        <label class="payment-option">
                            <input type="radio" name="paymentMethod" value="bank_transfer">
                            <span>Bank Transfer</span>
                        </label>

                    </div>


                    <!-- ---- Stripe card panel ---- -->

                    <div id="payment-panel-stripe" class="payment-panel" style="display:none;">

                        <label>Card Details</label>

                        <div id="stripe-card-element" class="stripe-card-element"></div>

                        <div id="stripe-card-errors" class="checkout-error"></div>

                    </div>


                    <!-- ---- Bank transfer panel ---- -->

                    <div id="payment-panel-bank" class="payment-panel" style="display:none;">

                        <div class="bank-details">

                            <p><strong>Bank Name:</strong> [YOUR BANK NAME]</p>
                            <p><strong>Account Title:</strong> [YOUR ACCOUNT TITLE]</p>
                            <p><strong>Account Number:</strong> [YOUR ACCOUNT NUMBER]</p>
                            <p><strong>IBAN:</strong> [YOUR IBAN]</p>

                            <p class="bank-instructions">
                                Please transfer the total amount to the account above, then
                                enter your transaction/reference ID below. We'll confirm
                                your order once the payment is verified.
                            </p>

                        </div>

                        <div class="form-group">
                            <label for="transaction-ref">Transaction / Reference ID</label>
                            <input type="text" id="transaction-ref" name="transactionRef">
                        </div>

                    </div>


                    <div id="checkout-error" class="checkout-error"></div>

                    <button type="submit" class="checkout-btn btn" id="place-order-btn">
                        Place Order — Cash on Delivery
                    </button>

                </form>

            </div>

            <div class="cart-summary">

                <h2>Order Summary</h2>

                ${itemsHTML}

                <hr>

                <div class="cart-total">
                    <span>Total</span>
                    <strong>Rs. ${subtotal.toFixed(2)}</strong>
                </div>

                <a href="cart.html" class="continue-shopping">← Back to Cart</a>

            </div>

        </div>

    `;

    document
        .getElementById("checkout-form")
        .addEventListener("submit", handleSubmit);

    document
        .querySelectorAll('input[name="paymentMethod"]')
        .forEach(radio => radio.addEventListener("change", updatePaymentUI));

    updatePaymentUI();

}


// ========================================
// SHOW/HIDE PAYMENT PANELS + BUTTON LABEL
// ========================================

function getSelectedPaymentMethod() {
    const checked = document.querySelector('input[name="paymentMethod"]:checked');
    return checked ? checked.value : "cod";
}

function updatePaymentUI() {

    const method = getSelectedPaymentMethod();

    document.getElementById("payment-panel-stripe").style.display =
        method === "stripe" ? "block" : "none";

    document.getElementById("payment-panel-bank").style.display =
        method === "bank_transfer" ? "block" : "none";

    const submitButton = document.getElementById("place-order-btn");

    if (method === "stripe") {
        submitButton.textContent = "Pay & Place Order";
        initStripeElements();
    } else if (method === "bank_transfer") {
        submitButton.textContent = "Place Order — Bank Transfer";
    } else {
        submitButton.textContent = "Place Order — Cash on Delivery";
    }

}


// ========================================
// STRIPE ELEMENTS SETUP (lazy — only once)
// ========================================

function initStripeElements() {

    if (stripe && cardElement) return; // already set up

    if (!window.Stripe) {
        console.error(
            "Stripe.js not loaded. Add <script src=\"https://js.stripe.com/v3/\"></script> to checkout.html before checkout.js."
        );
        return;
    }

    stripe = Stripe(STRIPE_PUBLISHABLE_KEY);

    const elements = stripe.elements();
    cardElement = elements.create("card");
    cardElement.mount("#stripe-card-element");

    cardElement.on("change", (event) => {
        document.getElementById("stripe-card-errors").textContent =
            event.error ? event.error.message : "";
    });

}


// ========================================
// SUBMIT ORDER
// ========================================

async function handleSubmit(event) {

    event.preventDefault();

    const form = event.target;
    const submitButton = document.getElementById("place-order-btn");
    const errorBox = document.getElementById("checkout-error");

    errorBox.textContent = "";

    const paymentMethod = getSelectedPaymentMethod();

    // ---- Bank transfer requires a reference number ----
    if (paymentMethod === "bank_transfer" && !form.transactionRef.value.trim()) {
        errorBox.textContent = "Please enter your transaction/reference ID.";
        return;
    }

    const cart = getCart();
    const subtotal = cart.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
        0
    );

    const payload = {
        customer: {
            fullName: form.fullName.value.trim(),
            email: form.email.value.trim(),
            phone: form.phone.value.trim(),
            address: form.address.value.trim(),
            city: form.city.value.trim(),
            postalCode: form.postalCode.value.trim(),
            notes: form.notes.value.trim()
        },
        items: cart.map(item => ({
            productId: item.id,
            name: item.name,
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1)
        })),
        subtotal: subtotal,
        total: subtotal,
        paymentMethod: paymentMethod
    };

    submitButton.disabled = true;

    try {

        // ---- STRIPE: create + confirm the card payment first ----
        if (paymentMethod === "stripe") {

            submitButton.textContent = "Processing payment...";

            if (!stripe || !cardElement) {
                throw new Error("Card payment isn't ready yet. Please try again in a moment.");
            }

            const intentResponse = await fetch(`${API_BASE}/create-payment-intent`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: subtotal })
            });

            const intentData = await intentResponse.json();

            if (!intentResponse.ok || !intentData.success) {
                throw new Error(intentData.message || "Could not start payment.");
            }

            const result = await stripe.confirmCardPayment(intentData.clientSecret, {
                payment_method: {
                    card: cardElement,
                    billing_details: {
                        name: payload.customer.fullName,
                        email: payload.customer.email || undefined,
                        phone: payload.customer.phone || undefined
                    }
                }
            });

            if (result.error) {
                throw new Error(result.error.message || "Card payment failed.");
            }

            payload.paymentReference = result.paymentIntent.id;

        // ---- BANK TRANSFER: attach the reference the customer entered ----
        } else if (paymentMethod === "bank_transfer") {

            payload.paymentReference = form.transactionRef.value.trim();

        }

        submitButton.textContent = "Placing order...";

        const response = await fetch(`${API_BASE}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Failed to place order");
        }

        clearCart();
        renderConfirmation(data.orderId, paymentMethod);

    } catch (error) {

        console.error("ORDER SUBMIT ERROR:", error);

        errorBox.textContent =
            error.message || "Something went wrong placing your order. Please try again.";

        submitButton.disabled = false;
        updatePaymentUI(); // restores the correct button label

    }

}


// ========================================
// CONFIRMATION
// ========================================

function renderConfirmation(orderId, paymentMethod) {

    let note = "We'll be in touch to confirm delivery.";

    if (paymentMethod === "bank_transfer") {
        note = "We'll verify your bank transfer and confirm your order shortly.";
    } else if (paymentMethod === "stripe") {
        note = "Your payment was successful — we'll get your order ready for delivery.";
    }

    container.innerHTML = `

        <div class="empty-cart">

            <i class="fa-solid fa-circle-check"></i>

            <h2>Order placed!</h2>

            <p>
                Thanks for your order${orderId ? ` — reference #${orderId}` : ""}.
                ${note}
            </p>

            <a href="shop.html" class="btn">Continue Shopping</a>

        </div>

    `;

}


document.addEventListener("DOMContentLoaded", renderCheckout);