import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { StockBadge } from "../components/StatusBadge.jsx";

export default function Products() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");

  // Countries with a manual price-override column. Loaded from the same
  // Admin -> Shipping Countries list, filtered to enabled countries only —
  // Pakistan is excluded because it's the base price already shown in the
  // Price column, not an override. Nothing here is hardcoded: enable a new
  // country in Shipping Countries and its override column appears here too.
  const [overrideCountries, setOverrideCountries] = useState([]);
  const [countriesError, setCountriesError] = useState("");

  // Draft input values, keyed `${productId}:${countryCode}`, so typing in
  // one cell doesn't touch any other row/column's state.
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState("");

  function load() {
    api
      .getProducts()
      .then((data) => setProducts(data.products))
      .catch((err) => setError(err.message));
  }

  function loadCountries() {
    api
      .getShippingCountries()
      .then((data) => {
        const enabled = (data.countries || []).filter(
          (c) => c.enabled && c.code !== "PK"
        );
        setOverrideCountries(enabled);
      })
      .catch((err) => setCountriesError(err.message));
  }

  useEffect(load, []);
  useEffect(loadCountries, []);

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;

    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  function draftKey(productId, code) {
    return `${productId}:${code}`;
  }

  // What the input should show: an in-progress edit if there is one,
  // otherwise the saved override for that product/country, otherwise blank
  // (blank = no override, price is auto-converted from the PKR base price).
  function getDraftValue(product, code) {
    const key = draftKey(product.id, code);
    if (key in drafts) return drafts[key];
    const saved = product.price_overrides && product.price_overrides[code];
    return saved && saved.regularPrice !== null && saved.regularPrice !== undefined
      ? String(saved.regularPrice)
      : "";
  }

  function handleDraftChange(productId, code, value) {
    setDrafts((prev) => ({ ...prev, [draftKey(productId, code)]: value }));
  }

  async function handleOverrideBlur(product, code) {
    const key = draftKey(product.id, code);
    const value = drafts[key];

    // Nothing typed since the last save — nothing to do.
    if (value === undefined) return;

    const trimmed = value.trim();
    const regularPrice = trimmed === "" ? null : Number(trimmed);

    if (trimmed !== "" && (Number.isNaN(regularPrice) || regularPrice < 0)) {
      alert("Price override must be a positive number (or left blank to clear it).");
      return;
    }

    setSavingKey(key);

    try {
      await api.updateProductPriceOverride(product.id, {
        countryCode: code,
        regularPrice,
        salePrice: null
      });

      // Reflect the save in the product list so re-renders (and a page
      // refresh) show the right value, then clear the draft override.
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== product.id) return p;
          const nextOverrides = { ...(p.price_overrides || {}) };
          if (regularPrice === null) {
            delete nextOverrides[code];
          } else {
            nextOverrides[code] = { regularPrice, salePrice: null };
          }
          return { ...p, price_overrides: nextOverrides };
        })
      );

      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingKey("");
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
      {countriesError && (
        <div className="empty-state">
          Couldn't load shipping countries for price overrides: {countriesError}
        </div>
      )}

      {!products && !error && <div className="loading-state">Loading products...</div>}

      {products && (
        <div className="card">
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Price</th>
                {overrideCountries.map((c) => (
                  <th key={c.code} title={`Manual price override for ${c.name}`}>
                    Price Override {c.name}
                  </th>
                ))}
                <th>Stock</th>
                <th>Published</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td
                    colSpan={6 + overrideCountries.length}
                    style={{ textAlign: "center", color: "var(--text-muted)" }}
                  >
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
                    {overrideCountries.map((c) => {
                      const key = draftKey(product.id, c.code);
                      return (
                        <td key={c.code}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="price-override-input"
                            placeholder="Auto"
                            value={getDraftValue(product, c.code)}
                            onChange={(e) =>
                              handleDraftChange(product.id, c.code, e.target.value)
                            }
                            onBlur={() => handleOverrideBlur(product, c.code)}
                            disabled={savingKey === key}
                            style={{ width: "90px" }}
                          />
                        </td>
                      );
                    })}
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
        </div>
      )}
    </div>
  );
}
