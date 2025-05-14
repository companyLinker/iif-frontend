import React, { useState, useEffect } from "react";
import axios from "axios";
import { IMTable } from "../../component/IMTable";
import { IMDatePicker } from "../../component/IMDatePicker";
import { IMButton } from "../../component/IMButton";
import { IMCard } from "../../component/IMCard";
import * as XLSX from "xlsx";
import moment from "moment";
import { Col, Row, Select } from "antd";

const IMUpload = () => {
  const [files, setFiles] = useState([]); // Changed to store an array of files
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [columns, setColumns] = useState([]);
  const [columnOptions, setColumnOptions] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files); // Convert FileList to array
    console.log("Files selected:", selectedFiles);
    setFiles(selectedFiles); // Store array of files
  };

  const generateColumns = (data) => {
    if (!data || data.length === 0) {
      console.log("No data to generate columns from");
      return [];
    }

    const keys = Object.keys(data[0]);
    const columns = keys
      .filter((key) => key !== "_id")
      .map((key) => {
        const column = {
          title: key,
          dataIndex: key,
          key,
          width: 200,
        };

        if (typeof data[0][key] === "number") {
          column.sorter = (a, b) => a[key] - b[key];
        } else if (typeof data[0][key] === "string") {
          column.sorter = (a, b) => a[key].localeCompare(b[key]);
        } else if (typeof data[0][key] === "boolean") {
          column.sorter = (a, b) => a[key] - b[key];
        } else {
          column.sorter = (a, b) => a[key] - b[key];
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

    const options = keys
      .filter((key) => key !== "_id")
      .map((key) => ({
        label: key,
        value: key,
      }));
    setColumnOptions(options);

    return columns;
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      alert("Please select at least one file to upload.");
      return;
    }

    setUploading(true);
    let totalInserted = 0;
    let totalSheets = 0;

    // Process each file sequentially
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

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
          console.log(
            `Upload successful for file ${file.name}:`,
            response.data
          );
          totalInserted += response.data.insertedCount || 0;
          totalSheets += response.data.sheetCount || 1; // Use sheetCount from backend
        } else {
          console.error(`Error uploading file ${file.name}:`, response.data);
          alert(`Error uploading file ${file.name}. Please try again.`);
        }
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error);
        alert(`Error uploading file ${file.name}. Please try again.`);
      }
    }

    setUploading(false);
    alert(
      `Upload completed! Total records inserted: ${totalInserted} from ${totalSheets} sheets across ${files.length} files.`
    );
    setFiles([]); // Clear files after upload
    if (startDate && endDate) handleFetchData(); // Optionally refetch data
  };

  useEffect(() => {
    if (data.length > 0) {
      const dataWithoutId = data.map((item) => {
        const { _id, ...rest } = item;
        return rest;
      });
      const generatedColumns = generateColumns(dataWithoutId);
      console.log("Generated columns:", generatedColumns);
      setColumns(generatedColumns);
      setFilteredData(dataWithoutId);
    } else {
      setColumnOptions([]);
      setSelectedColumns([]);
      setFilteredData([]);
    }
  }, [data]);

  const handleDateChange = (dates) => {
    setStartDate(dates[0]);
    setEndDate(dates[1]);
  };

  const handleFetchData = () => {
    if (!startDate || !endDate) {
      alert("Please select a valid date range.");
      return;
    }

    const formattedStartDate = startDate.format("MM-DD-YYYY");
    const formattedEndDate = endDate.format("MM-DD-YYYY");

    console.log("Fetching data with start date:", formattedStartDate);
    console.log("Fetching data with end date:", formattedEndDate);

    axios
      .post(`${import.meta.env.VITE_API_URL}/api/data`, {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      })
      .then((response) => {
        console.log("Fetched data:", response.data);
        setData(response.data);
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        alert("Error fetching data. Please try again.");
      });
  };

  const handleColumnSelect = (selected) => {
    setSelectedColumns(selected);
    console.log("Selected columns:", selected);
  };

  const handleTableChange = (pagination, filters, sorter, extra) => {
    setFilteredData(extra.currentDataSource);
    console.log("Filtered data:", extra.currentDataSource);
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

  return (
    <section className="py-5">
      <div className="container">
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <IMCard>
              <input
                type="file"
                variant={"filled"}
                onChange={handleFileChange}
                accept=".csv,.xlsx,.xls"
                multiple // Allow multiple file selection
              />
              <IMButton
                color={"blue"}
                handleClick={handleUpload}
                disabled={uploading}
                className={"mb-3"}
              >
                {uploading ? "Uploading..." : "Upload"}
              </IMButton>
              <IMDatePicker
                value={[startDate, endDate]}
                handleChange={handleDateChange}
                format="MM-DD-YYYY"
                rangePicker={true}
              />
              <IMButton
                className={"mt-3"}
                color={"orange"}
                variant={"filled"}
                handleClick={handleFetchData}
              >
                Fetch Data
              </IMButton>
            </IMCard>
          </Col>
          <Col span={12}>
            <IMCard title={"Filter"}>
              <Select
                mode="tags"
                size={"large"}
                placeholder="Select columns to download"
                value={selectedColumns}
                onChange={handleColumnSelect}
                style={{ width: "100%" }}
                options={columnOptions}
                allowClear={true}
              />
            </IMCard>
          </Col>
          <Col span={24}>
            <IMCard title="CT Data">
              {columns.length > 0 && data.length > 0 ? (
                <IMTable
                  columns={columns}
                  dataSource={data}
                  scroll={{
                    x: "100vw",
                  }}
                  sticky={{
                    offsetScroll: 24,
                  }}
                  onChange={handleTableChange}
                />
              ) : (
                <p>No data to display</p>
              )}
              <IMButton
                color={"green"}
                variant={"filled"}
                handleClick={handleDownload}
                className={"mt-3"}
              >
                Download
              </IMButton>
            </IMCard>
          </Col>
        </Row>
      </div>
    </section>
  );
};

export default IMUpload;
