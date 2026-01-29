import { Avatar, Dropdown, Layout, Menu, Space } from "antd";
import {
  HomeOutlined,
  LogoutOutlined,
  UploadOutlined,
  AppstoreAddOutlined,
  ShopOutlined,
  UserOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";

const { Header, Content } = Layout;

// Define menu items in an array for better readability and scalability
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
];

const IMMainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userRole");
    navigate("/login");
  };

  // Define the dropdown menu items for the user avatar
  const dropdownMenuItems = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      onClick: handleLogout,
    },
  ];

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
        {/* Left side: Logo and Navigation Menu */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* You can place a logo here */}
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
            selectedKeys={[location.pathname]} // Automatically highlights the active page
            items={navItems}
            style={{ borderBottom: "none", minWidth: "400px" }}
          />
        </div>

        {/* Right side: User Avatar with Logout Dropdown */}
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
        {/* The content of your pages will be rendered here */}
        <Outlet />
      </Content>
    </Layout>
  );
};

export default IMMainLayout;
