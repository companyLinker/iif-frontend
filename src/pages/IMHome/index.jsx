import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Col, Row, Select, Input, Radio, notification, Spin } from "antd";
import * as XLSX from "xlsx";
import moment from "moment-timezone";
import _ from "lodash";
import JSZip from "jszip";
import axios from "axios";
import { IMUpload } from "../../component/IMUpload";
import { IMSelect } from "../../component/IMSelect";
import { IMCard } from "../../component/IMCard";
import { IMButton } from "../../component/IMButton";
import { IMPopover } from "../../component/IMPopover";
import { IMDatePicker } from "../../component/IMDatePicker";
import "./IMHome.css";

// Function to generate mapped data
const generateMappedData = (
  sourceData,
  sourceColumns,
  iifColumns,
  keyMappings,
  valueMappings,
  nonZeroColumns,
  positionMappings,
  calculatedColumnNames,
  calculatedColumnTypes,
  calculatedColumnIsCustomString
) => {
  return sourceData.map((row, rowIndex) => {
    const mappedRow = {};

    iifColumns.forEach((iifColumn) => {
      const keyColumns = keyMappings[iifColumn] || [];
      const valueColumns = valueMappings[iifColumn] || [];

      const keyValues = keyColumns.length ? keyColumns : [];
      const valueData = valueColumns.length
        ? valueColumns.map((col) => {
            if (nonZeroColumns.includes(col)) {
              const value = row[sourceColumns.indexOf(col)];
              return value !== 0 ? value : "ZERO";
            }
            const value = row[sourceColumns.indexOf(col)];
            if (calculatedColumnNames.includes(col)) {
              return value !== undefined ? value : 0;
            }
            return value !== undefined ? value : "";
          })
        : [];
      mappedRow[iifColumn] = valueData.length
        ? keyValues.length
          ? [...valueData, ...keyValues]
          : valueData
        : keyValues;
    });

    function splitData(arr) {
      const result = [];

      arr.forEach((item) => {
        let skip = false;
        const itemKeys = Object.keys(item);
        for (let i = 0; i < itemKeys.length; i++) {
          const key = itemKeys[i].trim();
          const targetColumns = Object.keys(keyMappings);
          for (let j = 0; j < targetColumns.length; j++) {
            const targetColumn = targetColumns[j];
            if (
              _.isEqual(keyMappings[targetColumn], valueMappings[key]) &&
              item[key] === 0
            ) {
              skip = true;
              break;
            }
          }
          if (skip) break;
        }

        if (!skip) {
          const maxLength = Math.max(
            ...Object.values(item).map((v) => (Array.isArray(v) ? v.length : 1))
          );

          const columnValues = {};
          iifColumns.forEach((iifCol) => {
            columnValues[iifCol] = Array.isArray(item[iifCol])
              ? [...item[iifCol]]
              : [item[iifCol]];
          });

          const mappedRows = Array.from({ length: maxLength }, () => ({}));
          const occupiedPositions = {};

          iifColumns.forEach((iifCol) => {
            const mappedSourceColumns = valueMappings[iifCol] || [];
            const tempValues = [...columnValues[iifCol]];
            mappedSourceColumns.forEach((sourceCol, colIndex) => {
              const position = positionMappings[sourceCol];
              if (position && position > 0 && position <= maxLength) {
                mappedRows[position - 1][iifCol] = tempValues[colIndex];
                occupiedPositions[iifCol] =
                  occupiedPositions[iifCol] || new Set();
                occupiedPositions[iifCol].add(position - 1);
                columnValues[iifCol][colIndex] = undefined;
              }
            });
          });

          iifColumns.forEach((iifCol) => {
            const mappedSourceColumns = valueMappings[iifCol] || [];
            const availableValues = columnValues[iifCol].filter(
              (val) => val !== undefined
            );
            const remainingValues = [...availableValues];
            const columnRows = mappedRows.map((row) => ({ ...row }));
            let valueIndex = 0;

            const customStringCol = mappedSourceColumns.find(
              (col) =>
                calculatedColumnNames.includes(col) &&
                (calculatedColumnIsCustomString[col] ||
                  calculatedColumnTypes[col] !== "Formula") &&
                sourceData.every(
                  (row, i) =>
                    i === 0 ||
                    row[sourceColumns.indexOf(col)] ===
                      sourceData[0][sourceColumns.indexOf(col)]
                )
            );
            const customStringValue = customStringCol
              ? sourceData[rowIndex][sourceColumns.indexOf(customStringCol)]
              : null;

            const assignedRows = new Set();

            mappedSourceColumns.forEach((sourceCol, colIndex) => {
              if (
                !calculatedColumnNames.includes(sourceCol) ||
                (calculatedColumnTypes[sourceCol] === "Formula" &&
                  !calculatedColumnIsCustomString[sourceCol])
              ) {
                const position = positionMappings[sourceCol];
                const value = columnValues[iifCol][colIndex];
                if (value !== undefined) {
                  if (position && position > 0 && position <= maxLength) {
                    assignedRows.add(position - 1);
                  } else if (valueIndex < maxLength) {
                    while (
                      valueIndex < maxLength &&
                      (columnRows[valueIndex][iifCol] !== undefined ||
                        (occupiedPositions[iifCol] &&
                          occupiedPositions[iifCol].has(valueIndex)))
                    ) {
                      valueIndex++;
                    }
                    if (valueIndex < maxLength) {
                      columnRows[valueIndex][iifCol] = value;
                      assignedRows.add(valueIndex);
                      valueIndex++;
                    }
                  }
                }
              }
            });

            mappedSourceColumns.forEach((sourceCol, colIndex) => {
              if (
                calculatedColumnNames.includes(sourceCol) &&
                (calculatedColumnTypes[sourceCol] !== "Formula" ||
                  calculatedColumnIsCustomString[sourceCol])
              ) {
                let sourceValue =
                  sourceData[rowIndex][sourceColumns.indexOf(sourceCol)];
                const value = sourceValue !== undefined ? sourceValue : 0;
                for (let rowIndex = 0; rowIndex < maxLength; rowIndex++) {
                  if (
                    !columnRows[rowIndex].hasOwnProperty(iifCol) &&
                    (!occupiedPositions[iifCol] ||
                      !occupiedPositions[iifCol].has(rowIndex)) &&
                    !assignedRows.has(rowIndex)
                  ) {
                    if (customStringValue !== null) {
                      columnRows[rowIndex][iifCol] = customStringValue;
                    } else {
                      columnRows[rowIndex][iifCol] = value;
                    }
                  }
                }
              }
            });

            for (let rowIndex = 0; rowIndex < maxLength; rowIndex++) {
              if (
                !columnRows[rowIndex].hasOwnProperty(iifCol) &&
                (!occupiedPositions[iifCol] ||
                  !occupiedPositions[iifCol].has(rowIndex))
              ) {
                if (customStringValue !== null) {
                  columnRows[rowIndex][iifCol] = customStringValue;
                } else if (valueIndex < remainingValues.length) {
                  columnRows[rowIndex][iifCol] = remainingValues[valueIndex];
                  valueIndex++;
                } else {
                  columnRows[rowIndex][iifCol] = Array.isArray(item[iifCol])
                    ? []
                    : "";
                }
              }
            }

            columnRows.forEach((row, index) => {
              if (row[iifCol] !== undefined) {
                mappedRows[index][iifCol] = row[iifCol];
              }
            });
          });

          mappedRows.forEach((row) => {
            if (!row.DATE && item.DATE) {
              row.DATE = item.DATE;
            }
          });

          const filteredRows = mappedRows.filter(
            (row) => !Object.values(row).includes("ZERO")
          );

          result.push(...filteredRows);
        }
      });

      return result;
    }

    return splitData([mappedRow]);
  });
};

