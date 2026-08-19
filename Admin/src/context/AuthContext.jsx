import React, { createContext, useContext, useState } from "react";
import { api } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(
    () => localStorage.getItem("adminUsername")
  );

  async function login(user, password) {
    const data = await api.login(user, password);
    localStorage.setItem("adminToken", data.token);
    localStorage.setItem("adminUsername", data.username);
    setUsername(data.username);
  }

  function logout() {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUsername");
    setUsername(null);
  }

  const isAuthenticated = Boolean(localStorage.getItem("adminToken"));

  return (
    <AuthContext.Provider value={{ username, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
