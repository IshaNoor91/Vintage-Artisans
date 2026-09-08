import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Categories() {
  const { isSuperAdmin, storeId: myStoreId } = useAuth();

  const [stores, setStores] = useState([]);
  // The store slug categories are currently scoped to — categories are
  // always "one store's categories", so unlike Products there's no
  // meaningful "all stores" view here. A Store Admin is locked to their
  // own store; a Super Admin picks one (defaults to the first store).
  const [activeSlug, setActiveSlug] = useState("");

  const [categories, setCategories] = useState(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getStores().then((data) => {
      setStores(data.stores);
      if (!isSuperAdmin) {
        const mine = data.stores.find((s) => s.id === Number(myStoreId));
        setActiveSlug(mine ? mine.slug : "");
      } else if (data.stores.length > 0) {
        setActiveSlug(data.stores[0].slug);
      }
    }).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    if (!activeSlug) return;
    api
      .getCategories(activeSlug)
      .then((data) => setCategories(data.categories))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [activeSlug]);

  async function handleAdd(event) {
    event.preventDefault();
    if (!name.trim()) return;

    const activeStore = stores.find((s) => s.slug === activeSlug);

    try {
      await api.createCategory({
        name: name.trim(),
        storeId: isSuperAdmin ? activeStore?.id : undefined
      });
      setName("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(cat) {
    setEditingId(cat.id);
    setEditingName(cat.name);
  }

  async function saveEdit(cat) {
    try {
      await api.updateCategory(cat.id, { name: editingName, slug: cat.slug });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(cat) {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;

    try {
      await api.deleteCategory(cat.id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Categories</h1>
          <p>{categories ? `${categories.length} categories` : "Loading..."}</p>
        </div>

        {isSuperAdmin && stores.length > 0 && (
          <select
            value={activeSlug}
            onChange={(e) => setActiveSlug(e.target.value)}
            aria-label="Store"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.slug}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 10 }}>
          <input
            style={{
              flex: 1,
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6
            }}
            placeholder="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Add Category
          </button>
        </form>
      </div>

      {error && <div className="empty-state">{error}</div>}

      {categories && (
        <div className="card">
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No categories yet.
                  </td>
                </tr>
              )}

              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    {editingId === cat.id ? (
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        style={{
                          padding: "6px 10px",
                          border: "1px solid var(--border)",
                          borderRadius: 6
                        }}
                      />
                    ) : (
                      cat.name
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{cat.slug}</td>
                  <td>
                    <div className="row-actions">
                      {editingId === cat.id ? (
                        <>
                          <button className="btn btn-primary" onClick={() => saveEdit(cat)}>
                            Save
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-secondary" onClick={() => startEdit(cat)}>
                            Edit
                          </button>
                          <button className="btn btn-danger" onClick={() => handleDelete(cat)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
