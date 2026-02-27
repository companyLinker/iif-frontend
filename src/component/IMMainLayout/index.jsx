import { Avatar, Dropdown, Layout, Menu, Space } from "antd";
import {
  HomeOutlined,
  LogoutOutlined,
  UploadOutlined,
  AppstoreAddOutlined,
  ShopOutlined,
  UserOutlined,
  ToolOutlined,
  FileProtectOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";

const { Header, Content } = Layout;

// Define all possible menu items
const navItems = [
  {
    key: "/",
    icon: <HomeOutlined />,
    label: <Link to="/">Home</Link>,
  },
  {
    key: "/dcr",
    icon: <UploadOutlined />,
    label: <Link to="/dcr">DCR</Link>,
  },
  {
    key: "/bank-mapping",
    icon: <AppstoreAddOutlined />,
    label: <Link to="/bank-mapping">Bank Mapping</Link>,
  },
  {
    key: "/store-names",
    icon: <ShopOutlined />,
    label: <Link to="/store-names">Store Names</Link>,
  },
  {
    key: "/excel-to-qbo",
    icon: <ToolOutlined />,
    label: <Link to="/excel-to-qbo">Excel To QBO</Link>,
  },
  {
    key: "/cheque_sheet-generator",
    icon: <FileProtectOutlined />,
    label: <Link to="/cheque_sheet-generator">Cheque Sheet Generator</Link>,
  },
];

// ... keep imports and navItems array exactly the same as before ...

const IMMainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userRole");
    navigate("/login");
  };

  const dropdownMenuItems = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      onClick: handleLogout,
    },
  ];

  const userRole = localStorage.getItem("userRole");

  // Filter the navigation items based on the user's role
  const authorizedNavItems = navItems.filter((item) => {
    // If it's the Cheque Sheet Generator, allow admin and chequesheet_user
    if (item.key === "/cheque_sheet-generator") {
      return userRole === "admin" || userRole === "chequesheet_user";
    }

    // If it's the chequesheet_user, HIDE all other tools except the Home page
    if (userRole === "chequesheet_user" && item.key !== "/") {
      return false;
    }

    return true; // Standard users and admins see the rest
  });

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              color: "#1890ff",
              fontWeight: "bold",
              fontSize: "20px",
              marginRight: "40px",
            }}
          >
            IIF Mapping Tool
          </div>
          <Menu
            theme="light"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={authorizedNavItems}
            style={{ borderBottom: "none", minWidth: "400px" }}
          />
        </div>

        <div>
          <Dropdown menu={{ items: dropdownMenuItems }} trigger={["click"]}>
            <a onClick={(e) => e.preventDefault()}>
              <Space>
                <Avatar size="large" icon={<UserOutlined />} />
              </Space>
            </a>
          </Dropdown>
        </div>
      </Header>
      <Content style={{ padding: "24px" }}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default IMMainLayout;
