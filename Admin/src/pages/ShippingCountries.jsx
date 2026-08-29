import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";

export default function ShippingCountries() {
  const [countries, setCountries] = useState(null);
  const [enabledIds, setEnabledIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  function load() {
    api
      .getShippingCountries()
      .then((data) => {
        setCountries(data.countries);
        setEnabledIds(new Set(data.countries.filter((c) => c.enabled).map((c) => c.id)));
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
      await api.updateShippingCountries(Array.from(enabledIds));
      setSavedMessage("Saved — checkout will show these countries.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = countries
    ? countries.filter((c) =>
        c.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Shipping Countries</h1>
          <p>
            {countries
              ? `${enabledIds.size} of ${countries.length} countries enabled for checkout`
              : "Loading..."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !countries}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <p style={{ color: "var(--text-muted)", marginTop: -8, marginBottom: 20 }}>
        Only checked countries appear in the Country dropdown at checkout. An
        order from any enabled country other than Pakistan is sent to
        ShipStation automatically once it's placed.
      </p>

      {error && <div className="empty-state">{error}</div>}
      {savedMessage && (
        <div className="card" style={{ padding: "10px 16px", marginBottom: 16, color: "var(--navy)" }}>
          {savedMessage}
        </div>
      )}

      {countries && (
        <div className="card" style={{ padding: 20 }}>
          <input
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              marginBottom: 16
            }}
            placeholder="Search countries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
              maxHeight: 480,
              overflowY: "auto"
            }}
          >
            {filtered.map((country) => (
              <label
                key={country.id}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={enabledIds.has(country.id)}
                  onChange={() => toggle(country.id)}
                />
                <span>{country.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  ({country.code})
                </span>
              </label>
            ))}

            {filtered.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>No countries match "{search}".</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
