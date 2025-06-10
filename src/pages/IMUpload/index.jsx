import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { IMTable } from "../../component/IMTable";
import { IMDatePicker } from "../../component/IMDatePicker";
import { IMButton } from "../../component/IMButton";
import { IMCard } from "../../component/IMCard";
import * as XLSX from "xlsx";
import moment from "moment";
import { Col, Row, Select, Input, notification } from "antd";
import { evaluate } from "mathjs";

const { TextArea } = Input;

// Memoized Input with local state for responsiveness
const MemoizedInput = React.memo(({ name, initialValue, onValueChange }) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const [lastSyncedValue, setLastSyncedValue] = useState(initialValue);

  // Sync local value with initialValue when it changes
  useEffect(() => {
    setLocalValue(initialValue);
    setLastSyncedValue(initialValue);
  }, [initialValue]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onValueChange(name, newValue);
  };

  if (process.env.NODE_ENV === "development") {
    console.log(`Rendering input: ${name}, value: ${localValue}`);
  }

  return (
    <input
      type="text"
      name={name}
      value={localValue}
      onChange={handleChange}
      style={{ width: "100%" }}
      key={name}
    />
  );
});

const IMUpload = () => {
  const [notificationApi, contextHolder] = notification.useNotification();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [columnOptions, setColumnOptions] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [editColumns, setEditColumns] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [editRows, setEditRows] = useState({});
  const [editFormData, setEditFormData] = useState({}); // Nested: { rowIndex: { column: value } }
  const [calculatedColumnName, setCalculatedColumnName] = useState("");
  const [calculatedColumnsFormula, setCalculatedColumnsFormula] = useState("");
  const [calculatedSelectedColumns, setCalculatedSelectedColumns] = useState(
    []
  );
  const [replaceColumn, setReplaceColumn] = useState(null);
  const [brandOptions, setBrandOptions] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [pageSize, setPageSize] = useState(20); // New state for pageSize
  const ADMIN_PASSWORD = `${import.meta.env.VITE_DB_UPDATE_PSSWRD}`; // Replace with secure password or env variable
  const DEBUG = process.env.NODE_ENV === "development";
  const isAdmin = localStorage.getItem("userRole") === "admin";
  const allowedColumnsForNonAdmin = ["#1", "#2", "#3", "#4", "#5"];

  // Fetch brand collections on component mount
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/brands`
        );
        const brands = response.data.map((brand) => ({
          label: brand,
          value: brand,
        }));
        setBrandOptions(brands);
      } catch (error) {
        console.error("Error fetching brands:", error);
        notificationApi.error({
          message: "Error",
          description: "Failed to load brand options.",
        });
      }
    };
    fetchBrands();
  }, [notificationApi]);

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files);
    if (DEBUG) console.log("Files selected:", selectedFiles);
    setFiles(selectedFiles);
  };

  const updateEditFormData = useCallback((name, value) => {
    const { rowIndex, column } = JSON.parse(name);
    const startTime = performance.now();
    setEditFormData((prev) => {
      const newFormData = {
        ...prev,
        [rowIndex]: {
          ...(prev[rowIndex] || {}),
          [column]: value,
        },
      };
      if (DEBUG) console.log("Updated editFormData:", newFormData);
      return newFormData;
    });
    if (DEBUG)
      console.log(`updateEditFormData took ${performance.now() - startTime}ms`);
  }, []);

  const generateColumns = useCallback(
    (data, isAuthenticated, editColumns, editRows) => {
      if (!data || data.length === 0) {
        if (DEBUG) console.log("No data to generate columns from");
        return [];
      }

      if (DEBUG)
        console.log("Generating columns, isAuthenticated:", isAuthenticated);

      const keys = Object.keys(data[0]);
      const columns = keys
        .filter((key) => key !== "_id")
        .map((key) => {
          const column = {
            title: key,
            dataIndex: key,
            key,
            width: 180,
            render: (value, record, index) => {
              const originalIndex = data.findIndex(
                (item) =>
                  item.StoreName === record.StoreName &&
                  item.Date === record.Date &&
                  item._id
              );
              if (
                editColumns.includes(key) &&
                editRows[originalIndex] &&
                isAuthenticated
              ) {
                const inputName = JSON.stringify({
                  rowIndex: originalIndex,
                  column: key,
                });
                return (
                  <MemoizedInput
                    name={inputName}
                    initialValue={
                      editFormData[originalIndex]?.[key] ?? (value || "")
                    }
                    onValueChange={updateEditFormData}
                  />
                );
              }
              return value ?? "";
            },
          };

          // Set fixed: 'left' for StoreName and Date columns
          if (key === "StoreName" || key === "Date") {
            column.fixed = "left";
          }

          if (typeof data[0][key] === "number") {
            column.sorter = (a, b) => (a[key] ?? 0) - (b[key] ?? 0);
          } else if (typeof data[0][key] === "string") {
            column.sorter = (a, b) =>
              (a[key] ?? "").localeCompare(b[key] ?? "");
          } else if (typeof data[0][key] === "boolean") {
            column.sorter = (a, b) => (a[key] ?? false) - (b[key] ?? false);
          } else {
            column.sorter = (a, b) => (a[key] ?? 0) - (b[key] ?? 0);
          }

          if (key === "StoreName") {
            const uniqueStoreNames = [...new Set(data.map((item) => item[key]))]
              .filter((value) => value !== null && value !== undefined)
              .sort();
            column.filters = uniqueStoreNames.map((name) => ({
              text: name,
              value: name,
            }));
            column.onFilter = (value, record) => record[key] === value;
          }

          if (key === "Date") {
            const uniqueDates = [...new Set(data.map((item) => item[key]))]
              .filter((value) => value !== null && value !== undefined)
              .sort((a, b) =>
                moment(a, "MM-DD-YYYY").diff(moment(b, "MM-DD-YYYY"))
              );
            column.filters = uniqueDates.map((date) => ({
              text: date,
              value: date,
            }));
            column.onFilter = (value, record) => record[key] === value;
          }

          return column;
        });

      // Filter column options based on user role
      const options = keys
        .filter((key) => key !== "_id")
        .filter((key) => isAdmin || allowedColumnsForNonAdmin.includes(key))
        .map((key) => ({
          label: key,
          value: key,
        }));
      setColumnOptions(options);

      return columns;
    },
    [isAdmin]
  );

  const columns = useMemo(
    () => generateColumns(data, isAuthenticated, editColumns, editRows),
    [data, isAuthenticated, editColumns, editRows, generateColumns]
  );

  const handleUpload = async () => {
    if (!selectedBrand) {
      notificationApi.error({
        message: "Error",
        description: "Please select a brand.",
      });
      return;
    }
    if (files.length === 0) {
      notificationApi.error({
        message: "Error",
        description: "Please select at least one file to upload.",
      });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("brand", selectedBrand);

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (response.status === 200) {
        if (DEBUG) console.log("Upload successful:", response.data);
        const { insertedCount, duplicateCount, sheetCount, fileCount } =
          response.data;
        let message = `Upload completed! Total records inserted: ${insertedCount} from ${sheetCount} sheets across ${fileCount} files.`;
        if (duplicateCount > 0) {
          message += ` Skipped ${duplicateCount} duplicate records.`;
        }
        notificationApi.success({
          message: "Success",
          description: message,
        });
      } else {
        console.error("Error uploading files:", response.data);
        notificationApi.error({
          message: "Error",
          description: "Error uploading files. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      notificationApi.error({
        message: "Error",
        description: "Error uploading files. Please try again.",
      });
    }

    setUploading(false);
    setFiles([]);
    if (startDate && endDate) handleFetchData();
  };

  useEffect(() => {
    if (DEBUG) console.log("useEffect triggered, data length:", data.length);
    if (data.length > 0) {
      const dataWithId = data.map((item) => ({
        ...item,
        _id: item._id ? item._id.toString() : null,
      }));
      if (DEBUG) console.log("Data with IDs:", dataWithId.slice(0, 2));
      const dataWithoutId = dataWithId.map(({ _id, ...rest }) => rest);
      setFilteredData(dataWithoutId);
    } else {
      setColumnOptions([]);
      setSelectedColumns([]);
      setEditColumns([]);
      setCalculatedSelectedColumns([]);
      setReplaceColumn(null);
      setFilteredData([]);
      setEditRows({});
      setEditFormData({});
    }
  }, [data]);

  const handleDateChange = (dates) => {
    setStartDate(dates[0]);
    setEndDate(dates[1]);
  };

  const handleFetchData = () => {
    if (!selectedBrand) {
      notificationApi.error({
        message: "Error",
        description: "Please select a brand.",
      });
      return;
    }
    if (!startDate || !endDate) {
      notificationApi.error({
        message: "Error",
        description: "Please select a valid date range.",
      });
      return;
    }

    const formattedStartDate = startDate.format("MM-DD-YYYY");
    const formattedEndDate = endDate.format("MM-DD-YYYY");

    if (DEBUG) {
      console.log("Fetching data with start date:", formattedStartDate);
      console.log("Fetching data with end date:", formattedEndDate);
      console.log("Start date (ISO):", startDate.toISOString());
      console.log("End date (ISO):", endDate.toISOString());
    }

    axios
      .post(`${import.meta.env.VITE_API_URL}/api/data`, {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        brand: selectedBrand,
      })
      .then((response) => {
        if (DEBUG) console.log("Fetched data:", response.data);
        setData(response.data);
        setEditRows({});
        setEditFormData({});
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        notificationApi.error({
          message: "Error",
          description: "Error fetching data. Please try again.",
        });
      });
  };

  const handleColumnSelect = (selected) => {
    setSelectedColumns(selected);
    if (DEBUG) console.log("Selected columns for download:", selected);
    console.log("Selected columns for download:", selected);
  };

  const handleEditColumnSelect = (selected) => {
    setEditColumns(selected);
    if (DEBUG) console.log("Selected columns for edit:", selected);
    setIsAuthenticated(false);
    setEditRows({});
    setEditFormData({});
  };

  const handleAuthenticate = () => {
    if (editColumns.length === 0) {
      alert("Please select at least one column to edit.");
      return;
    }
    const password = prompt("Enter admin password:");
    if (DEBUG) console.log("Authentication attempt, password entered:");
    if (password === ADMIN_PASSWORD) {
      if (DEBUG) console.log("Setting isAuthenticated to true");
      setIsAuthenticated(true);
      alert("Authentication successful!");
    } else {
      if (DEBUG) console.log("Setting isAuthenticated to false");
      setIsAuthenticated(false);
      alert("Incorrect password!");
    }
  };

  const handleTableChange = (pagination, filters, sorter, extra) => {
    if (DEBUG)
      console.log(
        "Table changed, pagination:",
        pagination,
        "filters:",
        filters,
        "sorter:",
        sorter
      );
    setFilteredData(extra.currentDataSource || []);
    setPageSize(pagination.pageSize); // Update pageSize when pagination changes
    if (DEBUG)
      console.log(
        "Updated filteredData:",
        extra.currentDataSource?.slice(0, 2),
        "New pageSize:",
        pagination.pageSize
      );
  };

  const handleEdit = () => {
    if (!isAuthenticated) {
      alert("Please authenticate to edit records.");
      return;
    }
    if (data.length > 0) {
      if (DEBUG) console.log("Edit clicked, enabling edit mode for all rows");
      const newEditRows = {};
      const newFormData = {};
      data.forEach((row, idx) => {
        newEditRows[idx] = true;
        newFormData[idx] = {};
        editColumns.forEach((col) => {
          newFormData[idx][col] = row[col] ?? "";
        });
      });
      if (DEBUG) {
        console.log("Updated editRows:", newEditRows);
        console.log("Initialized editFormData:", newFormData);
      }
      setEditRows(newEditRows);
      setEditFormData(newFormData);
    } else {
      if (DEBUG) console.log("No data available for editing");
      alert("No data available to edit.");
    }
  };

  const handleSaveAll = async () => {
    if (!isAuthenticated) {
      alert("Please authenticate to edit records.");
      return;
    }

    const password = prompt("Enter admin password to save changes:");
    if (password !== ADMIN_PASSWORD) {
      alert("Incorrect password!");
      return;
    }

    const updatesToSend = [];
    Object.keys(editRows).forEach((rowIndex) => {
      if (
        editRows[rowIndex] &&
        data[rowIndex]?._id &&
        data[rowIndex]._id !== "null"
      ) {
        const updates = editFormData[rowIndex] || {};
        const originalRow = data[rowIndex];
        const changedUpdates = {};

        // Only include fields that have changed
        Object.keys(updates).forEach((key) => {
          if (updates[key] !== (originalRow[key] ?? "")) {
            changedUpdates[key] = updates[key];
          }
        });

        if (Object.keys(changedUpdates).length > 0) {
          updatesToSend.push({
            id: data[rowIndex]._id,
            updates: changedUpdates,
          });
        }
      }
    });

    if (DEBUG) console.log("Updates to send:", updatesToSend);

    if (updatesToSend.length === 0) {
      alert("No changes to save.");
      setEditRows({});
      setEditFormData({});
      return;
    }

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/data-bulk-update`,
        {
          updates: updatesToSend,
          brand: selectedBrand,
        }
      );

      if (response.status === 200) {
        alert("All changes saved successfully!");
        setEditRows({});
        setEditFormData({});
        handleFetchData();
      } else {
        alert("Some updates failed. Please try again.");
      }
    } catch (error) {
      console.error("Error updating data:", error.response?.data || error);
      let errorMessage = "Error updating data: Please try again.";
      if (error.code === "ERR_NETWORK") {
        errorMessage =
          "Network error: Check server connection or CORS configuration.";
      } else if (error.response?.status === 413) {
        errorMessage =
          "Payload too large: Try editing fewer rows or contact support.";
      }
      alert(errorMessage);
    }
  };

  const handleCancel = () => {
    if (DEBUG) console.log("Cancel clicked, exiting edit mode for all rows");
    setEditRows({});
    setEditFormData({});
  };

  const handleDownload = () => {
    if (filteredData.length === 0) {
      alert("No data available to download.");
      return;
    }

    let dataForExcel = filteredData;

    if (selectedColumns.length > 0) {
      dataForExcel = filteredData.map((item) => {
        const filteredItem = {};
        selectedColumns.forEach((col) => {
          filteredItem[col] = item[col];
        });
        return filteredItem;
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CT Data");

    const formattedStartDate = startDate
      ? startDate.format("MM-DD-YYYY")
      : "unknown";
    const formattedEndDate = endDate ? endDate.format("MM-DD-YYYY") : "unknown";
    const fileName = `CT_Data_${formattedStartDate}_to_${formattedEndDate}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  const handleCalculatedColumnNameChange = (e) => {
    setCalculatedColumnName(e.target.value);
  };

  const handleCalculatedColumnsFormulaChange = (e) => {
    setCalculatedColumnsFormula(e.target.value);
  };

  const handleCalculatedSelectedColumnsChange = (value) => {
    setCalculatedSelectedColumns(value);
    setCalculatedColumnsFormula(value.join(" + "));
  };

  const handleReplaceColumnChange = (value) => {
    setReplaceColumn(value);
  };

  const addCalculatedColumn = async () => {
    if (!selectedBrand) {
      notificationApi.error({
        message: "Error",
        description: "Please select a brand.",
      });
      return;
    }
    if (!calculatedColumnsFormula) {
      notificationApi.error({
        message: "Error",
        description: "Please provide a formula for the calculated column.",
      });
      return;
    }

    if (!replaceColumn && !calculatedColumnName) {
      notificationApi.error({
        message: "Error",
        description:
          "Please provide a name for the new column or select a column to replace.",
      });
      return;
    }

    if (replaceColumn && calculatedColumnName) {
      notificationApi.error({
        message: "Error",
        description:
          "Please provide either a new column name or select a column to replace, not both.",
      });
      return;
    }

    const columnToUpdate = replaceColumn || calculatedColumnName;
    if (
      !replaceColumn &&
      data.length > 0 &&
      Object.keys(data[0]).includes(columnToUpdate)
    ) {
      notificationApi.error({
        message: "Error",
        description:
          "Column name already exists. Please choose a unique name or select a column to replace.",
      });
      return;
    }

    const normalizedColumns = columnOptions.map((option) => ({
      value: option.value,
      lowerCase: option.value.toLowerCase(),
    }));

    // Find all exact matches of column names in the formula
    let formulaCopy = calculatedColumnsFormula;
    const formulaColumns = [];
    normalizedColumns.forEach(({ value }) => {
      const escapedCol = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(
        `(^|[\\s+\\-*/%\\(])\\s*(${escapedCol})\\s*([\\s+\\-*/%\\)]|$)`,
        "gi"
      );
      if (regex.test(formulaCopy)) {
        formulaColumns.push({ value, lowerCase: value.toLowerCase() });
        if (DEBUG) console.log(`Detected column in formula: ${value}`);
      }
    });

    if (formulaColumns.length === 0) {
      notificationApi.error({
        message: "Error",
        description: "Formula contains no valid column names.",
      });
      if (DEBUG) console.log("No valid columns found in formula:", formulaCopy);
      return;
    }

    // Validate that remaining formula contains only allowed characters
    let remainingFormula = formulaCopy;
    formulaColumns.forEach(({ value }) => {
      const escapedCol = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(
        `(^|[\\s+\\-*/%\\(])\\s*(${escapedCol})\\s*([\\s+\\-*/%\\)]|$)`,
        "gi"
      );
      remainingFormula = remainingFormula.replace(regex, "$1$3");
      if (DEBUG) console.log(`After removing ${value}: ${remainingFormula}`);
    });
    if (!remainingFormula.match(/^[\s0-9+\-*/%.()]*$/)) {
      notificationApi.error({
        message: "Error",
        description: "Formula contains invalid characters or column names.",
      });
      if (DEBUG) console.log("Invalid remaining formula:", remainingFormula);
      return;
    }

    const updates = data.map((row) => {
      try {
        let expression = calculatedColumnsFormula;
        let resultIsString = false;

        // Replace column names with their values
        formulaColumns.forEach(({ value }) => {
          let cellValue = row[value];
          if (
            cellValue === null ||
            cellValue === undefined ||
            cellValue === ""
          ) {
            cellValue = 0;
          } else if (typeof cellValue === "string") {
            const cleanedValue = cellValue.replace(/[^0-9.-]/g, "");
            const parsedValue = parseFloat(cleanedValue);
            if (isNaN(parsedValue) || !cleanedValue.match(/^-?\d*\.?\d*$/)) {
              resultIsString = true;
              cellValue = `"${cellValue}"`;
            } else {
              cellValue = parsedValue;
            }
          }

          const escapedCol = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(
            `(^|[\\s+\\-*/%\\(])\\s*(${escapedCol})\\s*([\\s+\\-*/%\\)]|$)`,
            "g"
          );
          expression = expression.replace(regex, `$1${cellValue}$3`);
          if (DEBUG)
            console.log(
              `Replaced ${value} with ${cellValue} in expression: ${expression}`
            );
        });

        let result;
        if (resultIsString) {
          result = expression.replace(/"/g, "");
          if (DEBUG) console.log(`String result for row ${row._id}: ${result}`);
        } else {
          try {
            result = evaluate(expression);
            if (isNaN(result) || !isFinite(result)) {
              throw new Error(
                `Formula evaluation resulted in invalid number: "${result}"`
              );
            }
            if (DEBUG)
              console.log(`Numeric result for row ${row._id}: ${result}`);
          } catch (error) {
            throw new Error(`Invalid formula syntax: "${expression}"`);
          }
        }

        return { _id: row._id, value: result };
      } catch (error) {
        console.warn(
          `Error calculating value for row ${row._id}: ${error.message}`
        );
        return { _id: row._id, value: 0 };
      }
    });

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/data-calculated-column`,
        {
          column: columnToUpdate,
          updates,
          isNewColumn: !replaceColumn,
          brand: selectedBrand,
        }
      );

      if (response.status === 200) {
        notificationApi.success({
          message: "Success",
          description: response.data.message,
        });
        setCalculatedColumnName("");
        setCalculatedColumnsFormula("");
        setCalculatedSelectedColumns([]);
        setReplaceColumn(null);
        handleFetchData();
      }
    } catch (error) {
      console.error(
        "Error adding calculated column:",
        error.response?.data || error
      );
      notificationApi.error({
        message: "Error",
        description:
          error.response?.data?.message ||
          "Error adding calculated column. Please try again.",
      });
    }
  };

  const isEditing = Object.keys(editRows).length > 0;

  return (
    <>
      {contextHolder}
      <section className="py-5">
        <div className="container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <IMCard>
                <Select
                  size="large"
                  placeholder="Select Brand"
                  style={{ width: "100%", marginBottom: "10px" }}
                  value={selectedBrand}
                  onChange={setSelectedBrand}
                  options={brandOptions}
                  allowClear
                />
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".xlsx,.xls"
                  multiple
                />
                <IMButton
                  color={"blue"}
                  handleClick={handleUpload}
                  disabled={uploading || !selectedBrand}
                  className={"mb-3"}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </IMButton>
                <IMDatePicker
                  value={[startDate, endDate]}
                  handleChange={handleDateChange}
                  format="MM-DD-YYYY"
                  rangePicker={true}
                  disabled={!selectedBrand}
                />
                <IMButton
                  className={"mt-3"}
                  color={"orange"}
                  variant={"filled"}
                  handleClick={handleFetchData}
                  disabled={!selectedBrand}
                >
                  Fetch Data
                </IMButton>
                <div className="mt-3">
                  <Select
                    mode="multiple"
                    size="large"
                    placeholder="Select columns to edit"
                    value={editColumns}
                    onChange={handleEditColumnSelect}
                    style={{ width: "100%", marginBottom: "10px" }}
                    options={columnOptions}
                    allowClear
                  />
                  <IMButton
                    color="blue"
                    handleClick={handleAuthenticate}
                    disabled={!editColumns.length}
                  >
                    Authenticate
                  </IMButton>
                </div>
              </IMCard>
            </Col>
            <Col span={12}>
              <IMCard title={"Filter"}>
                <Select
                  mode="tags"
                  size="large"
                  placeholder="Select columns to download"
                  value={selectedColumns}
                  onChange={handleColumnSelect}
                  style={{ width: "100%" }}
                  options={columnOptions}
                  allowClear={true}
                />
              </IMCard>
            </Col>
            {isAdmin && (
              <Col span={24}>
                <IMCard title="Create Calculated Column">
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Select
                        mode="multiple"
                        value={calculatedSelectedColumns}
                        onChange={handleCalculatedSelectedColumnsChange}
                        placeholder="Select Columns"
                        style={{ width: "100%" }}
                        options={columnOptions}
                      />
                    </Col>
                    <Col span={12}>
                      <Input
                        value={calculatedColumnName}
                        onChange={handleCalculatedColumnNameChange}
                        placeholder="Enter name for new column"
                      />
                    </Col>
                    <Col span={12}>
                      <Select
                        value={replaceColumn}
                        onChange={handleReplaceColumnChange}
                        placeholder="Select column to replace"
                        style={{ width: "100%" }}
                        options={columnOptions}
                        allowClear
                      />
                    </Col>
                    <Col span={24}>
                      <TextArea
                        value={calculatedColumnsFormula}
                        onChange={handleCalculatedColumnsFormulaChange}
                        placeholder="Formula (e.g., column1 + column2)"
                        rows={4}
                      />
                    </Col>
                    <Col span={24}>
                      <IMButton
                        handleClick={addCalculatedColumn}
                        variant="filled"
                        color="purple"
                      >
                        Add Calculated Column
                      </IMButton>
                    </Col>
                  </Row>
                </IMCard>
              </Col>
            )}
            <Col span={24}>
              <IMCard title="DCR">
                {columns.length > 0 && data.length > 0 ? (
                  <IMTable
                    columns={columns}
                    dataSource={data}
                    scroll={{ x: "100vw" }}
                    sticky={{ offsetScroll: 24 }}
                    onChange={handleTableChange}
                    rowKey={(record, index) => `${record._id}_${index}`}
                    pagination={{
                      pageSize,
                      showSizeChanger: true,
                      pageSizeOptions: ["10", "20", "50", "100"],
                    }}
                  />
                ) : (
                  <p>No data to display</p>
                )}
                <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
                  <IMButton
                    color={isEditing ? "green" : "blue"}
                    variant="filled"
                    handleClick={isEditing ? handleSaveAll : handleEdit}
                    disabled={
                      !isAuthenticated || (isEditing && !editColumns.length)
                    }
                  >
                    {isEditing ? "Save All" : "Edit"}
                  </IMButton>
                  {isEditing && (
                    <IMButton
                      color="gray"
                      variant="outlined"
                      handleClick={handleCancel}
                    >
                      Cancel
                    </IMButton>
                  )}
                  <IMButton
                    color="green"
                    variant="filled"
                    handleClick={handleDownload}
                  >
                    Download
                  </IMButton>
                </div>
              </IMCard>
            </Col>
          </Row>
        </div>
      </section>
    </>
  );
};

export default IMUpload;
