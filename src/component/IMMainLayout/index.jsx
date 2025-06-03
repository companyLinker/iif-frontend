import { Layout } from "antd";
import { Header } from "antd/es/layout/layout";
import { Outlet, useNavigate } from "react-router-dom";
import { IMButton } from "../IMButton";

const IMMainLayout = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userRole");
    navigate("/login");
  };

  const handleBankMapping = () => {
    navigate("/bank-mapping");
  };

  const handleUpload = () => {
    navigate("/dcr");
  };

  const handleHome = () => {
    navigate("/");
  };

  return (
    <Layout>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          padding: "0 24px",
          background: "#fff",
        }}
      >
        <div>
          <IMButton
            variant={"solid"}
            color={"default"}
            size="large"
            handleClick={handleHome}
          >
            Home
          </IMButton>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "16px",
            padding: "0 24px",
            background: "#fff",
          }}
        >
          <IMButton
            className={"bank-mapping-btn"}
            variant={"solid"}
            color={"blue"}
            size="large"
            handleClick={handleBankMapping}
          >
            Bank Mapping
          </IMButton>
          <IMButton
            className={"upload-btn"}
            variant={"solid"}
            color={"green"}
            size="large"
            handleClick={handleUpload}
          >
            DCR
          </IMButton>
          <IMButton
            className={"logout-btn ms-5"}
            variant={"solid"}
            color={"red"}
            size="large"
            handleClick={handleLogout}
          >
            Logout
          </IMButton>
        </div>
      </Header>
      <Outlet />
    </Layout>
  );
};

export default IMMainLayout;
