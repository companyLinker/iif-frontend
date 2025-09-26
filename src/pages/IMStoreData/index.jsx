import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { debounce } from "lodash";
import { Col, Input, Row } from "antd";
import { IMButton } from "../../component/IMButton";
import { IMCard } from "../../component/IMCard";
import { IMTable } from "../../component/IMTable";
import { IMInput } from "../../component/IMInput";
import "./IMStoreData.css";

const IMStoreData = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [originalData, setOriginalData] = useState([]);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  const ADMIN_PASSWORD = `${import.meta.env.VITE_DB_UPDATE_PSSWRD}`;

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUpload = () => {
    if (!file) {
      alert("Please select a file to upload.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    axios
      .post(`${import.meta.env.VITE_API_URL}/api/store-data-upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((response) => {
        if (response.status === 200) {
          setUploading(false);
          if (response.data.message === "Store data uploaded successfully") {
            alert("Store data uploaded successfully!");
            handleFetchData();
          }
        } else {
          console.error("Error uploading file:", response.data);
          setUploading(false);
          alert("Error uploading file. Please try again.");
        }
      })
      .catch((error) => {
        console.error("Error uploading file:", error);
        setUploading(false);
        alert("Error uploading file. Please try again.");
      });
  };

  const generateColumns = useMemo(() => {
    return (data) => {
      if (!data || data.length === 0) {
        return [];
      }

      const allKeys = Array.from(
        new Set(
          data.flatMap((item) =>
            Object.keys(item).filter((key) => key !== "_id")
          )
        )
      );

      const baseColumns = allKeys.map((key) => {
        const column = {
          title: key,
          dataIndex: key,
          key,
          width: 200,
          sorter: (a, b) =>
            typeof a[key] === "string"
              ? a[key]?.localeCompare(b[key] || "")
              : (a[key] || 0) - (b[key] || 0),
        };

        if (key === "NAME") {
          column.filterDropdown = ({
            setSelectedKeys,
            selectedKeys,
            confirm,
          }) => (
            <div style={{ padding: 8 }}>
              <Input
                placeholder="Search name"
                value={selectedKeys[0]}
                onChange={(e) =>
                  setSelectedKeys(e.target.value ? [e.target.value] : [])
                }
                onPressEnter={() => confirm()}
                style={{ width: 188, marginBottom: 8, display: "block" }}
              />
              <IMButton
                handleClick={() => confirm()}
                size="small"
                style={{ width: 90, marginRight: 8 }}
              >
                Search
              </IMButton>
              <IMButton
                handleClick={() => {
                  setSelectedKeys([]);
                  confirm();
                  setFilteredData(data);
                }}
                size="small"
                style={{ width: 90 }}
              >
                Reset
              </IMButton>
            </div>
          );
          column.onFilter = (value, record) =>
            record[key]?.toString().toLowerCase().includes(value.toLowerCase());
        }

        return column;
      });

      return [
        {
          title: (
            <input
              type="checkbox"
              checked={selectedRowKeys.length === data.length}
              onChange={(e) =>
                setSelectedRowKeys(
                  e.target.checked ? data.map((record) => record._id) : []
                )
              }
            />
          ),
          key: "select",
          width: 50,
          render: (_, record) => (
            <input
              type="checkbox"
              checked={selectedRowKeys.includes(record._id)}
              onChange={(e) =>
                setSelectedRowKeys(
                  e.target.checked
                    ? [...selectedRowKeys, record._id]
                    : selectedRowKeys.filter((id) => id !== record._id)
                )
              }
            />
          ),
        },
        ...baseColumns,
        {
          title: "Actions",
          key: "actions",
          width: 150,
          render: (_, record) => (
            <IMButton
              color="blue"
              handleClick={() => {
                const originalRecord = originalData.find(
                  (item) => item._id === record._id
                );
                if (originalRecord && originalRecord._id) {
                  setEditRow(record._id);
                  setEditForm({ ...originalRecord });
                } else {
                  alert(
                    "Invalid record selected for editing. Please ensure data contains valid IDs."
                  );
                }
              }}
              disabled={!record._id}
            >
              Edit
            </IMButton>
          ),
        },
      ];
    };
  }, [selectedRowKeys, data]);

  const handleFetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/store-data`,
        {}
      );
      const fetchedData = response.data.storeData.map((item) => ({
        ...item,
        _id: item._id ? item._id.toString() : null,
      }));
      setOriginalData(fetchedData);
      setData(fetchedData);
      setFilteredData(fetchedData);
    } catch (error) {
      console.error("Error fetching data:", error.response?.data || error);
      alert("Error fetching data. Please try again.");
      setOriginalData([]);
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (data.length === 0) {
      alert("No data available to download.");
      return;
    }

    const headers = Array.from(
      new Set(
        data.flatMap((item) => Object.keys(item).filter((key) => key !== "_id"))
      )
    );

    const rows = data.map((row) =>
      headers
        .map((key) => {
          const value = row[key] !== undefined ? row[key] : "";
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "store_data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, [data]);

  const handleDeleteSelected = () => {
    const password = prompt("Enter admin password:");
    if (password !== ADMIN_PASSWORD) {
      alert("Incorrect password!");
      return;
    }

    if (selectedRowKeys.length === 0) {
      alert("No rows selected for deletion.");
      return;
    }

    const idsToDelete = selectedRowKeys.filter((id) => id && id !== "null");

    if (idsToDelete.length === 0) {
      alert("No valid IDs found for deletion. Ensure data contains valid IDs.");
      return;
    }

    axios
      .post(`${import.meta.env.VITE_API_URL}/api/store-data-delete`, {
        ids: idsToDelete,
      })
      .then((response) => {
        if (response.status === 200) {
          alert(
            `Selected data deleted successfully! Deleted ${response.data.deletedCount} records.`
          );
          setSelectedRowKeys([]);
          handleFetchData();
        }
      })
      .catch((error) => {
        console.error("Error deleting data:", error);
        alert("Error deleting data. Please try again.");
      });
  };

  const handleSaveEdit = () => {
    const password = prompt("Enter admin password:");
    if (password !== ADMIN_PASSWORD) {
      alert("Incorrect password!");
      return;
    }

    if (!editRow || editRow === "null") {
      alert("Invalid edit operation. No valid ID found.");
      return;
    }

    const idToUpdate = editRow;
    const { _id, ...updates } = editForm;

    axios
      .post(`${import.meta.env.VITE_API_URL}/api/store-data-update`, {
        id: idToUpdate,
        updates: updates,
      })
      .then((response) => {
        if (response.status === 200) {
          alert("Data updated successfully!");
          setEditRow(null);
          setEditForm({});
          handleFetchData();
        }
      })
      .catch((error) => {
        console.error("Error updating data:", error);
        alert("Error updating data. Please try again.");
      });
  };

  const handleAddNew = () => {
    const password = prompt("Enter admin password:");
    if (password !== ADMIN_PASSWORD) {
      alert("Incorrect password!");
      return;
    }

    const { _id, ...newData } = editForm;
    axios
      .post(`${import.meta.env.VITE_API_URL}/api/store-data-add`, {
        data: newData,
      })
      .then((response) => {
        if (response.status === 200) {
          alert("New data added successfully!");
          setIsAdding(false);
          setEditForm({});
          handleFetchData();
        }
      })
      .catch((error) => {
        console.error("Error adding data:", error);
        alert("Error adding data. Please try again.");
      });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    const cleanName = name.replace(/\./g, "_");
    setEditForm((prev) => ({ ...prev, [cleanName]: value }));
  };

  const handleTableChange = useCallback(
    debounce((pagination, filters, sorter, extra) => {
      if (!filters.NAME || filters.NAME.length === 0) {
        setFilteredData(data);
      } else {
        setFilteredData(extra.currentDataSource);
      }
    }, 300),
    [data]
  );

  useEffect(() => {
    handleFetchData();
  }, [handleFetchData]);

  useEffect(() => {
    if (data.length > 0) {
      setColumns(generateColumns(data));
      setFilteredData(data);
    } else {
      setColumns([]);
      setFilteredData([]);
    }
  }, [data, generateColumns]);

  return (
    <section className="py-5">
      <div className="container">
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <IMCard>
              <div className="store-data-upload-wrap">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".csv,.xlsx,.xls"
                />
                <IMButton
                  color="blue"
                  handleClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Upload Store Data"}
                </IMButton>
              </div>
              <IMButton
                color="orange"
                variant="filled"
                handleClick={handleFetchData}
                disabled={loading}
              >
                {loading ? "Fetching..." : "Fetch Data"}
              </IMButton>
              <IMButton
                color="green"
                variant="solid"
                handleClick={handleDownload}
                className="mt-3 ml-3"
              >
                Download
              </IMButton>
            </IMCard>
          </Col>
          <Col span={24}>
            <IMCard title="Store Data">
              {loading ? (
                <p>Loading data...</p>
              ) : columns.length > 0 && data.length > 0 ? (
                <>
                  <IMButton
                    color="red"
                    variant="filled"
                    handleClick={handleDeleteSelected}
                    className="mb-3"
                    disabled={selectedRowKeys.length === 0}
                  >
                    Delete Selected
                  </IMButton>
                  <IMButton
                    color="green"
                    variant="filled"
                    handleClick={() => {
                      setIsAdding(true);
                      setEditForm({});
                    }}
                    className="mb-3 ml-3"
                  >
                    Add New Object
                  </IMButton>
                  {(editRow !== null || isAdding) && (
                    <div className="edit-form mb-3">
                      {Object.keys(data[0] || {})
                        .filter((key) => key !== "_id")
                        .map((key) => (
                          <div key={key} className="mb-3">
                            <label>{key}:</label>
                            <IMInput
                              type="text"
                              name={key}
                              value={editForm[key] || ""}
                              handleChange={handleEditChange}
                            />
                          </div>
                        ))}
                      {isAdding ? (
                        <>
                          <IMButton
                            color="blue"
                            variant="filled"
                            handleClick={handleAddNew}
                            className="mt-2"
                          >
                            Submit
                          </IMButton>
                          <IMButton
                            color="gray"
                            variant="outlined"
                            handleClick={() => {
                              setIsAdding(false);
                              setEditForm({});
                            }}
                            className="mt-2 ml-2"
                          >
                            Cancel
                          </IMButton>
                        </>
                      ) : (
                        <>
                          <IMButton
                            color="blue"
                            variant="filled"
                            handleClick={handleSaveEdit}
                            className="mt-2"
                          >
                            Save
                          </IMButton>
                          <IMButton
                            color="gray"
                            variant="outlined"
                            handleClick={() => setEditRow(null)}
                            className="mt-2 ml-2"
                          >
                            Cancel
                          </IMButton>
                        </>
                      )}
                    </div>
                  )}
                  <IMTable
                    columns={columns}
                    dataSource={filteredData}
                    scroll={{ x: "100vw" }}
                    sticky={{ offsetScroll: 24 }}
                    onChange={handleTableChange}
                    rowKey={(record) => record._id}
                  />
                </>
              ) : (
                <p>No data to display. Please fetch data.</p>
              )}
            </IMCard>
          </Col>
        </Row>
      </div>
    </section>
  );
};

export default IMStoreData;
