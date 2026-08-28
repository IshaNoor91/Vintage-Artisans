import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { OrderStatusBadge } from "../components/StatusBadge.jsx";

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  function load() {
    api
      .getOrder(id)
      .then((data) => setOrder(data.order))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

  async function handleStatusChange(newStatus) {
    setUpdating(true);
    try {
      await api.updateOrderStatus(id, newStatus);
      setOrder((prev) => ({ ...prev, status: newStatus }));
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!order) return <div className="loading-state">Loading order...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Order #{order.id}</h1>
          <p>Placed {new Date(order.created_at).toLocaleString()}</p>
        </div>
        <Link to="/orders" className="btn btn-secondary">
          ← Back to Orders
        </Link>
      </div>

      <div className="order-detail-grid">
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Items</h3>
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.product_name}</td>
                  <td>Rs. {Number(item.price).toFixed(2)}</td>
                  <td>{item.quantity}</td>
                  <td>Rs. {(Number(item.price) * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 16,
              fontSize: 16,
              fontWeight: 700,
              color: "var(--navy)"
            }}
          >
            Total: Rs. {Number(order.total).toFixed(2)}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Status</h3>

          <div style={{ marginBottom: 16 }}>
            <OrderStatusBadge status={order.status} />
          </div>

          <div className="form-field">
            <label>Update status</label>
            <select
              value={order.status}
              disabled={updating}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <h3>Customer</h3>
          <p style={{ margin: "4px 0" }}>{order.customer_name}</p>
          <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>{order.email}</p>
          <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>{order.phone}</p>

          <h3>Shipping Address</h3>
          <p style={{ margin: "4px 0" }}>{order.address}</p>
          <p style={{ margin: "4px 0" }}>
            {order.city} {order.postal_code}
          </p>

          {order.notes && (
            <>
              <h3>Notes</h3>
              <p style={{ margin: "4px 0" }}>{order.notes}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
