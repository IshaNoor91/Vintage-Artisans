console.log("CHECKOUT JS LOADED");


const CART_KEY = "vintageArtisansCart";

const API_BASE = "https://vintage-artisans-production.up.railway.app/api";

const container = document.getElementById("checkout-container");

// Which countries appear in the dropdown below is fully configurable from
// Admin -> Shipping Countries — never hardcoded here. Pakistan orders ship
// locally; any other enabled country gets sent to ShipStation automatically
// once the order is placed (see backend server.js).
async function loadShippingCountries() {

    try {

        const response = await fetch(`${API_BASE}/shipping-countries`);
        const data = await response.json();

        if (data.success && Array.isArray(data.countries) && data.countries.length > 0) {
            return data.countries; // [{ name, code }, ...]
        }

    } catch (error) {
        console.error("Failed to load shipping countries:", error);
    }

    // Fallback so checkout never breaks if the API/table isn't reachable —
    // Pakistan is always safe to offer since it's shipped locally.
    return [{ name: "Pakistan", code: "PK" }];

}


// ========================================
// PAYMENT METHODS
// Which methods appear at checkout (their labels, order, and whether
// they're restricted to one shipping country) is fully configurable from
// Admin -> Payment Methods — never hardcoded here. A method with a
// country_only restriction (Easypaisa / JazzCash are both Pakistan-only
// mobile wallets today) is only shown when the selected shipping country
// matches; the backend enforces the same rule again when the order is
// placed, so this is convenience for the customer, not the real security
// check.
// ========================================

async function loadPaymentMethods() {

    try {

        const response = await fetch(`${API_BASE}/payment-methods`);
        const data = await response.json();

        if (data.success && Array.isArray(data.methods) && data.methods.length > 0) {
            return data.methods; // [{ key, label, country_only }, ...]
        }

    } catch (error) {
        console.error("Failed to load payment methods:", error);
    }

    // Fallback so checkout never breaks if the API/table isn't reachable.
    return [
        { key: "cod", label: "Cash on Delivery", country_only: null },
        { key: "stripe", label: "Pay with Card (Stripe)", country_only: null },
        { key: "easypaisa", label: "Easypaisa", country_only: "Pakistan" },
        { key: "jazzcash", label: "JazzCash", country_only: "Pakistan" },
        { key: "bank_transfer", label: "Bank Transfer", country_only: null }
    ];

}

// Extra fields under a payment method's radio button (card entry, wallet
// account details + transaction ID, bank details, etc). A method with no
// case here (e.g. Cash on Delivery) just shows its radio button and
// nothing more. Adding a brand-new method later only needs a case added
// here — the radio list, show/hide logic, and validation are all driven
// off the API response already.
function paymentPanelHTML(key) {

    switch (key) {

        case "stripe":
            return `
                <div id="payment-panel-stripe" class="payment-panel" style="display:none;">

                    <label>Card Details</label>

                    <div id="stripe-card-element" class="stripe-card-element"></div>

                    <div id="stripe-card-errors" class="checkout-error"></div>

                </div>
            `;

        case "easypaisa":
            return `
                <div id="payment-panel-easypaisa" class="payment-panel" style="display:none;">

                    <div class="bank-details">

                        <p><strong>Easypaisa Account Title:</strong> [YOUR ACCOUNT TITLE]</p>
                        <p><strong>Easypaisa Number:</strong> [YOUR EASYPAISA NUMBER]</p>

                        <p class="bank-instructions">
                            Please send the total amount to the Easypaisa account above, then
                            enter your Transaction ID (TID) below. We'll confirm your order
                            once the payment is verified.
                        </p>

                    </div>

                    <div class="form-group">
                        <label for="easypaisa-transaction-ref">Easypaisa Transaction ID</label>
                        <input type="text" id="easypaisa-transaction-ref" name="easypaisaTransactionRef">
                    </div>

                </div>
            `;

        case "jazzcash":
            return `
                <div id="payment-panel-jazzcash" class="payment-panel" style="display:none;">

                    <div class="bank-details">

                        <p><strong>JazzCash Account Title:</strong> [YOUR ACCOUNT TITLE]</p>
                        <p><strong>JazzCash Number:</strong> [YOUR JAZZCASH NUMBER]</p>

                        <p class="bank-instructions">
                            Please send the total amount to the JazzCash account above, then
                            enter your Transaction ID (TID) below. We'll confirm your order
                            once the payment is verified.
                        </p>

                    </div>

                    <div class="form-group">
                        <label for="jazzcash-transaction-ref">JazzCash Transaction ID</label>
                        <input type="text" id="jazzcash-transaction-ref" name="jazzcashTransactionRef">
                    </div>

                </div>
            `;

        case "bank_transfer":
            return `
                <div id="payment-panel-bank_transfer" class="payment-panel" style="display:none;">

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
            `;

        default:
            return ""; // no extra panel needed (e.g. Cash on Delivery)

    }

}


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

