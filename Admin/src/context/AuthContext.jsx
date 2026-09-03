import React, { createContext, useContext, useState } from "react";
import { api } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(
    () => localStorage.getItem("adminUsername")
  );
  const [role, setRole] = useState(
    () => localStorage.getItem("adminRole")
  );
  const [storeId, setStoreId] = useState(
    () => localStorage.getItem("adminStoreId")
  );

  async function login(user, password) {
    const data = await api.login(user, password);
    localStorage.setItem("adminToken", data.token);
    localStorage.setItem("adminUsername", data.username);
    localStorage.setItem("adminRole", data.role || "");
    localStorage.setItem(
      "adminStoreId",
      data.storeId === null || data.storeId === undefined ? "" : String(data.storeId)
    );
    setUsername(data.username);
    setRole(data.role || "");
    setStoreId(data.storeId === null || data.storeId === undefined ? "" : String(data.storeId));
  }

  function logout() {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUsername");
    localStorage.removeItem("adminRole");
    localStorage.removeItem("adminStoreId");
    setUsername(null);
    setRole(null);
    setStoreId(null);
  }

  const isAuthenticated = Boolean(localStorage.getItem("adminToken"));
  const isSuperAdmin = role === "super_admin";

  return (
    <AuthContext.Provider
      value={{ username, role, storeId, isAuthenticated, isSuperAdmin, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
