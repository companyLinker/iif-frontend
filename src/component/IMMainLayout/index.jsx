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

  return (
    <Layout>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
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