function renderCheckout(countries, paymentMethods) {

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

    // All items share one currency — resolved for this visitor's country
    // when each was added to the cart.
    const cartCurrency = cart[0] && cart[0].currency ? cart[0].currency : "PKR";

    const itemsHTML = cart.map(item => {

        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);
        const lineTotal = price * quantity;

        subtotal += lineTotal;

        return `
            <div class="cart-summary-row">
                <span>${item.name} × ${quantity}</span>
                <span>${formatPrice(lineTotal, item.currency)}</span>
            </div>
        `;

    }).join("");

    // ---- Payment method radios + their panels, both built from whatever
    // Admin -> Payment Methods currently has enabled. The first method in
    // the list (sorted by sort_order on the backend) starts selected. ----

    const paymentOptionsHTML = paymentMethods.map((method, index) => `
        <label
            class="payment-option"
            id="payment-option-${method.key}"
            ${method.country_only ? `data-country-only="${method.country_only}"` : ""}
        >
            <input type="radio" name="paymentMethod" value="${method.key}"${index === 0 ? " checked" : ""}>
            <span>${method.label}</span>
        </label>
    `).join("");

    const paymentPanelsHTML = paymentMethods.map(method => paymentPanelHTML(method.key)).join("");

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
                        <label for="country">Country</label>
                        <select id="country" name="country" required>
                            ${countries.map(c => `<option value="${c.name}"${c.name === "Pakistan" ? " selected" : ""}>${c.name}</option>`).join("")}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="notes">Order Notes (optional)</label>
                        <textarea id="notes" name="notes" rows="3"></textarea>
                    </div>


                    <!-- ============ PAYMENT METHOD ============ -->

                    <div class="payment-method-group">

                        <h3>Payment Method</h3>

                        ${paymentOptionsHTML}

                    </div>

                    ${paymentPanelsHTML}


                    <div id="checkout-error" class="checkout-error"></div>

                    <button type="submit" class="checkout-btn btn" id="place-order-btn">
                        Place Order
                    </button>

                </form>

            </div>

            <div class="cart-summary">

                <h2>Order Summary</h2>

                ${itemsHTML}

                <hr>

                <div class="cart-total">
                    <span>Total</span>
                    <strong>${formatPrice(subtotal, cartCurrency)}</strong>
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

    document
        .getElementById("country")
        .addEventListener("change", updatePaymentMethodVisibility);

    updatePaymentMethodVisibility();

}


// ========================================
// COUNTRY-SPECIFIC PAYMENT METHODS
// Any method with a country_only restriction (Easypaisa, JazzCash, or any
// future one Admin adds) is only offered when the order is shipping to
// that exact country — read off each option's data-country-only attribute,
// so this works for every restricted method without hardcoding names here.
// ========================================

function updatePaymentMethodVisibility() {

    const countrySelect = document.getElementById("country");

    if (!countrySelect) return;

    const selectedCountry = countrySelect.value;

    document.querySelectorAll(".payment-option[data-country-only]").forEach(option => {

        const allowedCountry = option.dataset.countryOnly;
        const isAllowed = allowedCountry === selectedCountry;

        option.hidden = !isAllowed;

        // If a method that just became hidden was selected, fall back to
        // the first still-visible method instead of leaving a hidden
        // option checked.
        const radio = option.querySelector('input[type="radio"]');

        if (!isAllowed && radio && radio.checked) {

            radio.checked = false;

            const fallback = document.querySelector(".payment-option:not([hidden]) input[type=\"radio\"]");
            if (fallback) fallback.checked = true;

        }

    });

    updatePaymentUI();

}


