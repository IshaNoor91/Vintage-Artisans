import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const LINKS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/products", label: "Products" },
  { to: "/categories", label: "Categories" },
  { to: "/orders", label: "Orders" },
  { to: "/shipping-countries", label: "Shipping Countries" },
  { to: "/payment-methods", label: "Payment Methods" },
  { to: "/settings", label: "Settings" }
];

// Only a Super Admin sees this — a Store Admin's account can't reach
// /team anyway (see RequireSuperAdmin), so there's no point showing
// the link.
const SUPER_ADMIN_LINKS = [
  { to: "/team", label: "Team" }
];

export default function Sidebar({ isOpen, onClose }) {
  const { username, isSuperAdmin, logout } = useAuth();

  const links = isSuperAdmin ? [...LINKS, ...SUPER_ADMIN_LINKS] : LINKS;

  return (
    <aside className={"sidebar" + (isOpen ? " open" : "")}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">VA</div>
        <div className="sidebar-brand-text">
          Vintage Artisans
          <span>ADMIN</span>
        </div>
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={onClose}
          aria-label="Close menu"
        >
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onClose}
            className={({ isActive }) =>
              "sidebar-link" + (isActive ? " active" : "")
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">Signed in as {username}</div>
        <button className="logout-btn" onClick={logout}>
          Log out
        </button>
      </div>
    </aside>
  );
}
