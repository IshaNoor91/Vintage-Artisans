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
  const [sendingToShipStation, setSendingToShipStation] = useState(false);
  const [shipStationError, setShipStationError] = useState("");

  // ---- label purchase ----
  const [carriers, setCarriers] = useState(null);
  const [carriersError, setCarriersError] = useState("");
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [carrierCode, setCarrierCode] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [packageCode, setPackageCode] = useState("");
  const [weightValue, setWeightValue] = useState("1");
  const [weightUnits, setWeightUnits] = useState("pounds");
  const [testLabel, setTestLabel] = useState(true);
  const [purchasingLabel, setPurchasingLabel] = useState(false);
  const [labelError, setLabelError] = useState("");

  function load() {
    api
      .getOrder(id)
      .then((data) => setOrder(data.order))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

  // Carrier list only makes sense once the order has actually been sent
  // to ShipStation (a label is bought against a ShipStation order id).
  useEffect(() => {
    if (!order || !order.shipstation_order_id || carriers !== null) return;

    api
      .getShipStationCarriers()
      .then((data) => setCarriers(data.carriers))
      .catch((err) => setCarriersError(err.message));
  }, [order, carriers]);

  // Services/packages depend on which carrier is selected.
  useEffect(() => {
    if (!carrierCode) {
      setServices([]);
      setPackages([]);
      return;
    }

    api
      .getShipStationServices(carrierCode)
      .then((data) => setServices(data.services))
      .catch((err) => setLabelError(err.message));

    api
      .getShipStationPackages(carrierCode)
      .then((data) => setPackages(data.packages))
      .catch((err) => setLabelError(err.message));
  }, [carrierCode]);

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

  async function handleSendToShipStation() {
    setSendingToShipStation(true);
    setShipStationError("");
    try {
      const result = await api.sendOrderToShipStation(id);
      setOrder((prev) => ({
        ...prev,
        shipstation_order_id: result.shipstation_order_id,
        shipstation_synced_at: result.shipstation_synced_at,
        shipstation_sync_error: result.shipstation_sync_error
      }));
      if (result.shipstation_sync_error) {
        setShipStationError(result.shipstation_sync_error);
      }
    } catch (err) {
      setShipStationError(err.message);
    } finally {
      setSendingToShipStation(false);
    }
  }

  async function handlePurchaseLabel() {
    if (!carrierCode || !serviceCode) {
      setLabelError("Choose a carrier and a service first.");
      return;
    }

    setPurchasingLabel(true);
    setLabelError("");

    try {
      const result = await api.purchaseShippingLabel(id, {
        carrierCode,
        serviceCode,
        packageCode: packageCode || undefined,
        weightValue,
        weightUnits,
        testLabel
      });

      setOrder((prev) => ({
        ...prev,
        tracking_number: result.trackingNumber,
        label_url: result.labelUrl,
        shipping_cost: result.shippingCost,
        carrier_code: carrierCode,
        service_code: serviceCode
      }));
    } catch (err) {
      setLabelError(err.message);
    } finally {
      setPurchasingLabel(false);
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
          <p style={{ margin: "4px 0" }}>{order.country || "Pakistan"}</p>

          {order.country && order.country.toLowerCase() !== "pakistan" && (
            <>
              <h3>ShipStation</h3>

              {order.shipstation_synced_at ? (
                <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>
                  Sent {new Date(order.shipstation_synced_at).toLocaleString()}
                  {order.shipstation_order_id && ` (ShipStation order #${order.shipstation_order_id})`}
                </p>
              ) : (
                <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>
                  {order.shipstation_sync_error || "Not sent yet."}
                </p>
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSendToShipStation}
                disabled={sendingToShipStation}
                style={{ marginTop: 6 }}
              >
                {sendingToShipStation
                  ? "Sending..."
                  : order.shipstation_synced_at
                  ? "Resend to ShipStation"
                  : "Send to ShipStation"}
              </button>

              {shipStationError && <div className="error-text">{shipStationError}</div>}

              {order.shipstation_order_id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <h3>Shipping Label</h3>

                  {order.tracking_number ? (
                    <>
                      <p style={{ margin: "4px 0" }}>
                        Tracking #: <strong>{order.tracking_number}</strong>
                      </p>
                      {order.shipping_cost != null && (
                        <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>
                          Cost: Rs. {Number(order.shipping_cost).toFixed(2)}
                        </p>
                      )}
                      {order.label_url && (
                        <a
                          href={order.label_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ marginTop: 6, display: "inline-block" }}
                        >
                          View / Print Label
                        </a>
                      )}
                      <p style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 13 }}>
                        Need a different carrier or service? Buying another label below replaces this one.
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>
                      No label purchased yet.
                    </p>
                  )}

                  {carriersError && <div className="error-text">{carriersError}</div>}

                  {carriers && carriers.length === 0 && (
                    <p style={{ color: "var(--text-muted)" }}>
                      No carriers are connected in ShipStation yet — connect one from ShipStation's own
                      Settings → Shipping → Carriers page first.
                    </p>
                  )}

                  {carriers && carriers.length > 0 && (
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      <div className="form-field">
                        <label>Carrier</label>
                        <select
                          value={carrierCode}
                          onChange={(e) => {
                            setCarrierCode(e.target.value);
                            setServiceCode("");
                            setPackageCode("");
                          }}
                        >
                          <option value="">Choose a carrier...</option>
                          {carriers.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {carrierCode && (
                        <div className="form-field">
                          <label>Service</label>
                          <select value={serviceCode} onChange={(e) => setServiceCode(e.target.value)}>
                            <option value="">Choose a service...</option>
                            {services.map((s) => (
                              <option key={s.code} value={s.code}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {carrierCode && packages.length > 0 && (
                        <div className="form-field">
                          <label>Package (optional)</label>
                          <select value={packageCode} onChange={(e) => setPackageCode(e.target.value)}>
                            <option value="">No specific package</option>
                            {packages.map((p) => (
                              <option key={p.code} value={p.code}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {carrierCode && (
                        <div className="form-row" style={{ display: "flex", gap: 10 }}>
                          <div className="form-field" style={{ flex: 1 }}>
                            <label>Weight</label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={weightValue}
                              onChange={(e) => setWeightValue(e.target.value)}
                            />
                          </div>
                          <div className="form-field" style={{ flex: 1 }}>
                            <label>Units</label>
                            <select value={weightUnits} onChange={(e) => setWeightUnits(e.target.value)}>
                              <option value="pounds">pounds</option>
                              <option value="ounces">ounces</option>
                              <option value="grams">grams</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {carrierCode && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={testLabel}
                            onChange={(e) => setTestLabel(e.target.checked)}
                          />
                          <span>
                            Test label (doesn't actually charge or ship — good for trying this out first)
                          </span>
                        </label>
                      )}

                      {carrierCode && serviceCode && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handlePurchaseLabel}
                          disabled={purchasingLabel}
                          style={{ justifySelf: "start" }}
                        >
                          {purchasingLabel ? "Purchasing..." : "Purchase Label"}
                        </button>
                      )}

                      {labelError && <div className="error-text">{labelError}</div>}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

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
