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
    // Mock authentication (replace with real API call in production)
    const validUsername = "admin";
    const validPassword = "password123";

    if (username === validUsername && password === validPassword) {
      // Store login state (e.g., in localStorage or context)
      localStorage.setItem("isAuthenticated", "true");
      // Redirect to the originally requested page or home
      const from = location.state?.from?.pathname || "/";
      navigate(from);
    } else {
      setError("Invalid username or password");
    }
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
