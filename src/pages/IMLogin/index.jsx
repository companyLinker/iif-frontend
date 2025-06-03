import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Input, Button } from "antd";
import { IMButton } from "../../component/IMButton";

const IMLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = () => {
    const adminUsername = `${import.meta.env.VITE_ADMIN_USR}`; // "s2"
    const adminPassword = `${import.meta.env.VITE_ADMIN_PSSWRD}`; // "233"
    const userUsername = `${import.meta.env.VITE_USER_USR}`; // "3333"
    const userPassword = `${import.meta.env.VITE_USER_PSSWRD}`; // "21101"

    let role = null;

    if (username === adminUsername && password === adminPassword) {
      role = "admin";
    } else if (username === userUsername && password === userPassword) {
      role = "user";
    } else {
      setError("Invalid username or password");
      return;
    }

    // Store authentication and role
    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("userRole", role);

    // Redirect to the originally requested page or home
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
        variant={"solid"}
        size={"large"}
        handleClick={handleLogin}
        style={{ width: "100%" }}
        color={"green"}
      >
        Login
      </IMButton>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default IMLogin;
