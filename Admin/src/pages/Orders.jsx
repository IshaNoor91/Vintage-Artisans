import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { OrderStatusBadge } from "../components/StatusBadge.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Orders() {
  const { isSuperAdmin } = useAuth();

  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.getStores().then((data) => setStores(data.stores)).catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => {
    api
      .getOrders(storeFilter)
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err.message));
  }, [storeFilter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p>{orders ? `${orders.length} orders` : "Loading..."}</p>
        </div>

        {isSuperAdmin && stores.length > 0 && (
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label="Filter by store"
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.slug}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="empty-state">{error}</div>}

      {orders && (
        <div className="card">
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                {isSuperAdmin && <th>Store</th>}
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7 + (isSuperAdmin ? 1 : 0)} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No orders yet.
                  </td>
                </tr>
              )}

              {orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>
                    {order.customer_name}
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{order.phone}</div>
                  </td>
                  {isSuperAdmin && (
                    <td>{stores.find((s) => s.id === order.store_id)?.name || "—"}</td>
                  )}
                  <td>{order.item_count}</td>
                  <td>Rs. {Number(order.total).toFixed(2)}</td>
                  <td>
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td>{new Date(order.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/orders/${order.id}`} className="btn btn-secondary">
                      View
                    </Link>
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
