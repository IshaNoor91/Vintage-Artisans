document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("contact-form");
    const statusMsg = document.getElementById("contact-status");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector("button[type='submit']");
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";
        statusMsg.textContent = "";
        statusMsg.className = "form-status-msg";

        const payload = {
            name: form.name.value.trim(),
            email: form.email.value.trim(),
            message: form.message.value.trim()
        };

        try {
            const response = await fetch("https://vintage-artisans-production.up.railway.app/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Something went wrong");
            }

            statusMsg.textContent = "Message sent! We'll get back to you soon.";
            statusMsg.classList.add("success");
            form.reset();

        } catch (error) {
            statusMsg.textContent = "Couldn't send your message. Please try again.";
            statusMsg.classList.add("error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Send Message";
        }
    });
});
