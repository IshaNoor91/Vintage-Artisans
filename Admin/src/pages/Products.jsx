import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { StockBadge } from "../components/StatusBadge.jsx";

export default function Products() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");

  function load() {
    api
      .getProducts()
      .then((data) => setProducts(data.products))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;

    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p>{products ? `${products.length} products` : "Loading..."}</p>
        </div>

        <Link to="/products/new" className="btn btn-primary">
          + Add Product
        </Link>
      </div>

      {error && <div className="empty-state">{error}</div>}

      {!products && !error && <div className="loading-state">Loading products...</div>}

      {products && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Published</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No products yet — add your first one.
                  </td>
                </tr>
              )}

              {products.map((product) => {
                const image = product.images ? product.images.split(",")[0].trim() : "";

                return (
                  <tr key={product.id}>
                    <td>
                      {image && <img className="product-thumb" src={image} alt="" />}
                    </td>
                    <td>{product.name}</td>
                    <td>
                      {product.sale_price ? (
                        <>
                          Rs. {product.sale_price}{" "}
                          <span style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>
                            Rs. {product.regular_price}
                          </span>
                        </>
                      ) : (
                        `Rs. ${product.regular_price ?? "—"}`
                      )}
                    </td>
                    <td>
                      <StockBadge stock={product.stock} />
                    </td>
                    <td>{product.published ? "Yes" : "No"}</td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/products/${product.id}`} className="btn btn-secondary">
                          Edit
                        </Link>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDelete(product.id, product.name)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
