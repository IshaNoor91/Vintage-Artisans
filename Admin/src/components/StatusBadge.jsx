import React from "react";

export function OrderStatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function StockBadge({ stock }) {
  const value = Number(stock);

  if (stock === null || stock === undefined || Number.isNaN(value)) {
    return <span className="badge badge-in-stock">—</span>;
  }

  if (value <= 0) {
    return <span className="badge badge-out-of-stock">Out of stock</span>;
  }

  if (value < 5) {
    return <span className="badge badge-low-stock">Low ({value})</span>;
  }

  return <span className="badge badge-in-stock">{value} in stock</span>;
}
