import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  store_admin: "Store Admin"
};

function emptyForm() {
  return { username: "", password: "", role: "store_admin", storeId: "" };
}

export default function Team() {
  const { username: myUsername } = useAuth();

  const [users, setUsers] = useState(null);
  const [stores, setStores] = useState([]);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);

  function load() {
    Promise.all([api.getUsers(), api.getStores()])
      .then(([usersData, storesData]) => {
        setUsers(usersData.users);
        setStores(storesData.stores);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function startEdit(user) {
    setError("");
    setEditingId(user.id);
    setEditForm({
      username: user.username,
      password: "",
      role: user.role,
      storeId: user.store_id || ""
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError("");

    if (createForm.role === "store_admin" && !createForm.storeId) {
      setError("Please pick a store for this Store Admin.");
      return;
    }

    setCreating(true);
    try {
      await api.createUser({
        username: createForm.username.trim(),
        password: createForm.password,
        role: createForm.role,
        storeId: createForm.role === "store_admin" ? Number(createForm.storeId) : null
      });
      setCreateForm(emptyForm());
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(userId) {
    setError("");

    if (editForm.role === "store_admin" && !editForm.storeId) {
      setError("Please pick a store for this Store Admin.");
      return;
    }

    setSavingEdit(true);
    try {
      const payload = {
        role: editForm.role,
        storeId: editForm.role === "store_admin" ? Number(editForm.storeId) : null
      };
      if (editForm.password) payload.password = editForm.password;

      await api.updateUser(userId, payload);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Remove "${user.username}"'s login access? This can't be undone.`)) return;

    try {
      await api.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p>Who can log in to this admin panel, and what they can see.</p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowCreate((prev) => !prev);
            setError("");
          }}
        >
          {showCreate ? "Cancel" : "+ Add Employee"}
        </button>
      </div>

      {error && <div className="empty-state">{error}</div>}

      {showCreate && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="new-username">Username</label>
                <input
                  id="new-username"
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="new-password">Password</label>
                <input
                  id="new-password"
                  type="text"
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="new-role">Role</label>
                <select
                  id="new-role"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                >
                  <option value="store_admin">Store Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              {createForm.role === "store_admin" && (
                <div className="form-group">
                  <label htmlFor="new-store">Store</label>
                  <select
                    id="new-store"
                    value={createForm.storeId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, storeId: e.target.value }))}
                  >
                    <option value="">Select a store...</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: -8, marginBottom: 12 }}>
              A Store Admin only sees that one store's products/orders once the store-wise
              filtering is turned on. A Super Admin sees everything, for every store.
            </p>

            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creating..." : "Create Account"}
            </button>
          </form>
        </div>
      )}

      {!users && !error && <div className="loading-state">Loading team...</div>}

      {users && (
        <div className="card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Store</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                      No team accounts yet.
                    </td>
                  </tr>
                )}

                {users.map((user) => {
                  const isEditing = editingId === user.id;

                  if (isEditing) {
                    return (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td>
                          <select
                            value={editForm.role}
                            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                          >
                            <option value="store_admin">Store Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        </td>
                        <td>
                          {editForm.role === "store_admin" ? (
                            <select
                              value={editForm.storeId}
                              onChange={(e) => setEditForm((f) => ({ ...f, storeId: e.target.value }))}
                            >
                              <option value="">Select a store...</option>
                              {stores.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>All stores</span>
                          )}
                        </td>
                        <td colSpan={2}>
                          <div className="row-actions" style={{ alignItems: "center" }}>
                            <input
                              type="text"
                              placeholder="New password (optional)"
                              value={editForm.password}
                              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                              style={{ width: 170 }}
                            />
                            <button
                              className="btn btn-primary"
                              onClick={() => handleSaveEdit(user.id)}
                              disabled={savingEdit}
                            >
                              {savingEdit ? "Saving..." : "Save"}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={user.id}>
                      <td>
                        {user.username}
                        {user.username === myUsername && (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}> (you)</span>
                        )}
                      </td>
                      <td>{ROLE_LABELS[user.role] || user.role}</td>
                      <td>{user.store_name || (user.role === "super_admin" ? "All stores" : "—")}</td>
                      <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-secondary" onClick={() => startEdit(user)}>
                            Edit
                          </button>
                          {user.username !== myUsername && (
                            <button className="btn btn-danger" onClick={() => handleDelete(user)}>
                              Delete
                            </button>
                          )}
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
