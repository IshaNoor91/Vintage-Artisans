console.log("CHECKOUT JS LOADED");


const CART_KEY = "vintageArtisansCart";

const API_BASE = "https://vintage-artisans-production.up.railway.app/api";

const container = document.getElementById("checkout-container");


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
        total: subtotal
    };

    submitButton.disabled = true;
    submitButton.textContent = "Placing order...";

    try {

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
        renderConfirmation(data.orderId);

    } catch (error) {

        console.error("ORDER SUBMIT ERROR:", error);

        errorBox.textContent =
            "Something went wrong placing your order. Please try again.";

        submitButton.disabled = false;
        submitButton.textContent = "Place Order — Cash on Delivery";

    }

}


// ========================================
// CONFIRMATION
// ========================================

function renderConfirmation(orderId) {

    container.innerHTML = `

        <div class="empty-cart">

            <i class="fa-solid fa-circle-check"></i>

            <h2>Order placed!</h2>

            <p>
                Thanks for your order${orderId ? ` — reference #${orderId}` : ""}.
                We'll be in touch to confirm delivery.
            </p>

            <a href="shop.html" class="btn">Continue Shopping</a>

        </div>

    `;

}


document.addEventListener("DOMContentLoaded", renderCheckout);