/* ============================================
   CART BADGE
   Updates the little count badge on the cart
   icon in the header. Wrapped in an IIFE so it
   is safe to include on ANY page — including
   ones that already define their own cart
   variables (product.js, cart.js) — without
   naming collisions.

   Include this on pages that DON'T already
   call updateCartCount() themselves:
   index.html, shop.html, category.html.
   (product.html already handles this via
   product.js — don't add this script there.)
============================================ */

(function () {

    const CART_STORAGE_KEY = "vintageArtisansCart";

    function readCart() {
        try {
            const cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY));
            return Array.isArray(cart) ? cart : [];
        } catch {
            return [];
        }
    }

    function updateBadge() {
        const total = readCart().reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );

        document.querySelectorAll(".fa-bag-shopping").forEach(icon => {
            const link = icon.closest("a");
            if (!link) return;

            let badge = link.querySelector(".cart-count");

            if (total > 0) {
                if (!badge) {
                    badge = document.createElement("span");
                    badge.className = "cart-count";
                    link.style.position = "relative";
                    link.appendChild(badge);
                }
                badge.textContent = total;
            } else if (badge) {
                badge.remove();
            }
        });
    }

    document.addEventListener("DOMContentLoaded", updateBadge);
})();
