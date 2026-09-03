import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Wrap this INSIDE ProtectedRoute (login is still required first). A
// logged-in Store Admin gets bounced to the dashboard instead of seeing
// the Team page — the backend blocks the API calls either way, this
// just avoids showing a page that would only error out for them.
export default function RequireSuperAdmin({ children }) {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
