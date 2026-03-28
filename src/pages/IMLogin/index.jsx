import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Input } from "antd";
import { IMButton } from "../../component/IMButton";

const IMLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = () => {
    const adminUsername = `${import.meta.env.VITE_ADMIN_USR}`;
    const adminPassword = `${import.meta.env.VITE_ADMIN_PSSWRD}`;

    // Get the common password and the list of usernames
    const commonUserPassword = `${import.meta.env.VITE_COMMON_USER_PSSWRD}`;
    const commonUsernames = `${import.meta.env.VITE_COMMON_USERNAMES}`.split(
      ",",
    );

    const chequeUsername = `${import.meta.env.VITE_USER_CHEQUESHEET_USR}`;
    const chequePassword = `${import.meta.env.VITE_USER_CHEQUESHEET_PSSWRD}`;

    let role = null;

    if (username === adminUsername && password === adminPassword) {
      role = "admin";
    }
    // Check if entered username is in the allowed list and password matches common password
    else if (
      commonUsernames.includes(username) &&
      password === commonUserPassword
    ) {
      role = "user"; // Kept as "user" so existing permissions/rights remain the same
    } else if (username === chequeUsername && password === chequePassword) {
      role = "chequesheet_user";
    } else {
      setError("Invalid username or password");
      return;
    }

    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("userRole", role);
    localStorage.setItem("loggedInUser", username);
    localStorage.setItem("lastActivity", Date.now().toString());

    const from = location.state?.from?.pathname || "/";
    navigate(from);
  };

  return (
    <div style={{ maxWidth: "400px", margin: "50px auto", padding: "20px" }}>
      <Input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{ marginBottom: "10px" }}
      />
      <Input.Password
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ marginBottom: "20px" }}
      />
      <IMButton
        variant="solid"
        size="large"
        handleClick={handleLogin}
        style={{ width: "100%" }}
        color="green"
      >
        Login
      </IMButton>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default IMLogin;
