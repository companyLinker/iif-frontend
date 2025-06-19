import React from "react";
import { Navigate } from "react-router-dom";
import useInactivityLogout from "../useInactivityLogout/useInactivityLogout";

const IMProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  useInactivityLogout(5 * 60 * 1000);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default IMProtectedRoute;
