import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { OrderStatusBadge } from "../components/StatusBadge.jsx";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [repair, setRepair] = useState(null);
  const [repairError, setRepairError] = useState("");

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch((err) => setError(err.message));

    // In case a repair was already running from a previous visit, pick up
    // its progress instead of showing a blank "Repair Images" button.
    api.getRepairStatus().then((data) => {
      setRepair(data);
      if (data.running) pollRepairStatus();
    }).catch(() => {});
  }, []);

  function pollRepairStatus() {
    api
      .getRepairStatus()
      .then((data) => {
        setRepair(data);
        if (data.running) {
          setTimeout(pollRepairStatus, 3000);
        }
      })
      .catch((err) => setRepairError(err.message));
  }

  async function startRepair() {
    setRepairError("");
    try {
      await api.startImageRepair();
      pollRepairStatus();
    } catch (err) {
      setRepairError(err.message);
    }
  }

  if (error) {
    return <div className="empty-state">{error}</div>;
  }

  if (!stats) {
    return <div className="loading-state">Loading dashboard...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>An overview of your store right now.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Repair Migrated Images</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}>
          One-time fix for the original WordPress product photos that got corrupted
          during the Azure migration. Safe to click more than once.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={startRepair}
          disabled={repair?.running}
        >
          {repair?.running ? "Repairing..." : "Repair Images"}
        </button>

        {repair && (
          <p style={{ fontSize: 13, marginTop: 12, color: "var(--text-muted)" }}>
            {repair.running
              ? `In progress: ${repair.done} / ${repair.total} checked (${repair.fixed} fixed, ${repair.failed} failed so far)`
              : repair.finishedAt
              ? `Last run finished: ${repair.fixed} fixed, ${repair.failed} failed out of ${repair.total}.`
              : null}
          </p>
        )}

        {repairError && <div className="error-text">{repairError}</div>}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Orders</div>
          <div className="value">{stats.totalOrders}</div>
        </div>

        <div className="stat-card">
          <div className="label">Revenue</div>
          <div className="value">Rs. {Number(stats.totalRevenue).toFixed(2)}</div>
        </div>

        <div className="stat-card">
          <div className="label">Pending Orders</div>
          <div className="value">{stats.pendingOrders}</div>
        </div>

        <div className="stat-card">
          <div className="label">Low Stock Products</div>
          <div className="value">{stats.lowStockProducts}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentOrders.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No orders yet.
                </td>
              </tr>
            )}

            {stats.recentOrders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link to={`/orders/${order.id}`}>#{order.id}</Link>
                </td>
                <td>{order.customer_name}</td>
                <td>Rs. {Number(order.total).toFixed(2)}</td>
                <td>
                  <OrderStatusBadge status={order.status} />
                </td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
