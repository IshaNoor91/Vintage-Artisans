import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";

const EMPTY_FORM = {
  name: "",
  sku: "",
  productType: "simple",
  shortDescription: "",
  description: "",
  regularPrice: "",
  salePrice: "",
  stock: "",
  inStock: true,
  images: "",
  tags: "",
  published: true,
  featured: false,
  categoryIds: []
};

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCategories().then((data) => setCategories(data.categories));
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    api
      .getProduct(id)
      .then((data) => {
        const p = data.product;
        setForm({
          name: p.name || "",
          sku: p.sku || "",
          productType: p.product_type || "simple",
          shortDescription: p.short_description || "",
          description: p.description || "",
          regularPrice: p.regular_price ?? "",
          salePrice: p.sale_price ?? "",
          stock: p.stock ?? "",
          inStock: p.in_stock ?? true,
          images: p.images || "",
          tags: p.tags || "",
          published: p.published ?? true,
          featured: p.featured ?? false,
          categoryIds: p.categoryIds || []
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleCategory(categoryId) {
    setForm((prev) => {
      const exists = prev.categoryIds.includes(categoryId);
      return {
        ...prev,
        categoryIds: exists
          ? prev.categoryIds.filter((id) => id !== categoryId)
          : [...prev.categoryIds, categoryId]
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      ...form,
      regularPrice: form.regularPrice === "" ? null : Number(form.regularPrice),
      salePrice: form.salePrice === "" ? null : Number(form.salePrice),
      stock: form.stock === "" ? null : Number(form.stock)
    };

    try {
      if (isEdit) {
        await api.updateProduct(id, payload);
      } else {
        await api.createProduct(payload);
      }
      navigate("/products");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="loading-state">Loading product...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{isEdit ? "Edit Product" : "Add Product"}</h1>
          <p>{isEdit ? `Editing product #${id}` : "Create a new product listing"}</p>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>SKU</label>
              <input value={form.sku} onChange={(e) => updateField("sku", e.target.value)} />
            </div>

            <div className="form-field">
              <label>Product Type</label>
              <select
                value={form.productType}
                onChange={(e) => updateField("productType", e.target.value)}
              >
                <option value="simple">Simple</option>
                <option value="variable">Variable</option>
              </select>
            </div>

            <div className="form-field">
              <label>Regular Price</label>
              <input
                type="number"
                step="0.01"
                value={form.regularPrice}
                onChange={(e) => updateField("regularPrice", e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Sale Price</label>
              <input
                type="number"
                step="0.01"
                value={form.salePrice}
                onChange={(e) => updateField("salePrice", e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Stock</label>
              <input
                type="number"
                value={form.stock}
                onChange={(e) => updateField("stock", e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Tags (comma separated)</label>
              <input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} />
            </div>

            <div className="form-field full">
              <label>Images (comma-separated URLs — first one is the main image)</label>
              <input
                value={form.images}
                onChange={(e) => updateField("images", e.target.value)}
              />
            </div>

            <div className="form-field full">
              <label>Short Description</label>
              <textarea
                rows={2}
                value={form.shortDescription}
                onChange={(e) => updateField("shortDescription", e.target.value)}
              />
            </div>

            <div className="form-field full">
              <label>Full Description</label>
              <textarea
                rows={5}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </div>

            <div className="form-field full">
              <label>Categories</label>
              <div className="checkbox-group">
                {categories.length === 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    No categories yet.
                  </span>
                )}

                {categories.map((cat) => (
                  <label key={cat.id}>
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.inStock}
                  onChange={(e) => updateField("inStock", e.target.checked)}
                />
                In stock
              </label>
            </div>

            <div className="form-field">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => updateField("published", e.target.checked)}
                />
                Published (visible on the site)
              </label>
            </div>

            <div className="form-field">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => updateField("featured", e.target.checked)}
                />
                Featured
              </label>
            </div>
          </div>

          {error && <div className="error-text">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Product"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate("/products")}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