// ========================================
// SHOW/HIDE PAYMENT PANELS + BUTTON LABEL
// ========================================

function getSelectedPaymentMethod() {
    const checked = document.querySelector('input[name="paymentMethod"]:checked');
    return checked ? checked.value : "cod";
}

function getPaymentMethodLabel(method) {
    const option = document.getElementById(`payment-option-${method}`);
    const span = option ? option.querySelector("span") : null;
    return span ? span.textContent : method;
}

function updatePaymentUI() {

    const method = getSelectedPaymentMethod();

    document.querySelectorAll(".payment-panel").forEach(panel => {
        panel.style.display = panel.id === `payment-panel-${method}` ? "block" : "none";
    });

    const submitButton = document.getElementById("place-order-btn");

    if (method === "stripe") {
        submitButton.textContent = "Pay & Place Order";
        initStripeElements();
    } else {
        submitButton.textContent = `Place Order — ${getPaymentMethodLabel(method)}`;
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
    const selectedOption = document.getElementById(`payment-option-${paymentMethod}`);

    // ---- Country-restricted wallets (Easypaisa, JazzCash, ...) can only
    // be used when shipping to the country they're restricted to. The
    // option should already be hidden in that case, but this covers a
    // stale form state too. ----
    if (selectedOption && selectedOption.dataset.countryOnly && form.country.value !== selectedOption.dataset.countryOnly) {
        errorBox.textContent = `${getPaymentMethodLabel(paymentMethod)} is only available for orders shipping to ${selectedOption.dataset.countryOnly}.`;
        return;
    }

    // ---- Bank transfer requires a reference number ----
    if (paymentMethod === "bank_transfer" && !form.transactionRef.value.trim()) {
        errorBox.textContent = "Please enter your transaction/reference ID.";
        return;
    }

    // ---- Easypaisa requires a transaction ID ----
    if (paymentMethod === "easypaisa" && !form.easypaisaTransactionRef.value.trim()) {
        errorBox.textContent = "Please enter your Easypaisa Transaction ID.";
        return;
    }

    // ---- JazzCash requires a transaction ID ----
    if (paymentMethod === "jazzcash" && !form.jazzcashTransactionRef.value.trim()) {
        errorBox.textContent = "Please enter your JazzCash Transaction ID.";
        return;
    }

    const cart = getCart();
    const subtotal = cart.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
        0
    );

    // All items in a cart share one currency (resolved for this visitor's
    // country when each was added) — sent along so the order confirmation
    // email shows the right currency instead of assuming PKR.
    const cartCurrency = cart[0] && cart[0].currency ? cart[0].currency : "PKR";

    const payload = {
        customer: {
            fullName: form.fullName.value.trim(),
            email: form.email.value.trim(),
            phone: form.phone.value.trim(),
            address: form.address.value.trim(),
            city: form.city.value.trim(),
            postalCode: form.postalCode.value.trim(),
            country: form.country.value,
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
        currency: cartCurrency,
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

        // ---- EASYPAISA: attach the transaction ID the customer entered ----
        } else if (paymentMethod === "easypaisa") {

            payload.paymentReference = form.easypaisaTransactionRef.value.trim();

        // ---- JAZZCASH: attach the transaction ID the customer entered ----
        } else if (paymentMethod === "jazzcash") {

            payload.paymentReference = form.jazzcashTransactionRef.value.trim();

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
    } else if (paymentMethod === "easypaisa") {
        note = "We'll verify your Easypaisa payment and confirm your order shortly.";
    } else if (paymentMethod === "jazzcash") {
        note = "We'll verify your JazzCash payment and confirm your order shortly.";
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


async function init() {
    const [countries, paymentMethods] = await Promise.all([
        loadShippingCountries(),
        loadPaymentMethods()
    ]);
    renderCheckout(countries, paymentMethods);
}

document.addEventListener("DOMContentLoaded", init);
