// ========================================
// PRICE FORMATTING — shared by every page that shows a price.
// The backend now resolves each product's price + currency based on
// the visitor's detected country (see backend/pricing.js): a manual
// override if the admin set one, otherwise a live currency conversion
// from the Pakistan price, otherwise plain PKR. This helper just
// displays whatever price/currency the API already sent — no
// conversion happens in the browser.
// ========================================

function formatPrice(amount, currency) {

    if (amount === null || amount === undefined || amount === "") {
        return "Price unavailable";
    }

    const number = Number(amount);
    const code = (currency || "PKR").toUpperCase();

    // Pakistan keeps the site's existing "Rs. 1234.00" look rather than
    // whatever Intl.NumberFormat would produce for PKR.
    if (code === "PKR") {
        return `Rs. ${number.toFixed(2)}`;
    }

    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: code
        }).format(number);
    } catch (error) {
        // Unknown/unsupported currency code — still show *something*
        // useful instead of breaking the page.
        return `${code} ${number.toFixed(2)}`;
    }

}
