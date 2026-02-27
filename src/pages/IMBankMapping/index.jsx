import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { debounce } from "lodash";
import { Col, Input, Row, Select } from "antd";
import { IMButton } from "../../component/IMButton";
import { IMCard } from "../../component/IMCard";
import { IMTable } from "../../component/IMTable";
import { IMInput } from "../../component/IMInput";
import "./IMBankMapping.css";

const IMBankMapping = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [originalData, setOriginalData] = useState([]); // Store data with _id
  const [data, setData] = useState([]); // Data without _id for rendering
  const [filteredData, setFilteredData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]); // For delete functionality only
  const [searchText, setSearchText] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [selectedState, setSelectedState] = useState([]);
  const [selectedPOSName, setSelectedPOSName] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState([]);
  const [loading, setLoading] = useState(false); // Track fetch loading state
  const [isAdding, setIsAdding] = useState(false);

  const ADMIN_PASSWORD = `${import.meta.env.VITE_DB_UPDATE_PSSWRD}`;
  const isAdmin = localStorage.getItem("userRole") === "admin"; // Determine role

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUpload = () => {
    if (!isAdmin) {
      alert("You do not have permission to upload files.");
      return;
    }

    if (!file) {
      alert("Please select a file to upload.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    axios
      .post(
        `${import.meta.env.VITE_API_URL}/api/bank-mapping-upload`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      )
      .then((response) => {
        if (response.status === 200) {
          setUploading(false);
          if (
            response.data.message === "Bank mapping data uploaded successfully"
          ) {
            alert("Bank mapping data uploaded successfully!");
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

      // Get column keys from the first row, excluding '_id' and bank-related columns
      const bankColumns = [
        "BankName1",
        "BankName2",
        "BankName3",
        "BankName4",
        "BankAccountNo1",
        "BankAccountNo2",
        "BankAccountNo3",
        "BankAccountNo4",
        "RoutingNo1",
        "RoutingNo2",
        "RoutingNo3",
        "RoutingNo4",
        "BankCOA",
      ];
      const columnKeys = Object.keys(data[0]).filter(
        (key) => key !== "_id" && !bankColumns.includes(key),
      );

      const baseColumns = columnKeys.map((key) => {
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

        if (key === "Name") {
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

      // Construct the final columns array conditionally based on role
      const finalColumns = [];

      // Add Checkbox column for admins only
      if (isAdmin) {
        finalColumns.push({
          title: (
            <input
              type="checkbox"
              checked={selectedRowKeys.length === data.length}
              onChange={(e) =>
                setSelectedRowKeys(
                  e.target.checked ? data.map((record) => record._id) : [],
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
                    : selectedRowKeys.filter((id) => id !== record._id),
                )
              }
            />
          ),
        });
      }

      // Add standard columns
      finalColumns.push(...baseColumns);

      // Add Actions (Edit) column for admins only
      if (isAdmin) {
        finalColumns.push({
          title: "Actions",
          key: "actions",
          width: 150,
          render: (_, record) => (
            <IMButton
              color="blue"
              handleClick={() => {
                const originalRecord = originalData.find(
                  (item) => item._id === record._id,
                );
                if (originalRecord && originalRecord._id) {
                  setEditRow(record._id);
                  setEditForm({ ...originalRecord });
                } else {
                  alert(
                    "Invalid record selected for editing. Please ensure data contains valid IDs.",
                  );
                }
              }}
              disabled={!record._id}
            >
              Edit
            </IMButton>
          ),
        });
      }

      return finalColumns;
    };
  }, [selectedRowKeys, data, isAdmin, originalData]);

  const handleFetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bank-mapping-data`,
        {},
      );
      const fetchedData = response.data.map((item) => ({
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

  const handleApplyFilters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bank-mapping-data`,
        {
          state: selectedState,
          posName: selectedPOSName,
          brand: selectedBrand,
        },
      );
      const fetchedData = response.data.map((item) => ({
        ...item,
        _id: item._id ? item._id.toString() : null, // Ensure _id is included
      }));
      setOriginalData(fetchedData);
      setData(fetchedData); // Include _id in data
      setFilteredData(fetchedData); // Include _id in filteredData
      setSelectedRowKeys([]);
    } catch (error) {
      console.error("Error applying filters:", error.response?.data || error);
      alert("Error applying filters. Please try again.");
      setOriginalData([]);
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedState, selectedPOSName, selectedBrand]);

  const handleDownload = useCallback(() => {
    if (data.length === 0) {
      alert("No data available to download.");
      return;
    }

    // Get all unique keys from the data, excluding '_id'
    const headers = Array.from(
      new Set(
        data.flatMap((item) =>
          Object.keys(item).filter((key) => key !== "_id"),
        ),
      ),
    );

    // Create CSV content
    const rows = data.map((row) =>
      headers
        .map((key) => {
          const value = row[key] !== undefined ? row[key] : "";
          // Escape quotes and handle commas in values
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(","),
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bank_mapping_data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, [data]);

  const handleDeleteSelected = () => {
    if (!isAdmin) {
      alert("You do not have permission to delete records.");
      return;
    }

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
      .post(`${import.meta.env.VITE_API_URL}/api/bank-mapping-delete`, {
        ids: idsToDelete,
      })
      .then((response) => {
        if (response.status === 200) {
          alert(
            `Selected data deleted successfully! Deleted ${response.data.deletedCount} records.`,
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
    if (!isAdmin) {
      alert("You do not have permission to edit records.");
      return;
    }

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
      .post(`${import.meta.env.VITE_API_URL}/api/bank-mapping-update`, {
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

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    const cleanName = name.replace(/\./g, "_");
    setEditForm((prev) => ({ ...prev, [cleanName]: value }));
  };

  const handleAddNew = () => {
    if (!isAdmin) {
      alert("You do not have permission to add new records.");
      return;
    }

    const password = prompt("Enter admin password:");
    if (password !== ADMIN_PASSWORD) {
      alert("Incorrect password!");
      return;
    }

    const { _id, ...newData } = editForm; // Exclude _id from new data
    axios
      .post(`${import.meta.env.VITE_API_URL}/api/bank-mapping-add`, {
        data: newData,
      })
      .then((response) => {
        if (response.status === 200) {
          alert("New data added successfully!");
          setIsAdding(false);
          setEditForm({}); // Clear the form
          handleFetchData(); // Refresh the table
        }
      })
      .catch((error) => {
        console.error("Error adding data:", error);
        alert("Error adding data. Please try again.");
      });
  };

  const handleTableChange = useCallback(
    debounce((pagination, filters, sorter, extra) => {
      if (!filters.Name || filters.Name.length === 0) {
        setFilteredData(data);
      } else {
        setFilteredData(extra.currentDataSource);
      }
    }, 300),
    [data],
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
    <section>
      <div className="container">
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <IMCard>
              {/* Only show upload section if admin */}
              {isAdmin && (
                <div className="bm-upload-wrap">
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
                    {uploading ? "Uploading..." : "Upload Bank Mapping"}
                  </IMButton>
                </div>
              )}
              <IMButton
                color="orange"
                variant="filled"
                handleClick={handleFetchData}
                disabled={loading}
                className={isAdmin ? "mt-3" : ""}
              >
                {loading ? "Fetching..." : "Fetch Data"}
              </IMButton>
            </IMCard>
          </Col>
          <Col span={12}>
            <IMCard title="Filters">
              <Select
                mode="multiple"
                size="large"
                placeholder="Filter by State"
                value={selectedState}
                onChange={setSelectedState}
                style={{ width: "100%", marginBottom: "10px" }}
                allowClear
                options={data
                  .map((item) => item.State)
                  .filter(
                    (value) =>
                      value !== null && value !== undefined && value !== "",
                  )
                  .filter((value, index, self) => self.indexOf(value) === index)
                  .sort()
                  .map((state) => ({ label: state, value: state }))}
              />
              <Select
                mode="multiple"
                size="large"
                placeholder="Filter by Name"
                value={selectedPOSName}
                onChange={setSelectedPOSName}
                style={{ width: "100%", marginBottom: "10px" }}
                allowClear
                options={data
                  .map((item) => item.Name)
                  .filter(
                    (value) =>
                      value !== null && value !== undefined && value !== "",
                  )
                  .filter((value, index, self) => self.indexOf(value) === index)
                  .sort()
                  .map((name) => ({ label: name, value: name }))}
              />
              <Select
                mode="multiple"
                size="large"
                placeholder="Filter by Brand"
                value={selectedBrand}
                onChange={setSelectedBrand}
                style={{ width: "100%", marginBottom: "10px" }}
                allowClear
                options={data
                  .map((item) => item.Brand)
                  .filter(
                    (value) =>
                      value !== null && value !== undefined && value !== "",
                  )
                  .filter((value, index, self) => self.indexOf(value) === index)
                  .sort()
                  .map((brand) => ({ label: brand, value: brand }))}
              />
              <IMButton
                color="green"
                variant="filled"
                handleClick={handleApplyFilters}
                disabled={loading}
              >
                {loading ? "Filtering..." : "Apply Filters"}
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
            <IMCard title="Bank Mapping Data">
              {loading ? (
                <p>Loading data...</p>
              ) : columns.length > 0 && data.length > 0 ? (
                <>
                  {/* Only show delete and add buttons if admin */}
                  {isAdmin && (
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
                          setEditForm({}); // Reset form for new entry
                        }}
                        className="mb-3 ml-3"
                      >
                        Add New Object
                      </IMButton>
                    </>
                  )}

                  {/* Only show edit/add form if admin */}
                  {isAdmin && (editRow !== null || isAdding) && (
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
                    expandable={{
                      expandedRowRender: (record) => (
                        <div className="p-4 bg-gray-50 rounded-md">
                          {[
                            {
                              name: "Bank 1",
                              fields: [
                                "BankName1",
                                "BankAccountNo1",
                                "RoutingNo1",
                              ],
                            },
                            {
                              name: "Bank 2",
                              fields: [
                                "BankName2",
                                "BankAccountNo2",
                                "RoutingNo2",
                              ],
                            },
                            {
                              name: "Bank 3",
                              fields: [
                                "BankName3",
                                "BankAccountNo3",
                                "RoutingNo3",
                              ],
                            },
                            {
                              name: "Bank 4",
                              fields: [
                                "BankName4",
                                "BankAccountNo4",
                                "RoutingNo4",
                              ],
                            },
                            { name: "Bank COA", fields: ["BankCOA"] },
                          ].map(
                            (group, index) =>
                              // Only render groups with at least one non-empty field
                              group.fields.some((key) => record[key]) && (
                                <div key={index} className="mb-4 last:mb-0">
                                  <h4 className="font-semibold text-gray-700 mb-2">
                                    {group.name}
                                  </h4>
                                  <ul className="list-none space-y-1">
                                    {group.fields.map(
                                      (key) =>
                                        record[key] && (
                                          <li key={key} className="text-sm">
                                            <span className="font-medium">
                                              {key}:{" "}
                                            </span>
                                            {record[key]}
                                          </li>
                                        ),
                                    )}
                                  </ul>
                                </div>
                              ),
                          )}
                        </div>
                      ),
                      rowExpandable: (record) =>
                        [
                          "BankName1",
                          "BankName2",
                          "BankName3",
                          "BankName4",
                          "BankAccountNo1",
                          "BankAccountNo2",
                          "BankAccountNo3",
                          "BankAccountNo4",
                          "RoutingNo1",
                          "RoutingNo2",
                          "RoutingNo3",
                          "RoutingNo4",
                          "BankCOA",
                        ].some(
                          (key) =>
                            record[key] && record[key].toString().trim() !== "",
                        ),
                    }}
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

export default IMBankMapping;
