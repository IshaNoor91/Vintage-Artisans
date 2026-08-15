fetch("http://localhost:3000/api/products?limit=12")
    .then(response => response.json())
    .then(data => {

        const container = document.getElementById("products-container");

        // Check if API request was successful
        if (!data.success) {
            console.error("Failed to load products");
            return;
        }

        data.products.forEach(product => {

            // Get first image from the database
            let image = "";

            if (product.images) {
                image = product.images.split(",")[0].trim();
            }

            container.innerHTML += `

                <div class="product-card">

                    <div class="product-image">

                        <img 
                            src="${image}" 
                            alt="${product.name}"
                        >

                    </div>

                    <div class="product-info">

                        <h5>${product.name}</h5>

                        <p class="price">
                            ${product.sale_price 
                                ? `Rs. ${product.sale_price}` 
                                : `Rs. ${product.regular_price}`
                            }
                        </p>

                        <a href="#" class="btn">
                            View Details
                        </a>

                    </div>

                </div>

            `;
        });

    })
    .catch(error => {
        console.error("Error loading products:", error);
    });