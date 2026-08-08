fetch("products.json")
    .then(response => response.json())
    .then(products => {

        const container = document.getElementById("products-container");

        products.map(product => {

            container.innerHTML += `

                <div class="product-card">

                    <div class="product-image">

                        <img src="${product.image}" alt="${product.title}">

                    </div>

                    <div class="product-info">

                        <h5>${product.title}</h5>

                        <p class="price">
                            Rs. ${product.price}
                        </p>

                        <p class="rating">
                            ⭐ ${product.rating}
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