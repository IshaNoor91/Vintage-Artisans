import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";

export default function PaymentMethods() {
  const [methods, setMethods] = useState(null);
  const [enabledIds, setEnabledIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  function load() {
    api
      .getPaymentMethods()
      .then((data) => {
        setMethods(data.methods);
        setEnabledIds(new Set(data.methods.filter((m) => m.enabled).map((m) => m.id)));
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function toggle(id) {
    setSavedMessage("");
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      await api.updatePaymentMethods(Array.from(enabledIds));
      setSavedMessage("Saved — checkout will only show these payment methods.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Payment Methods</h1>
          <p>
            {methods
              ? `${enabledIds.size} of ${methods.length} payment methods enabled at checkout`
              : "Loading..."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !methods}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <p style={{ color: "var(--text-muted)", marginTop: -8, marginBottom: 20 }}>
        Only checked methods appear as options at checkout. Methods marked
        "Pakistan only" are hidden automatically for any other shipping
        country, even if enabled here.
      </p>

      {error && <div className="empty-state">{error}</div>}
      {savedMessage && (
        <div className="card" style={{ padding: "10px 16px", marginBottom: 16, color: "var(--navy)" }}>
          {savedMessage}
        </div>
      )}

      {methods && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {methods.map((method) => (
              <label
                key={method.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 8px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={enabledIds.has(method.id)}
                  onChange={() => toggle(method.id)}
                />
                <span style={{ fontWeight: 500 }}>{method.label}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({method.key})</span>
                {method.country_only && (
                  <span
                    style={{
                      marginLeft: "auto",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "2px 10px"
                    }}
                  >
                    {method.country_only} only
                  </span>
                )}
              </label>
            ))}

            {methods.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>No payment methods found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
