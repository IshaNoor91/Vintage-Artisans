import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";

// Friendly label/description for each known flag key — anything the
// backend returns that isn't listed here still renders (using the raw
// key as its label) so a newly added flag is never invisible here.
const FLAG_INFO = {
  shipstation_enabled: {
    label: "ShipStation Integration",
    description:
      "When off, orders are still placed and saved normally, but they are " +
      "no longer sent to ShipStation automatically, and carrier lookup / " +
      "label purchasing on the Order Detail page is disabled. Turn it back " +
      "on any time — nothing is lost, and orders placed while it was off " +
      "can be sent to ShipStation manually afterwards."
  }
};

export default function Settings() {
  const [flags, setFlags] = useState(null);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState("");

  function load() {
    api
      .getFeatureFlags()
      .then((data) => setFlags(data.flags))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleToggle(flag) {
    const nextEnabled = !flag.enabled;
    setSavingKey(flag.key);

    // Optimistic update — flip it right away, roll back if the save fails.
    setFlags((prev) =>
      prev.map((f) => (f.key === flag.key ? { ...f, enabled: nextEnabled } : f))
    );

    try {
      await api.updateFeatureFlag(flag.key, nextEnabled);
    } catch (err) {
      setError(err.message);
      setFlags((prev) =>
        prev.map((f) => (f.key === flag.key ? { ...f, enabled: flag.enabled } : f))
      );
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Feature switches — toggle these without touching any code.</p>
        </div>
      </div>

      {error && <div className="empty-state">{error}</div>}

      {!flags && !error && <div className="loading-state">Loading settings...</div>}

      {flags && (
        <div className="card" style={{ padding: 20 }}>
          {flags.map((flag) => {
            const info = FLAG_INFO[flag.key] || { label: flag.key, description: "" };
            const isSaving = savingKey === flag.key;

            return (
              <div
                key={flag.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 20,
                  padding: "16px 0",
                  borderBottom: "1px solid var(--border)"
                }}
              >
                <div style={{ maxWidth: 560 }}>
                  <div style={{ fontWeight: 600 }}>{info.label}</div>
                  {info.description && (
                    <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                      {info.description}
                    </p>
                  )}
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: isSaving ? "default" : "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={flag.enabled}
                    disabled={isSaving}
                    onChange={() => handleToggle(flag)}
                  />
                  <span>{isSaving ? "Saving..." : flag.enabled ? "On" : "Off"}</span>
                </label>
              </div>
            );
          })}

          {flags.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>No feature flags found.</p>
          )}
        </div>
      )}
    </div>
  );
}
