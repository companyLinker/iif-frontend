import { Layout } from "antd";
import { Header } from "antd/es/layout/layout";
import { Outlet, useNavigate } from "react-router-dom";
import { IMButton } from "../IMButton";

const IMMainLayout = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isAuthenticated");
    navigate("/login");
  };

  const handleBankMapping = () => {
    navigate("/bank-mapping");
  };

  const handleUpload = () => {
    navigate("/upload");
  };

  return (
    <Layout>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "16px", // Adds spacing between buttons
          padding: "0 24px", // Ensures consistent padding
          background: "#fff", // Matches Ant Design default header style
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
          Upload
        </IMButton>
        <IMButton
          className={"logout-btn"}
          variant={"solid"}
          color={"red"}
          size="large"
          handleClick={handleLogout}
        >
          Logout
        </IMButton>
      </Header>
      <Outlet />
    </Layout>
  );
};

export default IMMainLayout;
