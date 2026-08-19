import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { OrderStatusBadge } from "../components/StatusBadge.jsx";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

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
  );
}
