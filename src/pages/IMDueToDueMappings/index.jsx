import React, { useState, useEffect } from "react";
import { Table, Button, Input, Modal, Form, message, Space, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from "@ant-design/icons";

const IMDueToDueMappings = () => {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();
  
  const [searchText, setSearchText] = useState("");

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/due-to-due-mappings`);
      if (!response.ok) throw new Error("Failed to fetch mappings");
      const data = await response.json();
      setMappings(data);
    } catch (error) {
      console.error(error);
      message.error("Error fetching mappings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingId(record._id);
    form.setFieldsValue({
      canonical: record.canonical,
      variant: record.variant,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/due-to-due-mappings/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete mapping");
      message.success("Mapping deleted successfully");
      fetchMappings();
    } catch (error) {
      console.error(error);
      message.error("Error deleting mapping");
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const loggedInUser = localStorage.getItem("loggedInUser") || "Admin";

      const payload = {
        ...values,
        addedBy: loggedInUser,
      };

      let response;
      if (editingId) {
        response = await fetch(`${import.meta.env.VITE_API_URL}/api/due-to-due-mappings/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`${import.meta.env.VITE_API_URL}/api/due-to-due-mappings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) throw new Error("Failed to save mapping");
      
      message.success(`Mapping ${editingId ? "updated" : "added"} successfully`);
      setIsModalVisible(false);
      fetchMappings();
    } catch (error) {
      console.error(error);
      if (error.name !== "ValidationError") {
        message.error("Error saving mapping");
      }
    }
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }}>
        <Input
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => confirm()}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
    onFilter: (value, record) =>
      record[dataIndex]
        ? record[dataIndex].toString().toLowerCase().includes(value.toLowerCase())
        : '',
  });

  const columns = [
    {
      title: "Canonical",
      dataIndex: "canonical",
      key: "canonical",
      sorter: (a, b) => (a.canonical || "").localeCompare(b.canonical || ""),
      ...getColumnSearchProps("canonical"),
    },
    {
      title: "Variant",
      dataIndex: "variant",
      key: "variant",
      sorter: (a, b) => (a.variant || "").localeCompare(b.variant || ""),
      ...getColumnSearchProps("variant"),
    },
    {
      title: "Added By",
      dataIndex: "addedBy",
      key: "addedBy",
      sorter: (a, b) => (a.addedBy || "").localeCompare(b.addedBy || ""),
      ...getColumnSearchProps("addedBy"),
    },
    {
      title: "Added At",
      dataIndex: "addedAt",
      key: "addedAt",
      sorter: (a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0),
      render: (text) => text ? new Date(text).toLocaleString() : "",
      ...getColumnSearchProps("addedAt"),
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space size="middle">
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} type="primary" ghost>
            Edit
          </Button>
          <Popconfirm
            title="Are you sure to delete this mapping?"
            onConfirm={() => handleDelete(record._id)}
            okText="Yes"
            cancelText="No"
          >
            <Button icon={<DeleteOutlined />} danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
        <h2>Due to Due Identical Mappings</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Create New Mapping
        </Button>
      </div>
      
      <Table 
        columns={columns} 
        dataSource={mappings} 
        rowKey="_id" 
        loading={loading}
        pagination={{ 
          defaultPageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100']
        }}
        bordered
      />

      <Modal
        title={editingId ? "Edit Mapping" : "Create New Mapping"}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="canonical"
            label="Canonical"
            rules={[{ required: true, message: "Please input the canonical name!" }]}
          >
            <Input placeholder="e.g. 103rd Street Chicken LLC" />
          </Form.Item>
          <Form.Item
            name="variant"
            label="Variant"
            rules={[{ required: true, message: "Please input the variant name!" }]}
          >
            <Input placeholder="e.g. 103rd Street Chicken" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default IMDueToDueMappings;