// Debounce utility
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const IMHome = () => {
  const [notificationApi, contextHolder] = notification.useNotification();
  const [sourceColumns, setSourceColumns] = useState([]);
  const [iifColumns, setIifColumns] = useState([]);
  const [sourceData, setSourceData] = useState([]);
  const [keyMappings, setKeyMappings] = useState({});
  const [valueMappings, setValueMappings] = useState({});
  const [calculatedColumn, setCalculatedColumn] = useState("");
  const [calculatedColumnsFormula, setCalculatedColumnsFormula] = useState("");
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [nonZeroColumns, setNonZeroColumns] = useState([]);
  const [positionMappings, setPositionMappings] = useState({});
  const [iifHeaderRows, setIifHeaderRows] = useState([]);
  const [calculationType, setCalculationType] = useState("Answer");
  const [calculatedColumnTypes, setCalculatedColumnTypes] = useState({});
  const [calculatedColumnIsCustomString, setCalculatedColumnIsCustomString] =
    useState({});
  const [calculatedColumnNames, setCalculatedColumnNames] = useState([]);
  const [coaMappings, setCoaMappings] = useState({});
  const [coaTargetIifColumn, setCoaTargetIifColumn] = useState(null);
  const [bankMappings, setBankMappings] = useState({});
  const [bankTargetIifColumn, setBankTargetIifColumn] = useState(null);
  const [storeSplitIifColumn, setStoreSplitIifColumn] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [fetchingData, setFetchingData] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [memoMappings, setMemoMappings] = useState({});
  const [memoMappingType, setMemoMappingType] = useState("Keys");
  // Filter states
  const [states, setStates] = useState([]);
  const [brands, setBrands] = useState([]);
  const [storeNames, setStoreNames] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedStoreNames, setSelectedStoreNames] = useState([]);
  const [allData, setAllData] = useState([]);
  const [bmData, setBmData] = useState([]);
  const normalizeStoreName = useCallback((name) => {
    if (!name || typeof name !== "string") return "";
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "")
      .replace(/\s+/g, "")
      .trim();
  }, []);

  const normalizeColumnName = useCallback((name) => {
    if (!name || typeof name !== "string") return "";
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");
  }, []);

  const getPositionMappedData = useCallback(
    (mappingColumn, column, position) => {
      return sourceData.map((row) => {
        const value = row[sourceColumns.indexOf(column)];
        return Array.isArray(value) ? value[position - 1] : value;
      });
    },
    [sourceData, sourceColumns]
  );

  const fillMissingDates = useCallback((data) => {
    let lastSeenDate = null;
    return data.map((item) => {
      const newItem = { ...item };
      if (!newItem.DATE || newItem.DATE.length === 0) {
        newItem.DATE = lastSeenDate;
      } else {
        lastSeenDate = newItem.DATE;
      }
      return newItem;
    });
  }, []);

  const convertDates = useCallback((data) => {
    return data.map((item) => {
      const newItem = { ...item };
      if (newItem.DATE) {
        const dateValue = newItem.DATE;
        const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
        if (typeof dateValue === "string" && dateRegex.test(dateValue)) {
          return { ...newItem, DATE: dateValue };
        } else if (typeof dateValue === "number") {
          const date = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
          const adjustedDate = new Date(
            date.getTime() + date.getTimezoneOffset() * 60 * 1000
          );
          const year = adjustedDate.getFullYear();
          const month = adjustedDate.getMonth() + 1;
          const day = adjustedDate.getDate();
          return { ...newItem, DATE: `${month}/${day}/${year}` };
        }
      }
      return newItem;
    });
  }, []);

  const memoizedMappedData = useMemo(() => {
    if (sourceData.length && iifColumns.length) {
      return generateMappedData(
        sourceData,
        sourceColumns,
        iifColumns,
        keyMappings,
        valueMappings,
        nonZeroColumns,
        positionMappings,
        calculatedColumnNames,
        calculatedColumnTypes,
        calculatedColumnIsCustomString
      );
    }
    return [];
  }, [
    sourceData,
    sourceColumns,
    iifColumns,
    keyMappings,
    valueMappings,
    nonZeroColumns,
    positionMappings,
    calculatedColumnNames,
    calculatedColumnTypes,
    calculatedColumnIsCustomString,
  ]);

  useEffect(() => {
    if (memoizedMappedData.length) {
      const flattenedData = memoizedMappedData.flat();
      const filledData = fillMissingDates(flattenedData);
      const convertedData = convertDates(filledData);
      setPreviewData(convertedData.slice(0, 10));
    }
  }, [memoizedMappedData, fillMissingDates, convertDates]);

  const debouncedSetPositionMappings = useRef(
    debounce((newPositionMappings) => {
      setPositionMappings(newPositionMappings);
    }, 300)
  ).current;

  const handlePositionMappingChange = useCallback((column, position) => {
    debouncedSetPositionMappings((prev) => ({ ...prev, [column]: position }));
  }, []);

  const parseSourceFile = useCallback(
    (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const workbook = XLSX.read(event.target.result, { type: "binary" });
        const data = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
          { header: 1 }
        );
        const headers = data[0] || [];
        const normalizedHeaders = headers.map(normalizeColumnName);
        setSourceColumns(headers);
        setSourceData(data.slice(1) || []);
        setAllData([]);
        setBmData([]);
        setStates([]);
        setBrands([]);
        setStoreNames([]);
        setSelectedStates([]);
        setSelectedBrands([]);
        setSelectedStoreNames([]);
      };
      reader.readAsBinaryString(file);
    },
    [normalizeColumnName]
  );

  const parseIIFTemplate = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      const headerRows = lines.slice(0, 2).map((line) =>
        line
          .split("\t")
          .map((col) => col.trim())
          .filter((col) => col !== "")
      );
      setIifHeaderRows(headerRows);
      const headerLine = lines.find(
        (line) => line.startsWith("!TRNS") || line.startsWith("!SPL")
      );
      if (headerLine) {
        const columns = headerLine
          .split("\t")
          .map((col) => col.trim())
          .filter((col) => col !== "" && !col.startsWith("!"));
        setIifColumns(columns);
      }
    };
    reader.readAsText(file);
  }, []);

  const parseCoaMappingFile = useCallback(
    (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const workbook = XLSX.read(text, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const mappings = {};
        data.slice(1).forEach((row) => {
          const originalName = row[0]?.trim();
          const newName = row[1]?.trim();
          if (originalName && newName) {
            mappings[normalizeStoreName(originalName)] = newName;
          }
        });
        setCoaMappings(mappings);
      };
      reader.readAsBinaryString(file);
    },
    [normalizeStoreName]
  );

  const parseBankMappingFile = useCallback(
    (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const workbook = XLSX.read(text, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const mappings = {};
        data.slice(1).forEach((row) => {
          const storeName = row[0]?.trim();
          const mappedName = row[1]?.trim();
          if (storeName && mappedName) {
            const normalizedStoreName = normalizeStoreName(storeName);
            if (normalizedStoreName) {
              mappings[normalizedStoreName] = mappedName;
            }
          }
        });
        setBankMappings(mappings);
      };
      reader.readAsBinaryString(file);
    },
    [normalizeStoreName]
  );

  const parseMemoMappingFile = useCallback(
    (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const workbook = XLSX.read(text, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const mappings = {};
        data.slice(1).forEach((row) => {
          const originalName = row[0]?.trim();
          const newName = row[1]?.trim();
          if (originalName && newName) {
            const normalizedKey = normalizeStoreName(originalName);
            mappings[normalizedKey] = newName;
          }
        });
        setMemoMappings(mappings);
      };
      reader.readAsBinaryString(file);
    },
    [normalizeStoreName]
  );

  const handleKeyMapping = useCallback((sourceColumns, iifColumn) => {
    setKeyMappings((prev) => ({
      ...prev,
      [iifColumn]: sourceColumns,
    }));
  }, []);

  const handleValueMapping = useCallback((sourceColumns, iifColumn) => {
    setValueMappings((prev) => ({
      ...prev,
      [iifColumn]: sourceColumns,
    }));
  }, []);

  const handleCalculatedColumnChange = useCallback((e) => {
    setCalculatedColumn(e.target.value);
  }, []);

  const handleCalculatedColumnsFormulaChange = useCallback((e) => {
    setCalculatedColumnsFormula(e.target.value);
  }, []);

  const handleSelectedColumnsChange = useCallback((value) => {
    setSelectedColumns(value);
  }, []);

  const handleCoaTargetIifColumnChange = useCallback((value) => {
    setCoaTargetIifColumn(value);
  }, []);

  const handleBankTargetIifColumnChange = useCallback((value) => {
    setBankTargetIifColumn(value);
  }, []);

  const handleStoreSplitIifColumnChange = useCallback((value) => {
    setStoreSplitIifColumn(value);
  }, []);

  const handleDateChange = useCallback((dates) => {
    setStartDate(dates[0]);
    setEndDate(dates[1]);
  }, []);

  const handleStateChange = useCallback((value) => {
    setSelectedStates(value);
  }, []);

  const handleBrandChange = useCallback((value) => {
    setSelectedBrands(value);
  }, []);

  const handleStoreNameChange = useCallback((value) => {
    setSelectedStoreNames(value);
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/filter-options`
      );
      const { states, brands, storeMappings } = response.data;
      setStates(states.sort());
      setBrands(brands.sort());
      setStoreNames(storeMappings.map((m) => m.POS_COMPANY_NAME).sort());
      setBmData(storeMappings);
    } catch (error) {
      notificationApi.error({
        message: "Error",
        description: "Failed to fetch filter options.",
      });
    }
  }, [notificationApi]);

  const handleFetchData = useCallback(() => {
    if (!startDate || !endDate) {
      notificationApi.error({
        message: "Error",
        description: "Please select a valid date range.",
      });
      return;
    }

    const formattedStartDate = startDate.format("MM-DD-YYYY");
    const formattedEndDate = endDate.format("MM-DD-YYYY");

    setFetchingData(true);

    axios
      .post(`${import.meta.env.VITE_API_URL}/api/data`, {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      })
      .then((response) => {
        setFetchingData(false);
        if (response.data && response.data.length > 0) {
          const dataWithoutId = response.data.map((item) => {
            const { _id, ...rest } = item;
            return rest;
          });
          const headers = Object.keys(dataWithoutId[0]);
          const normalizedHeaders = headers.map(normalizeColumnName);
          const dataArray = dataWithoutId.map((item) =>
            headers.map((header) => item[header])
          );
          setAllData(dataArray);
          setSourceColumns(headers);
          setSourceData(dataArray);
          fetchFilterOptions();
          notificationApi.success({
            message: "Success",
            description: "Data fetched successfully.",
          });
        } else {
          notificationApi.warning({
            message: "Warning",
            description: "No data found for the selected date range.",
          });
          setSourceColumns([]);
          setSourceData([]);
          setAllData([]);
          setBmData([]);
          setStates([]);
          setBrands([]);
          setStoreNames([]);
          setSelectedStates([]);
          setSelectedBrands([]);
          setSelectedStoreNames([]);
        }
      })
      .catch((error) => {
        setFetchingData(false);
        notificationApi.error({
          message: "Error",
          description: "Error fetching data. Please try again.",
        });
      });
  }, [
    startDate,
    endDate,
    notificationApi,
    normalizeColumnName,
    fetchFilterOptions,
  ]);

  const filteredData = useMemo(() => {
    if (!allData.length || !bmData.length) return allData;

    return allData.filter((row) => {
      const storeName = row[sourceColumns.indexOf("StoreName")];
      if (!storeName) return false;

      const matchedStore = bmData.find(
        (bm) => bm.POS_COMPANY_NAME === storeName
      );
      if (!matchedStore) return false;

      const stateMatch =
        selectedStates.length === 0 ||
        selectedStates.includes(matchedStore.State);
      const brandMatch =
        selectedBrands.length === 0 ||
        selectedBrands.includes(matchedStore.BRAND);
      const storeMatch =
        selectedStoreNames.length === 0 ||
        selectedStoreNames.includes(matchedStore.POS_COMPANY_NAME);

      return stateMatch && brandMatch && storeMatch;
    });
  }, [
    allData,
    bmData,
    selectedStates,
    selectedBrands,
    selectedStoreNames,
    sourceColumns,
  ]);

  const handleApplyFilter = useCallback(() => {
    setSourceData(filteredData);
    setSourceColumns(sourceColumns);
    notificationApi.success({
      message: "Success",
      description: `Filtered ${filteredData.length} records.`,
    });
  }, [filteredData, sourceColumns, notificationApi]);

  const singleMappedColumns = useMemo(() => {
    return Object.keys(valueMappings).filter((column) => {
      const columns = valueMappings[column];
      return columns.length === 1 && column !== "DATE";
    });
  }, [valueMappings]);

  const newlyCreatedColumns = useMemo(() => {
    return Object.keys(valueMappings).filter((column) => {
      const columns = valueMappings[column];
      return columns.some((col) => calculatedColumnNames.includes(col));
    });
  }, [valueMappings, calculatedColumnNames]);
  const addCalculatedColumn = useCallback(() => {
    if (!calculatedColumn) {
      notificationApi.error({
        message: "Error",
        description: "Please provide a name for the calculated column.",
      });
      return;
    }

    if (calculatedColumnNames.includes(calculatedColumn)) {
      notificationApi.error({
        message: "Error",
        description:
          "Duplicate calculated column name. Please use a unique name.",
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

    const formula = calculatedColumnsFormula;
    const normalizedSourceColumns = sourceColumns.map((col) =>
      col.trim().toLowerCase()
    );
    const columns = formula
      .split(/([-+*/()])/)
      .map((part) => part.trim())
      .filter((part) => part && !/[-+*/()]/.test(part))
      .map((col) => col.toLowerCase());

    const isCustomString = !columns.some((col) =>
      normalizedSourceColumns.includes(col)
    );

    let newData;
    if (isCustomString) {
      newData = sourceData.map(() => formula);
    } else {
      newData = sourceData.map((row, rowIndex) => {
        try {
          let formulaCopy = formula.toLowerCase();
          let isValid = true;

          columns.forEach((col) => {
            const colIndex = normalizedSourceColumns.indexOf(col);
            if (colIndex === -1) {
              throw new Error(
                `Column "${col}" not found in source data at row ${rowIndex}`
              );
            }
            let value = row[colIndex];

            if (value === null || value === undefined || value === "") {
              value = 0;
            } else if (typeof value === "string") {
              const cleanedValue = value.replace(/[^0-9.-]/g, "");
              const parsedValue = parseFloat(cleanedValue);
              if (isNaN(parsedValue) || !cleanedValue.match(/^-?\d*\.?\d*$/)) {
                value = 0;
                isValid = false;
              } else {
                value = parsedValue;
              }
            }

            const escapedCol = col.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");
            formulaCopy = formulaCopy.replace(
              new RegExp(escapedCol, "g"),
              value
            );
          });

          if (!isValid || !formulaCopy.match(/^[0-9+\-*/().\s]+$/)) {
            throw new Error(
              `Invalid formula syntax: "${formulaCopy}" at row ${rowIndex}`
            );
          }

          const result =
            calculationType === "Answer" ? eval(formulaCopy) : formulaCopy;

          if (
            calculationType === "Answer" &&
            (isNaN(result) || !isFinite(result))
          ) {
            throw new Error(
              `Formula evaluation resulted in invalid number: "${result}" at row ${rowIndex}`
            );
          }

          return result;
        } catch (error) {
          notificationApi.warning({
            message: "Warning",
            description: `Error calculating value for row ${rowIndex + 1}: ${
              error.message
            }. Using 0.`,
          });
          return 0;
        }
      });
    }

    const newSourceColumns = [...sourceColumns, calculatedColumn];
    const newSourceData = sourceData.map((row, index) => {
      const newRow = [...row, newData[index]];
      return newRow;
    });

    const updatedValueMappings = { ...valueMappings };
    Object.keys(updatedValueMappings).forEach((iifColumn) => {
      if (updatedValueMappings[iifColumn].includes(calculatedColumn)) {
        const targetIndex = newSourceColumns.indexOf(iifColumn);
        if (targetIndex !== -1) {
          newSourceData.forEach((row, rowIndex) => {
            row[targetIndex] = newData[rowIndex];
          });
        }
      }
    });

    setCalculatedColumnTypes((prev) => ({
      ...prev,
      [calculatedColumn]: calculationType,
    }));
    setCalculatedColumnIsCustomString((prev) => ({
      ...prev,
      [calculatedColumn]: isCustomString,
    }));
    setCalculatedColumnNames((prev) => [...prev, calculatedColumn]);
    setSourceColumns(newSourceColumns);
    setSourceData(newSourceData);
    setValueMappings(updatedValueMappings);
    notificationApi.success({
      message: "Success",
      description: "Calculated column added successfully.",
    });
  }, [
    calculatedColumnNames,
    calculatedColumn,
    calculatedColumnsFormula,
    calculationType,
    sourceColumns,
    sourceData,
    valueMappings,
    selectedColumns,
    notificationApi,
  ]);

  const downloadMappedData = useCallback(async () => {
    if (!sourceData.length || !Object.keys(keyMappings).length) return;

    setDownloading(true);

    const chunkSize = 1000;
    let allMappedData = [];

    for (let i = 0; i < sourceData.length; i += chunkSize) {
      const chunk = sourceData.slice(i, i + chunkSize);
      const mappedChunk = generateMappedData(
        chunk,
        sourceColumns,
        iifColumns,
        keyMappings,
        valueMappings,
        nonZeroColumns,
        positionMappings,
        calculatedColumnNames,
        calculatedColumnTypes,
        calculatedColumnIsCustomString
      );
      mappedChunk.forEach((rowGroup, chunkIndex) => {
        const originalIndex = i + chunkIndex;
        rowGroup.forEach((row) => {
          row.sourceRowIndex = originalIndex;
        });
      });
      allMappedData = allMappedData.concat(mappedChunk);
    }

    const flattenedData = allMappedData.flat();
    const filledData = fillMissingDates(flattenedData);
    const convertedData = convertDates(filledData);

    const storeSplitSourceColumn = valueMappings[storeSplitIifColumn]?.[0];
    if (!storeSplitSourceColumn) {
      notificationApi.error({
        message: "Error",
        description: `No source column mapped to ${storeSplitIifColumn}. Cannot split by store.`,
      });
      setDownloading(false);
      return;
    }

    const groupedByStore = {};
    allMappedData.forEach((rowGroup, rowIndex) => {
      const sourceRow = sourceData[rowIndex];
      const storeName =
        sourceRow[sourceColumns.indexOf(storeSplitSourceColumn)];

      if (!storeName) return;

      groupedByStore[storeName] = groupedByStore[storeName] || [];
      const filledRowGroup = fillMissingDates(rowGroup);
      const convertedRowGroup = convertDates(filledRowGroup);
      groupedByStore[storeName].push(convertedRowGroup);
    });

    const zip = new JSZip();
    const totalColumns = iifHeaderRows[0].length;

    const storeNames = Object.keys(groupedByStore);
    for (const storeName of storeNames) {
      let storeGroups = groupedByStore[storeName];

      storeGroups = storeGroups.map((group) =>
        group.map((row) => {
          const updatedRow = { ...row };

          let originalCoaValue = null;
          if (
            coaTargetIifColumn &&
            updatedRow[coaTargetIifColumn] !== undefined
          ) {
            originalCoaValue = updatedRow[coaTargetIifColumn];
          }

          if (
            originalCoaValue &&
            typeof originalCoaValue === "string" &&
            originalCoaValue.trim() !== ""
          ) {
            const normalizedCoaValue = normalizeStoreName(originalCoaValue);
            const memoKeys = Object.keys(memoMappings);
            const matchedKey = memoKeys.find((key) => {
              const normalizedKey = normalizeStoreName(key);
              return normalizedCoaValue === normalizedKey;
            });
            if (matchedKey) {
              let memoValue;
              if (memoMappingType === "Keys") {
                memoValue = memoMappings[matchedKey];
              } else if (memoMappingType === "Values") {
                const mappedColumnName = memoMappings[matchedKey];
                const normalizedMappedColumn =
                  normalizeColumnName(mappedColumnName);
                const columnIndex = sourceColumns.findIndex(
                  (col) => normalizeColumnName(col) === normalizedMappedColumn
                );
                if (columnIndex !== -1) {
                  const sourceRowIndex = row.sourceRowIndex;
                  if (
                    sourceRowIndex !== undefined &&
                    sourceData[sourceRowIndex]
                  ) {
                    memoValue = sourceData[sourceRowIndex][columnIndex];
                  } else {
                    memoValue = "";
                  }
                } else {
                  memoValue = "";
                }
              } else if (memoMappingType === "Both") {
                const mappedColumnName = memoMappings[matchedKey];
                const normalizedMappedColumn =
                  normalizeColumnName(mappedColumnName);
                const columnIndex = sourceColumns.findIndex(
                  (col) => normalizeColumnName(col) === normalizedMappedColumn
                );
                if (columnIndex !== -1) {
                  const sourceRowIndex = row.sourceRowIndex;
                  if (
                    sourceRowIndex !== undefined &&
                    sourceData[sourceRowIndex]
                  ) {
                    memoValue = sourceData[sourceRowIndex][columnIndex];
                  } else {
                    memoValue = memoMappings[matchedKey];
                  }
                } else {
                  memoValue = memoMappings[matchedKey];
                }
              }

              if (memoValue && iifColumns.includes("MEMO")) {
                const currentMemo = updatedRow["MEMO"] || "";
                updatedRow["MEMO"] = currentMemo
                  ? `${currentMemo} ${memoValue}`
                  : memoValue;
              } else if (!iifColumns.includes("MEMO")) {
                notificationApi.warning({
                  message: "Warning",
                  description:
                    "MEMO column not found in IIF template. MEMO mapping will be skipped.",
                });
              }
            }
          }

          if (
            coaTargetIifColumn &&
            updatedRow[coaTargetIifColumn] !== undefined
          ) {
            const value = updatedRow[coaTargetIifColumn];
            if (typeof value === "string") {
              const normalizedValue = normalizeStoreName(value);
              const originalKeys = Object.keys(coaMappings);
              for (let key of originalKeys) {
                const normalizedKey = normalizeStoreName(key);
                if (normalizedValue === normalizedKey) {
                  updatedRow[coaTargetIifColumn] = coaMappings[key];
                  break;
                }
              }
            }
          }

          if (
            bankTargetIifColumn &&
            updatedRow[bankTargetIifColumn] !== undefined
          ) {
            const value = updatedRow[bankTargetIifColumn];
            if (typeof value === "string") {
              const normalizedValue = normalizeStoreName(value);
              const originalKeys = Object.keys(bankMappings);
              for (let key of originalKeys) {
                const normalizedKey = normalizeStoreName(key);
                if (normalizedValue === normalizedKey) {
                  updatedRow[bankTargetIifColumn] = bankMappings[key];
                  break;
                }
              }
            }
          }

          delete updatedRow.sourceRowIndex;
          return updatedRow;
        })
      );

      const storeWorksheetData = [...iifHeaderRows, ["!ENDTRNS"]];

      storeGroups.sort((groupA, groupB) => {
        const dateA = new Date(groupA[0].DATE);
        const dateB = new Date(groupB[0].DATE);
        return dateA - dateB;
      });

      const allRows = storeGroups.flat();
      let currentDate = null;

      allRows.forEach((row) => {
        const rowDate = row.DATE;

        if (currentDate !== rowDate) {
          if (currentDate !== null) {
            const endRow = Array(totalColumns).fill("");
            endRow[0] = "ENDTRNS";
            storeWorksheetData.push(endRow);
          }

          currentDate = rowDate;
          const dataRow = Array(totalColumns).fill("");
          dataRow[0] = "TRNS";
          iifColumns.forEach((col, colIndex) => {
            dataRow[colIndex + 1] = row[col] !== undefined ? row[col] : "";
          });
          storeWorksheetData.push(dataRow);
        } else if (!row.ENDTRNS) {
          const dataRow = Array(totalColumns).fill("");
          dataRow[0] = "SPL";
          iifColumns.forEach((col, colIndex) => {
            dataRow[colIndex + 1] = row[col] !== undefined ? row[col] : "";
          });
          storeWorksheetData.push(dataRow);
        }
      });

      if (allRows.length > 0) {
        const endRow = Array(totalColumns).fill("");
        endRow[0] = "ENDTRNS";
        storeWorksheetData.push(endRow);
      }

      const iifContent = storeWorksheetData
        .map((row) => row.join("\t"))
        .join("\n");
      const sanitizedStoreName = storeName.replace(/[^a-zA-Z0-9-_ ]/g, "_");
      const fileName = `${sanitizedStoreName}.iif`;
      zip.file(fileName, iifContent);
    }

    zip.generateAsync({ type: "blob" }).then((content) => {
      const link = document.createElement("a");
      const url = URL.createObjectURL(content);
      link.setAttribute("href", url);
      link.setAttribute("download", "store_iif_files.zip");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloading(false);
    });
  }, [
    sourceData,
    sourceColumns,
    keyMappings,
    storeSplitIifColumn,
    valueMappings,
    iifColumns,
    iifHeaderRows,
    coaTargetIifColumn,
    coaMappings,
    bankTargetIifColumn,
    bankMappings,
    memoMappings,
    memoMappingType,
    normalizeStoreName,
    normalizeColumnName,
    notificationApi,
    fillMissingDates,
    convertDates,
    positionMappings,
    nonZeroColumns,
    calculatedColumnNames,
    calculatedColumnTypes,
    calculatedColumnIsCustomString,
  ]);

  return (
    <>
      {contextHolder}
      <section className="py-5">
        <div className="container">
          <div className="space-y-4">
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <IMCard
                  extra={
                    <IMPopover
                      className={"mapping-popver"}
                      content={
                        <>
                          <p>
                            <strong>
                              Select the IIF column (COA Mapping):
                            </strong>{" "}
                            <br />
                            Choose the column where you'll map the original COA
                            names.
                          </p>
                          <p>
                            <strong>
                              Select the IIF column (Bank Mapping):
                            </strong>{" "}
                            <br />
                            Choose the column where you'll map the original bank
                            names.
                          </p>
                          <p>
                            <strong>
                              Select the IIF column (Store Splitting):
                            </strong>{" "}
                            <br />
                            Choose the column where you'll map the store names.
                          </p>
                        </>
                      }
                    />
                  }
                >
                  <Row gutter={[16, 16]}>
                    <Col span={8}>
                      <IMUpload
                        handleChange={({ file }) => parseSourceFile(file)}
                        accept=".xlsx,.xls,.csv"
                        variant="solid"
                        color="default"
                      >
                        Upload Source Data Sheet
                      </IMUpload>
                    </Col>
                    <Col span={8}>
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
                        disabled={fetchingData}
                      >
                        {fetchingData ? <Spin size="small" /> : "Get Data"}
                      </IMButton>
                    </Col>
                    <Col span={8}>
                      <IMUpload
                        handleChange={({ file }) => parseIIFTemplate(file)}
                        accept=".iif,.txt"
                        variant="solid"
                        color="default"
                      >
                        Upload IIF Template
                      </IMUpload>
                    </Col>
                    <Col span={8}>
                      <IMUpload
                        handleChange={({ file }) => parseCoaMappingFile(file)}
                        accept=".iif,.txt,.csv"
                        variant="solid"
                        color="default"
                      >
                        Upload COA Mapping Sheet
                      </IMUpload>
                    </Col>
                    <Col span={8}>
                      <IMUpload
                        handleChange={({ file }) => parseBankMappingFile(file)}
                        accept=".xlsx,.xls,.csv"
                        variant="solid"
                        color="default"
                      >
                        Upload Bank Mapping Sheet
                      </IMUpload>
                    </Col>
                    <Col span={8}>
                      <IMUpload
                        handleChange={({ file }) => parseMemoMappingFile(file)}
                        accept=".xlsx,.xls,.csv"
                        variant="solid"
                        color="default"
                      >
                        Upload MEMO Mapping Sheet
                      </IMUpload>
                    </Col>
                    <Col span={8}>
                      <label className="selectLabel" htmlFor="COAMappingSelect">
                        Select the IIF column (COA Mapping)
                      </label>
                      <IMSelect
                        id={"COAMappingSelect"}
                        value={coaTargetIifColumn}
                        handleChange={handleCoaTargetIifColumnChange}
                        placeholder={"Select the IIF column (COA Mapping)"}
                        disabled={!iifColumns.length}
                        style={{ width: "100%" }}
                      >
                        {iifColumns.map((iifColumn) => (
                          <Select.Option
                            key={`iif-coa-${iifColumn}`}
                            value={iifColumn}
                          >
                            {iifColumn}
                          </Select.Option>
                        ))}
                      </IMSelect>
                    </Col>
                    <Col span={8}>
                      <label
                        className="selectLabel"
                        htmlFor="BANKMappingSelect"
                      >
                        Select the IIF column (Bank Mapping)
                      </label>
                      <IMSelect
                        id={"BANKMappingSelect"}
                        value={bankTargetIifColumn}
                        handleChange={handleBankTargetIifColumnChange}
                        placeholder={"Select the IIF column (Bank Mapping)"}
                        disabled={!iifColumns.length}
                        style={{ width: "100%" }}
                      >
                        {iifColumns.map((iifColumn) => (
                          <Select.Option
                            key={`iif-bank-${iifColumn}`}
                            value={iifColumn}
                          >
                            {iifColumn}
                          </Select.Option>
                        ))}
                      </IMSelect>
                    </Col>
                    <Col span={8}>
                      <label
                        className="selectLabel"
                        htmlFor="StorenameSplittingMappingSelect"
                      >
                        Select the IIF column (Store Splitting)
                      </label>
                      <IMSelect
                        id={"StorenameSplittingMappingSelect"}
                        value={storeSplitIifColumn}
                        handleChange={handleStoreSplitIifColumnChange}
                        placeholder={"Select the IIF column (Store Splitting)"}
                        disabled={!iifColumns.length}
                        style={{ width: "100%" }}
                      >
                        {iifColumns.map((iifColumn) => (
                          <Select.Option
                            key={`iif-store-split-${iifColumn}`}
                            value={iifColumn}
                          >
                            {iifColumn}
                          </Select.Option>
                        ))}
                      </IMSelect>
                    </Col>
                    <Col span={8}>
                      <label>MEMO Mapping Type:  </label>
                      <Radio.Group
                        value={memoMappingType}
                        onChange={(e) => setMemoMappingType(e.target.value)}
                      >
                        <Radio value="Keys">Keys</Radio>
                        <Radio value="Values">Values</Radio>
                        <Radio value="Both">Both</Radio>
                      </Radio.Group>
                    </Col>
                    <Col span={8}>
                      <label className="selectLabel" htmlFor="StateSelect">
                        Select States
                      </label>
                      <Select
                        id="StateSelect"
                        mode="multiple"
                        value={selectedStates}
                        onChange={handleStateChange}
                        placeholder="Select States"
                        style={{ width: "100%" }}
                        showSearch
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                          option.children
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        allowClear
                        maxTagCount="responsive"
                        dropdownRender={(menu) => (
                          <>
                            <div style={{ padding: "4px 8px" }}>
                              <IMButton
                                size="small"
                                onClick={() => setSelectedStates(states)}
                                style={{ marginRight: 8 }}
                              >
                                Select All
                              </IMButton>
                              <IMButton
                                size="small"
                                onClick={() => setSelectedStates([])}
                              >
                                Deselect All
                              </IMButton>
                            </div>
                            {menu}
                          </>
                        )}
                      >
                        {states.map((state) => (
                          <Select.Option key={`state-${state}`} value={state}>
                            {state}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                    <Col span={8}>
                      <label className="selectLabel" htmlFor="BrandSelect">
                        Select Brands
                      </label>
                      <Select
                        id="BrandSelect"
                        mode="multiple"
                        value={selectedBrands}
                        onChange={handleBrandChange}
                        placeholder="Select Brands"
                        style={{ width: "100%" }}
                        showSearch
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                          option.children
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        allowClear
                        maxTagCount="responsive"
                        dropdownRender={(menu) => (
                          <>
                            <div style={{ padding: "4px 8px" }}>
                              <IMButton
                                size="small"
                                onClick={() => setSelectedBrands(brands)}
                                style={{ marginRight: 8 }}
                              >
                                Select All
                              </IMButton>
                              <IMButton
                                size="small"
                                onClick={() => setSelectedBrands([])}
                              >
                                Deselect All
                              </IMButton>
                            </div>
                            {menu}
                          </>
                        )}
                      >
                        {brands.map((brand) => (
                          <Select.Option key={`brand-${brand}`} value={brand}>
                            {brand}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                    <Col span={8}>
                      <label className="selectLabel" htmlFor="StoreNameSelect">
                        Select Store Names
                      </label>
                      <Select
                        id="StoreNameSelect"
                        mode="multiple"
                        value={selectedStoreNames}
                        onChange={handleStoreNameChange}
                        placeholder="Select Store Names"
                        style={{ width: "100%" }}
                        showSearch
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                          option.children
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        allowClear
                        maxTagCount="responsive"
                        dropdownRender={(menu) => (
                          <>
                            <div style={{ padding: "4px 8px" }}>
                              <IMButton
                                size="small"
                                onClick={() =>
                                  setSelectedStoreNames(storeNames)
                                }
                                style={{ marginRight: 8 }}
                              >
                                Select All
                              </IMButton>
                              <IMButton
                                size="small"
                                onClick={() => setSelectedStoreNames([])}
                              >
                                Deselect All
                              </IMButton>
                            </div>
                            {menu}
                          </>
                        )}
                      >
                        {storeNames.map((store) => (
                          <Select.Option key={`store-${store}`} value={store}>
                            {store}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                    <Col span={8}>
                      <IMButton
                        color={"blue"}
                        variant={"filled"}
                        handleClick={handleApplyFilter}
                        disabled={!allData.length}
                      >
                        Apply Filter
                      </IMButton>
                    </Col>
                  </Row>
                </IMCard>
              </Col>

              <Col span={24}>
                <IMCard
                  title={"Create Calculated Column"}
                  extra={
                    <div className="calculated-col-extra-wrap">
                      <div className="calculation-type-wrap">
                        <label>Calculation Type: </label>
                        <Radio.Group
                          value={calculationType}
                          onChange={(e) => setCalculationType(e.target.value)}
                        >
                          <Radio value="Formula">Formula</Radio>
                          <Radio value="Answer">Answer</Radio>
                        </Radio.Group>
                      </div>
                      <IMPopover
                        className={"mapping-popver"}
                        content={
                          <>
                            <p>Create a new column using a formula!</p>
                            <p>
                              <b>Step 1:</b> Pick the columns you want to use.
                            </p>
                            <p>
                              <b>Step 2:</b> Write a formula using math signs
                              (+, -, *, /). <br /> Example:{" "}
                              <b>column1 + column2 -!- column3</b>
                            </p>
                            <p>
                              <b>Step 3:</b> Name your new column. It’ll show up
                              for mapping!
                            </p>
                          </>
                        }
                      />
                    </div>
                  }
                >
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Select
                        mode="multiple"
                        value={selectedColumns}
                        onChange={handleSelectedColumnsChange}
                        placeholder={"Select Columns"}
                        style={{ width: "100%" }}
                      >
                        {sourceColumns.map((sourceColumn) => (
                          <Select.Option
                            key={`col-${sourceColumn}`}
                            value={sourceColumn}
                          >
                            {sourceColumn}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                    <Col span={12}>
                      <Input
                        value={calculatedColumn}
                        onChange={handleCalculatedColumnChange}
                        className="w-full"
                        placeholder="Give a name to column"
                      />
                    </Col>
                    <Col span={24}>
                      <Input.TextArea
                        value={
                          calculatedColumnsFormula || selectedColumns.join(" ")
                        }
                        onChange={handleCalculatedColumnsFormulaChange}
                        placeholder="Formula"
                      />
                    </Col>
                    <Col span={24}>
                      <IMButton
                        handleClick={addCalculatedColumn}
                        variant={"filled"}
                        color={"purple"}
                      >
                        Add Calculated Column
                      </IMButton>
                    </Col>
                  </Row>
                </IMCard>
              </Col>
              <Col span={24}>
                {iifColumns.length > 0 && sourceColumns.length > 0 && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <IMCard
                        title={"Key Mapping (Column's names itself)"}
                        extra={
                          <IMPopover
                            className={"mapping-popver"}
                            content={<>content</>}
                          />
                        }
                      >
                        {iifColumns.map((iifColumn) => (
                          <div key={`key-${iifColumn}`} className="mb-2">
                            <label className="block mb-1">
                              {iifColumn} (Key Mapping)
                            </label>
                            <select
                              multiple
                              onChange={(e) => {
                                const selectedColumns = Array.from(
                                  e.target.selectedOptions
                                ).map((option) => option.value);
                                handleKeyMapping(selectedColumns, iifColumn);
                              }}
                              className="w-full p-2 border rounded h-32"
                            >
                              {sourceColumns.map((sourceColumn) => (
                                <option
                                  key={`key-${sourceColumn}`}
                                  value={sourceColumn}
                                >
                                  {sourceColumn}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </IMCard>
                    </Col>

                    <Col span={12}>
                      <IMCard
                        title={"Value Mapping (Column's data)"}
                        extra={
                          <IMPopover
                            className={"mapping-popver"}
                            content={<>content</>}
                          />
                        }
                      >
                        {iifColumns.map((iifColumn) => (
                          <div key={`value-${iifColumn}`} className="mb-2">
                            <label className="block mb-1">
                              {iifColumn} (Value Mapping)
                            </label>
                            <select
                              multiple
                              onChange={(e) => {
                                const selectedColumns = Array.from(
                                  e.target.selectedOptions
                                ).map((option) => option.value);
                                handleValueMapping(selectedColumns, iifColumn);
                              }}
                              className="w-full p-2 border rounded h-32"
                            >
                              {sourceColumns.map((sourceColumn) => (
                                <option
                                  key={`value-${sourceColumn}`}
                                  value={sourceColumn}
                                >
                                  {sourceColumn}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </IMCard>
                    </Col>
                  </Row>
                )}
              </Col>
              <Col span={24}>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <IMCard
                      title={"Select columns for non-zero mapping"}
                      extra={
                        <IMPopover
                          className={"mapping-popver"}
                          content={
                            <>
                              <p>
                                Pick columns you don’t want to map if they have
                                a zero (0).
                              </p>
                              <p>
                                Columns you don’t pick will map, even with
                                zeros!
                              </p>
                            </>
                          }
                        />
                      }
                    >
                      <select
                        multiple
                        value={nonZeroColumns}
                        onChange={(e) => {
                          const selectedColumns = Array.from(
                            e.target.selectedOptions
                          ).map((option) => option.value);
                          setNonZeroColumns(selectedColumns);
                        }}
                        className="w-full p-2 border rounded h-32"
                      >
                        {sourceColumns.map((sourceColumn) => (
                          <option
                            key={`col-${sourceColumn}`}
                            value={sourceColumn}
                          >
                            {sourceColumn}
                          </option>
                        ))}
                      </select>
                    </IMCard>
                  </Col>

                  <Col span={12}>
                    <IMCard
                      title={"Position Mapping"}
                      extra={
                        <IMPopover
                          className={"mapping-popver"}
                          content={
                            <>
                              <p>
                                This is where you choose the order of your
                                column data.
                              </p>
                              <p>
                                Picking a number from 1 to 5 is highly
                                recommended.
                              </p>
                            </>
                          }
                        />
                      }
                    >
                      {singleMappedColumns.map((column) => {
                        const sourceColumn = valueMappings[column][0];
                        const mappingColumn = Object.keys(valueMappings).find(
                          (key) => valueMappings[key].includes(sourceColumn)
                        );
                        return (
                          <div className="mb-2" key={`position-${column}`}>
                            <label className="block mb-1">
                              {sourceColumn} (Mapped to {mappingColumn} column):
                            </label>
                            <Select
                              value={positionMappings[sourceColumn]}
                              onChange={(value) =>
                                handlePositionMappingChange(sourceColumn, value)
                              }
                              allowClear
                              style={{ width: "100%" }}
                            >
                              {Array.from(
                                { length: sourceData.length },
                                (_, i) => i + 1
                              ).map((position) => (
                                <Select.Option
                                  key={`position-${sourceColumn}-${position}`}
                                  value={position}
                                >
                                  {position}
                                </Select.Option>
                              ))}
                            </Select>
                          </div>
                        );
                      })}
                      {newlyCreatedColumns.map((column) => {
                        const sourceColumn = valueMappings[column].find((col) =>
                          calculatedColumnNames.includes(col)
                        );
                        const mappingColumn = Object.keys(valueMappings).find(
                          (key) => valueMappings[key].includes(sourceColumn)
                        );
                        return (
                          <div className="mb-2" key={`position-${column}`}>
                            <label className="block mb-1">
                              {sourceColumn} (Mapped to {mappingColumn} column):
                            </label>
                            <Select
                              value={positionMappings[sourceColumn]}
                              onChange={(value) =>
                                handlePositionMappingChange(sourceColumn, value)
                              }
                              allowClear
                              style={{ width: "100%" }}
                            >
                              {Array.from(
                                { length: sourceData.length },
                                (_, i) => i + 1
                              ).map((position) => (
                                <Select.Option
                                  key={`position-${sourceColumn}-${position}`}
                                  value={position}
                                >
                                  {position}
                                </Select.Option>
                              ))}
                            </Select>
                          </div>
                        );
                      })}
                    </IMCard>
                  </Col>
                </Row>
              </Col>
              <Col span={24}>
                <IMCard title={"Preview of Mapped Data (First 10 Rows)"}>
                  {previewData.length > 0 ? (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {iifColumns.map((column) => (
                            <th key={column} className="border p-2">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {iifColumns.map((column) => (
                              <td
                                key={`${rowIndex}-${column}`}
                                className="border p-2"
                              >
                                {row[column] !== undefined ? row[column] : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No data to preview.</p>
                  )}
                </IMCard>
              </Col>
              <Col span={24}>
                <IMButton
                  handleClick={downloadMappedData}
                  disabled={
                    !sourceData.length || !Object.keys(keyMappings).length
                  }
                  variant={"solid"}
                  color={"green"}
                >
                  {downloading ? <Spin size="small" /> : "Download Mapped Data"}
                </IMButton>
              </Col>
            </Row>
          </div>
        </div>
      </section>
    </>
  );
};

export default IMHome;
