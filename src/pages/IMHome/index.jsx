import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  Col,
  Row,
  Select,
  Input,
  Radio,
  notification,
  Spin,
  Modal,
} from "antd";
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

// Function to generate mapped data (unchanged)
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
  calculatedColumnIsCustomString,
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
          ? [...valueData, ...keyValues] // Fixed: Replaced keyKeys with keyValues
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
            ...Object.values(item).map((v) =>
              Array.isArray(v) ? v.length : 1,
            ),
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
              (val) => val !== undefined,
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
                      sourceData[0][sourceColumns.indexOf(col)],
                ),
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
            (row) => !Object.values(row).includes("ZERO"),
          );

          result.push(...filteredRows);
        }
      });

      return result;
    }

    return splitData([mappedRow]);
  });
};

// Debounce utility (unchanged)
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
  const [emptyColumnNames, setEmptyColumnNames] = useState([]);
  const [coaMappings, setCoaMappings] = useState({});
  const [coaTargetIifColumn, setCoaTargetIifColumn] = useState(null);
  const [bankTargetIifColumn, setBankTargetIifColumn] = useState(null);
  const [storeSplitIifColumn, setStoreSplitIifColumn] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [fetchingData, setFetchingData] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [memoMappingSets, setMemoMappingSets] = useState([
    {
      id: Date.now(),
      memoMappings: {},
      memoMappingType: "Keys",
      memoSourceIifColumn: null,
      memoTargetIifColumn: null,
    },
  ]);
  const [states, setStates] = useState([]);
  const [brands, setBrands] = useState([]);
  const [storeNames, setStoreNames] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedStoreNames, setSelectedStoreNames] = useState([]);
  const [allData, setAllData] = useState([]);
  const [bmData, setBmData] = useState([]);
  const [emptyColumnName, setEmptyColumnName] = useState("");
  const [bankMappingLookup, setBankMappingLookup] = useState(new Map());
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [pendingFormatData, setPendingFormatData] = useState(null);
  const [existingFormatId, setExistingFormatId] = useState(null);
  // Normalized column name mapping for localStorage
  const [normalizedColumnMap, setNormalizedColumnMap] = useState({});

  const [formats, setFormats] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [formatName, setFormatName] = useState("");
  const [isFormatModified, setIsFormatModified] = useState(false);
  const [calculatedColumnDefinitions, setCalculatedColumnDefinitions] =
    useState([]);

  const [availableBrands, setAvailableBrands] = useState([]);
  const [selectedDbBrand, setSelectedDbBrand] = useState(null);

  const [newIifColumnName, setNewIifColumnName] = useState("");
  const [storeData, setStoreData] = useState([]);

  const handleNewIifColumnNameChange = useCallback((e) => {
    setNewIifColumnName(e.target.value);
  }, []);

  const fetchBrands = useCallback(async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/brands`,
      );
      if (response.data && Array.isArray(response.data)) {
        setAvailableBrands(response.data.sort());
      } else {
        throw new Error("Invalid response format: Expected an array of brands");
      }
    } catch (error) {
      notificationApi.error({
        message: "Error",
        description: `Failed to fetch brands: ${error.message}`,
      });
    }
  }, [notificationApi]);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const handleDbBrandChange = useCallback((value) => {
    setSelectedDbBrand(value);
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
    setBankMappingLookup(new Map());
    setStartDate(null);
    setEndDate(null);
  }, []);

  // Retrieve user role from localStorage
  const isAdmin = localStorage.getItem("userRole") === "admin";

  const extractNumber = useCallback((str) => {
    if (!str || typeof str !== "string") return "";
    const match = str.match(/(?:#|No\.?)?\s*(\d+)/i);
    return match ? match[1] : "";
  }, []);

  const normalizeString = useCallback((str) => {
    if (!str || typeof str !== "string") return "";
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const normalizeStoreName = useCallback((name) => {
    if (!name || typeof name !== "string") return "";
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ");
  }, []);

  const normalizeColumnName = useCallback((name) => {
    if (!name || typeof name !== "string") return "";
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");
  }, []);

  // Memoized normalized column lookup
  const normalizedColumnLookup = useMemo(() => {
    const lookup = new Map();
    sourceColumns.forEach((col) => {
      const normalized = normalizeColumnName(col);
      lookup.set(normalized, col);
    });
    calculatedColumnNames.forEach((col) => {
      const normalized = normalizeColumnName(col);
      lookup.set(normalized, col);
    });
    emptyColumnNames.forEach((col) => {
      const normalized = normalizeColumnName(col);
      lookup.set(normalized, col);
    });
    return lookup;
  }, [
    sourceColumns,
    calculatedColumnNames,
    emptyColumnNames,
    normalizeColumnName,
  ]);

  const storeNoToStoreName = useMemo(() => {
    const map = new Map();
    storeData.forEach((store) => {
      let noValue = store.NO;
      if (typeof store.NO === "string" && store.NO.startsWith("{")) {
        try {
          const parsedNO = JSON.parse(store.NO.replace(/[-\u001F]+/g, ""));
          noValue = parsedNO || Object.values(parsedNO)[0] || null;
        } catch (e) {
          // Silent fail
        }
      } else if (typeof store.NO === "object" && store.NO !== null) {
        noValue =
          Object.keys(store.NO)[0] || Object.values(store.NO)[0] || null;
      }
      if (noValue != null && store.NAME) {
        const key = noValue.toString().trim();
        if (key && key !== "") {
          map.set(key, store.NAME);
        }
      }
    });
    return map;
  }, [storeData]);

  const storeNameToBm = useMemo(() => {
    const map = new Map();
    bmData.forEach((bm) => {
      const storeNumber = bm.StoreNo ? bm.StoreNo.toString().trim() : "";
      const storeName = storeNoToStoreName.get(storeNumber);
      if (storeName) {
        map.set(storeName, bm);
      }
    });
    return map;
  }, [bmData, storeNoToStoreName]);

  const matchedStoreNames = useMemo(() => {
    if (
      !allData.length ||
      !bmData.length ||
      !sourceColumns.includes("StoreName") ||
      !storeData.length
    ) {
      return [];
    }
    const matched = new Set();
    bmData.forEach((bm) => {
      const storeNumber = bm.StoreNo ? bm.StoreNo.toString().trim() : "";
      const storeName = storeNoToStoreName.get(storeNumber);
      if (storeName) {
        matched.add(storeName);
      }
    });
    const storeNameIndex = sourceColumns.indexOf("StoreName");
    const dataStoreNames = [
      ...new Set(
        allData
          .map((row) => row[storeNameIndex])
          .filter((name) => name && typeof name === "string"),
      ),
    ];
    return [...matched].filter((name) => dataStoreNames.includes(name)).sort();
  }, [allData, bmData, sourceColumns, storeData, storeNoToStoreName]);

  const filteredStates = useMemo(() => {
    if (!bmData.length) return states;
    if (!selectedStoreNames.length && !selectedBrands.length) return states;
    const validStates = new Set();
    bmData.forEach((bm) => {
      const storeNumber = bm.StoreNo ? bm.StoreNo.toString().trim() : "";
      const storeName = storeNoToStoreName.get(storeNumber);
      const storeMatch =
        selectedStoreNames.length === 0 ||
        (storeName && selectedStoreNames.includes(storeName));
      const brandMatch =
        selectedBrands.length === 0 || selectedBrands.includes(bm.Brand);
      if (storeMatch && brandMatch && bm.State) {
        validStates.add(bm.State);
      }
    });
    return states.filter((state) => validStates.has(state)).sort();
  }, [bmData, states, selectedStoreNames, selectedBrands, storeNoToStoreName]);

  const filteredBrands = useMemo(() => {
    if (!bmData.length) return brands;
    if (!selectedStoreNames.length && !selectedStates.length) return brands;
    const validBrands = new Set();
    bmData.forEach((bm) => {
      const storeNumber = bm.StoreNo ? bm.StoreNo.toString().trim() : "";
      const storeName = storeNoToStoreName.get(storeNumber);
      const storeMatch =
        selectedStoreNames.length === 0 ||
        (storeName && selectedStoreNames.includes(storeName));
      const stateMatch =
        selectedStates.length === 0 || selectedStates.includes(bm.State);
      if (storeMatch && stateMatch && bm.Brand) {
        validBrands.add(bm.Brand);
      }
    });
    return brands.filter((brand) => validBrands.has(brand)).sort();
  }, [bmData, brands, selectedStoreNames, selectedStates, storeNoToStoreName]);

  const filteredStoreNames = useMemo(() => {
    if (!bmData.length || !storeNameToBm.size) return matchedStoreNames;
    if (!selectedStates.length && !selectedBrands.length)
      return matchedStoreNames;
    return matchedStoreNames
      .filter((storeName) => {
        const bm = storeNameToBm.get(storeName);
        if (!bm) return false;
        const stateMatch =
          selectedStates.length === 0 || selectedStates.includes(bm.State);
        const brandMatch =
          selectedBrands.length === 0 || selectedBrands.includes(bm.Brand);
        return stateMatch && brandMatch;
      })
      .sort();
  }, [matchedStoreNames, selectedStates, selectedBrands, storeNameToBm]);

  const getPositionMappedData = useCallback(
    (mappingColumn, column, position) => {
      return sourceData.map((row) => {
        const value = row[sourceColumns.indexOf(column)];
        return Array.isArray(value) ? value[position - 1] : value;
      });
    },
    [sourceData, sourceColumns],
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
            date.getTime() + date.getTimezoneOffset() * 60 * 1000,
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
        calculatedColumnIsCustomString,
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
    }, 300),
  ).current;

  const handlePositionMappingChange = useCallback((column, position) => {
    debouncedSetPositionMappings((prev) => ({ ...prev, [column]: position }));
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [filterResponse, storeResponse] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/filter-options`),
        axios.get(`${import.meta.env.VITE_API_URL}/api/store-data`),
      ]);

      const {
        states = [],
        brands = [],
        storeMappings = [],
      } = filterResponse.data || {};
      const { storeData = [] } = storeResponse.data || {};

      if (!states || !brands || !storeMappings || !storeData) {
        throw new Error("Invalid response format: Missing required fields");
      }

      setStates(states.sort());
      setBrands(brands.sort());
      setBmData(storeMappings);
      setStoreData(storeData); // Add this line to set storeData

      // Create bank mapping lookup map
      const lookup = new Map();
      storeData.forEach((store) => {
        if (store.NAME && store.NO) {
          const normalizedName = normalizeStoreName(store.NAME);
          const bmEntry = storeMappings.find(
            (bm) => bm.StoreNo && bm.StoreNo.toString() === store.NO.toString(),
          );
          if (bmEntry && bmEntry.BankCOA) {
            lookup.set(normalizedName, bmEntry.BankCOA);
          }
        }
      });
      setBankMappingLookup(lookup);
    } catch (error) {
      notificationApi.error({
        message: "Error",
        description: `Failed to fetch filter options or store data: ${error.message}`,
      });
    }
  }, [notificationApi, normalizeStoreName]);

  const parseSourceFile = useCallback(
    (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const workbook = XLSX.read(event.target.result, { type: "binary" });
        const data = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
          { header: 1 },
        );
        const headers = data[0] || [];
        const newNormalizedColumnMap = {};
        headers.forEach((header) => {
          const normalized = normalizeColumnName(header);
          newNormalizedColumnMap[normalized] = header;
        });
        setNormalizedColumnMap(newNormalizedColumnMap); // Set directly, no merge
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
        setBankMappingLookup(new Map());
        fetchFilterOptions();
      };
      reader.readAsBinaryString(file);
    },
    [normalizeColumnName, fetchFilterOptions],
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
          .filter((col) => col !== ""),
      );
      setIifHeaderRows(headerRows);
      const headerLine = lines.find(
        (line) => line.startsWith("!TRNS") || line.startsWith("!SPL"),
      );
      if (headerLine) {
        const columns = headerLine
          .split("\t")
          .map((col) => col.trim())
          .filter((col) => col !== "" && !col.startsWith("!"));
        setIifColumns(columns);
        // Reset MEMO mapping sets to prevent stale values
        setMemoMappingSets([
          {
            id: Date.now(),
            memoMappings: {},
            memoMappingType: "Keys",
            memoSourceIifColumn: null,
            memoTargetIifColumn: null,
          },
        ]);
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
    [normalizeStoreName],
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
    [normalizeStoreName],
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
  const addMemoMappingSet = useCallback(() => {
    setMemoMappingSets((prev) => [
      ...prev,
      {
        id: Date.now(),
        memoMappings: {},
        memoMappingType: "Keys",
        memoSourceIifColumn: null,
        memoTargetIifColumn: null,
      },
    ]);
  }, []);

  const removeMemoMappingSet = useCallback(
    (id) => {
      setMemoMappingSets((prev) => {
        if (prev.length === 1) {
          notificationApi.warning({
            message: "Warning",
            description: "Cannot remove the last MEMO mapping set.",
          });
          return prev;
        }
        return prev.filter((set) => set.id !== id);
      });
    },
    [notificationApi],
  );

  const handleMemoMappingsChange = useCallback(
    (id, file) => {
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
        setMemoMappingSets((prev) =>
          prev.map((set) =>
            set.id === id ? { ...set, memoMappings: mappings } : set,
          ),
        );
      };
      reader.readAsBinaryString(file);
    },
    [normalizeStoreName],
  );

  const handleMemoSourceIifColumnChange = useCallback((id, value) => {
    setMemoMappingSets((prev) =>
      prev.map((set) =>
        set.id === id ? { ...set, memoSourceIifColumn: value } : set,
      ),
    );
  }, []);

  const handleMemoTargetIifColumnChange = useCallback(
    (id, value) => {
      setMemoMappingSets((prev) =>
        prev.map((set) =>
          set.id === id ? { ...set, memoTargetIifColumn: value } : set,
        ),
      );
      // Verify state update
      setTimeout(() => {}, 0);
    },
    [memoMappingSets],
  );

  const handleMemoMappingTypeChange = useCallback((id, value) => {
    setMemoMappingSets((prev) =>
      prev.map((set) =>
        set.id === id ? { ...set, memoMappingType: value } : set,
      ),
    );
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

  const handleStateChange = useCallback(
    (value) => {
      setSelectedStates(value);
      if (value.length) {
        const validBrands = new Set();
        const validStores = new Set();
        bmData.forEach((bm) => {
          if (value.includes(bm.State)) {
            const storeNumber = bm.StoreNo ? bm.StoreNo.toString().trim() : "";
            const storeName = storeNoToStoreName.get(storeNumber);
            if (storeName) {
              validStores.add(storeName);
              if (bm.Brand) validBrands.add(bm.Brand);
            }
          }
        });
        setSelectedBrands((prev) =>
          prev.filter((brand) => validBrands.has(brand)),
        );
        setSelectedStoreNames((prev) =>
          prev.filter((store) => validStores.has(store)),
        );
      } else {
        if (!selectedStoreNames.length) {
          setSelectedBrands([]);
          setSelectedStoreNames([]);
        }
      }
    },
    [bmData, selectedStoreNames],
  );

  const handleBrandChange = useCallback(
    (value) => {
      setSelectedBrands(value);
      if (value.length) {
        const validStores = new Set();
        bmData.forEach((bm) => {
          if (value.includes(bm.Brand)) {
            const storeNumber = bm.StoreNo ? bm.StoreNo.toString().trim() : "";
            const storeName = storeNoToStoreName.get(storeNumber);
            if (storeName) validStores.add(storeName);
          }
        });
        setSelectedStoreNames((prev) =>
          prev.filter((store) => validStores.has(store)),
        );
      } else {
        if (!selectedStates.length && !selectedStoreNames.length) {
          setSelectedStoreNames([]);
        }
      }
    },
    [bmData, selectedStates, selectedStoreNames],
  );

  const handleStoreNameChange = useCallback(
    (value) => {
      setSelectedStoreNames(value);
      if (value.length) {
        const validStates = new Set();
        const validBrands = new Set();
        value.forEach((storeName) => {
          const bm = storeNameToBm.get(storeName);
          if (bm) {
            if (bm.State) validStates.add(bm.State);
            if (bm.Brand) validBrands.add(bm.Brand);
          }
        });
        setSelectedStates((prev) =>
          prev.filter((state) => validStates.has(state)),
        );
        setSelectedBrands((prev) =>
          prev.filter((brand) => validBrands.has(brand)),
        );
      } else {
        if (!selectedStates.length) {
          setSelectedBrands([]);
        }
      }
    },
    [bmData, selectedStates],
  );

  const handleEmptyColumnNameChange = useCallback((e) => {
    setEmptyColumnName(e.target.value);
  }, []);

  const handleFetchData = useCallback(() => {
    if (!selectedDbBrand) {
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

    setFetchingData(true);

    axios
      .post(`${import.meta.env.VITE_API_URL}/api/data`, {
        brand: selectedDbBrand,
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
            headers.map((header) => item[header]),
          );
          const newNormalizedColumnMap = {};
          headers.forEach((header) => {
            const normalized = normalizeColumnName(header);
            newNormalizedColumnMap[normalized] = header;
          });
          setNormalizedColumnMap((prev) => ({
            ...prev,
            ...newNormalizedColumnMap,
          }));
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
            description: "No data found for the selected date range and brand.",
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
          setBankMappingLookup(new Map());
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
    selectedDbBrand,
    startDate,
    endDate,
    notificationApi,
    normalizeColumnName,
    fetchFilterOptions,
  ]);

  const filteredData = useMemo(() => {
    if (!allData.length) return allData;
    const hasAnyFilter =
      selectedStates.length > 0 ||
      selectedBrands.length > 0 ||
      selectedStoreNames.length > 0;
    if (!hasAnyFilter) return allData;
    if (!sourceColumns.includes("StoreName") || !storeNameToBm.size) return [];
    const storeNameIndex = sourceColumns.indexOf("StoreName");
    return allData.filter((row) => {
      const storeName = row[storeNameIndex];
      if (!storeName || typeof storeName !== "string") return false;
      const matchedBm = storeNameToBm.get(storeName);
      if (!matchedBm) return false;
      const stateMatch =
        selectedStates.length === 0 || selectedStates.includes(matchedBm.State);
      const brandMatch =
        selectedBrands.length === 0 || selectedBrands.includes(matchedBm.Brand);
      const storeMatch =
        selectedStoreNames.length === 0 ||
        selectedStoreNames.includes(storeName);
      return stateMatch && brandMatch && storeMatch;
    });
  }, [
    allData,
    sourceColumns,
    selectedStates,
    selectedBrands,
    selectedStoreNames,
    storeNameToBm,
  ]);

  const handleApplyFilter = useCallback(() => {
    setSourceData(filteredData);
    setSourceColumns(sourceColumns);
    notificationApi.success({
      message: "Success",
      description:
        filteredData.length === allData.length
          ? "No filters applied. Showing all records."
          : `Filtered ${filteredData.length} records.`,
    });
  }, [filteredData, sourceColumns, notificationApi, allData]);

  const singleMappedColumns = useMemo(() => {
    return Object.keys(valueMappings).filter((column) => {
      const columns = valueMappings[column];
      return columns.length === 1 && column !== "DATE";
    });
  }, [valueMappings]);

  const calculatedMappedColumns = useMemo(() => {
    return Object.keys(valueMappings).filter((column) => {
      const columns = valueMappings[column];
      return columns.some((col) => calculatedColumnNames.includes(col));
    });
  }, [valueMappings, calculatedColumnNames]);

  const emptyMappedColumns = useMemo(() => {
    return Object.keys(valueMappings).filter((column) => {
      const columns = valueMappings[column];
      return columns.some((col) => emptyColumnNames.includes(col));
    });
  }, [valueMappings, emptyColumnNames]);

  const addCalculatedColumn = useCallback(() => {
    if (!calculatedColumn) {
      notificationApi.error({
        message: "Error",
        description: "Please provide a name for the calculated column.",
      });
      return;
    }

    const normalizedCalculatedColumn = normalizeColumnName(calculatedColumn);
    const existingColumn = normalizedColumnLookup.get(
      normalizedCalculatedColumn,
    );

    if (existingColumn && existingColumn !== calculatedColumn) {
      notificationApi.error({
        message: "Error",
        description: `Column name "${calculatedColumn}" conflicts with existing column "${existingColumn}". Please use a unique name.`,
      });
      return;
    }

    if (!selectedColumns.length && !calculatedColumnsFormula) {
      notificationApi.error({
        message: "Error",
        description: "Please select at least one column or provide a formula.",
      });
      return;
    }

    let newData;
    let isCustomString = false;

    if (selectedColumns.length === 1 && !calculatedColumnsFormula) {
      const colIndex = sourceColumns.indexOf(selectedColumns[0]);
      if (colIndex === -1) {
        notificationApi.error({
          message: "Error",
          description: `Column "${selectedColumns[0]}" not found in source data.`,
        });
        return;
      }
      newData = sourceData.map((row) => row[colIndex] ?? "");
      isCustomString = true;
    } else {
      const formula = calculatedColumnsFormula || selectedColumns.join(" ");
      const normalizedSourceColumns = sourceColumns.map((col) =>
        normalizeColumnName(col),
      );

      // Create a list of columns used in the formula
      let formulaCopy = formula;
      const formulaColumns = [];
      sourceColumns.forEach((col) => {
        const escapedCol = col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(
          `(^|[\\s+\\-*/%\\(])\\s*(${escapedCol})\\s*([\\s+\\-*/%\\)]|$)`,
          "gi",
        );
        if (regex.test(formulaCopy)) {
          formulaColumns.push(col);
        }
      });

      isCustomString = formulaColumns.length === 0;

      if (isCustomString) {
        if (!formula) {
          notificationApi.error({
            message: "Error",
            description: "Please provide a formula for the calculated column.",
          });
          return;
        }
        newData = sourceData.map(() => formula);
      } else {
        newData = sourceData.map((row, rowIndex) => {
          try {
            let expression = formula;
            let isValid = true;

            // Replace column names with their values
            formulaColumns.forEach((col) => {
              const colIndex = sourceColumns.indexOf(col);
              if (colIndex === -1) {
                throw new Error(
                  `Column "${col}" not found in source data at row ${rowIndex}`,
                );
              }
              let value = row[colIndex];

              if (value === null || value === undefined || value === "") {
                value = 0;
              } else if (typeof value === "string") {
                const cleanedValue = value.replace(/[^0-9.-]/g, "");
                const parsedValue = parseFloat(cleanedValue);
                if (
                  isNaN(parsedValue) ||
                  !cleanedValue.match(/^-?\d*\.?\d*$/)
                ) {
                  value = 0;
                  isValid = false;
                } else {
                  value = parsedValue;
                }
              }

              const escapedCol = col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const regex = new RegExp(
                `(^|[\\s+\\-*/%\\(])\\s*(${escapedCol})\\s*([\\s+\\-*/%\\)]|$)`,
                "gi",
              );
              expression = expression.replace(regex, `$1${value}$3`);
            });

            if (!isValid || !expression.match(/^[0-9+\-*/().\s]+$/)) {
              throw new Error(
                `Invalid formula syntax: "${expression}" at row ${rowIndex}`,
              );
            }

            const result =
              calculationType === "Answer" ? eval(expression) : expression;

            if (
              calculationType === "Answer" &&
              (isNaN(result) || !isFinite(result))
            ) {
              throw new Error(
                `Formula evaluation resulted in invalid number: "${result}" at row ${rowIndex}`,
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
    }

    // Update normalized column map
    setNormalizedColumnMap((prev) => ({
      ...prev,
      [normalizedCalculatedColumn]: calculatedColumn,
    }));

    // Add to calculatedColumnNames if not in sourceColumns
    if (!sourceColumns.includes(calculatedColumn)) {
      setCalculatedColumnNames((prev) =>
        prev.includes(calculatedColumn) ? prev : [...prev, calculatedColumn],
      );
    }

    const newSourceColumns = sourceColumns.includes(calculatedColumn)
      ? sourceColumns
      : [...sourceColumns, calculatedColumn];
    const newSourceData = sourceData.map((row, index) => [
      ...row,
      newData[index],
    ]);

    setCalculatedColumnTypes((prev) => ({
      ...prev,
      [calculatedColumn]: isCustomString ? "Formula" : calculationType,
    }));
    setCalculatedColumnIsCustomString((prev) => ({
      ...prev,
      [calculatedColumn]: isCustomString,
    }));
    setSourceColumns(newSourceColumns);
    setSourceData(newSourceData);

    // Save calculated column definition with selectedColumns
    setCalculatedColumnDefinitions((prev) => [
      ...prev,
      {
        name: calculatedColumn,
        formula: calculatedColumnsFormula || selectedColumns.join(" "),
        selectedColumns: [...selectedColumns],
        calculationType: isCustomString ? "Formula" : calculationType,
      },
    ]);

    setCalculatedColumn("");
    setCalculatedColumnsFormula("");
    setSelectedColumns([]);
    notificationApi.success({
      message: "Success",
      description: "Calculated column added successfully.",
    });
  }, [
    calculatedColumn,
    calculatedColumnsFormula,
    calculationType,
    sourceColumns,
    sourceData,
    selectedColumns,
    notificationApi,
    normalizeColumnName,
    normalizedColumnLookup,
    calculatedColumnNames,
  ]);

  const addIifColumn = useCallback(() => {
    if (!newIifColumnName) {
      notificationApi.error({
        message: "Error",
        description: "Please provide a name for the new IIF column.",
      });
      return;
    }

    const normalizedNewColumn = normalizeColumnName(newIifColumnName);
    if (iifColumns.includes(newIifColumnName)) {
      notificationApi.error({
        message: "Error",
        description: `Column "${newIifColumnName}" already exists in the IIF template.`,
      });
      return;
    }

    // Add column to iifColumns at second-to-last position
    const newIifColumns = [...iifColumns];
    newIifColumns.splice(iifColumns.length - 1, 0, newIifColumnName);
    setIifColumns(newIifColumns);

    // Add column to iifHeaderRows at second-to-last position
    const newIifHeaderRows = iifHeaderRows.map((row) => {
      const newRow = [...row];
      newRow.splice(row.length - 1, 0, newIifColumnName);
      return newRow;
    });
    setIifHeaderRows(newIifHeaderRows);

    setNewIifColumnName("");
    notificationApi.success({
      message: "Success",
      description: `IIF column "${newIifColumnName}" added successfully.`,
    });
  }, [
    newIifColumnName,
    iifColumns,
    iifHeaderRows,
    normalizeColumnName,
    notificationApi,
  ]);

  // Add this function near other utility functions like normalizeString
  const getMinKeyValuePairs = (
    data,
    sourceColumns,
    nonZeroColumns = [],
    excludedFields = [],
  ) => {
    if (!data.length || !sourceColumns.length) return 1; // Default to 1 if no data or columns
    return data.reduce((min, row) => {
      // Create an object from row array using sourceColumns
      const rowObject = row.reduce((obj, value, index) => {
        obj[sourceColumns[index]] = value;
        return obj;
      }, {});
      // Count keys, considering nonZeroColumns and excluding specified fields
      const count = Object.keys(rowObject).filter((key) => {
        if (excludedFields.includes(key)) return false; // Skip excluded fields
        if (nonZeroColumns.includes(key)) {
          // For nonZeroColumns, only count if value is non-zero
          const value = rowObject[key];
          return value !== undefined && value !== null && value !== 0;
        }
        // For other columns, count if key exists
        return true;
      }).length;
      return Math.min(min, count);
    }, Infinity);
  };
  const minPairs = useMemo(
    () =>
      getMinKeyValuePairs(sourceData, sourceColumns, nonZeroColumns, [
        "_id",
        "StoreName",
        "Date",
        "Accumulated",
      ]),
    [sourceData, sourceColumns, nonZeroColumns],
  );
  const addEmptyColumn = useCallback(() => {
    if (!emptyColumnName) {
      notificationApi.error({
        message: "Error",
        description: "Please provide a name for the empty column.",
      });
      return;
    }

    const normalizedEmptyColumn = normalizeColumnName(emptyColumnName);
    const existingColumn = normalizedColumnLookup.get(normalizedEmptyColumn);

    if (existingColumn && existingColumn !== emptyColumnName) {
      notificationApi.error({
        message: "Error",
        description: `Column name "${emptyColumnName}" conflicts with existing column "${existingColumn}". Please use a unique name.`,
      });
      return;
    }

    const newSourceColumns = [...sourceColumns, emptyColumnName];
    const newSourceData = sourceData.map((row) => [...row, ""]);
    setNormalizedColumnMap({
      [normalizedEmptyColumn]: emptyColumnName,
    });
    setSourceColumns(newSourceColumns);
    setSourceData(newSourceData);
    setEmptyColumnNames((prev) => [...prev, emptyColumnName]);
    setEmptyColumnName("");
    notificationApi.success({
      message: "Success",
      description: "Empty column added successfully.",
    });
  }, [
    emptyColumnName,
    sourceColumns,
    sourceData,
    notificationApi,
    normalizeColumnName,
    normalizedColumnLookup,
  ]);

  // Fetch formats from database
  const fetchFormats = useCallback(async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/formats`,
      );
      if (response.data && Array.isArray(response.data)) {
        setFormats(response.data);
      } else {
        throw new Error(
          "Invalid response format: Expected an array of formats",
        );
      }
    } catch (error) {
      notificationApi.error({
        message: "Error",
        description: `Failed to fetch formats: ${error.message}`,
      });
    }
  }, [notificationApi]);

  // Fetch formats when component mounts
  useEffect(() => {
    fetchFormats();
  }, [fetchFormats]);

  // Apply selected format
  const applyFormat = useCallback(
    (format) => {
      if (!format) return;

      // Clear existing calculated columns from source data
      const calcColNames =
        format.calculatedColumns?.map((col) => col.name) || [];
      const indicesToRemove = sourceColumns
        .map((col, idx) => (calculatedColumnNames.includes(col) ? idx : -1))
        .filter((idx) => idx !== -1)
        .sort((a, b) => b - a);
      let tempSourceColumns = [...sourceColumns];
      let tempSourceData = sourceData.map((row) => [...row]);

      indicesToRemove.forEach((idx) => {
        tempSourceColumns.splice(idx, 1);
        tempSourceData = tempSourceData.map((row) => {
          const newRow = [...row];
          newRow.splice(idx, 1);
          return newRow;
        });
      });

      // Apply format states
      setKeyMappings(format.keyMappings || {});
      setValueMappings(format.valueMappings || {});
      setSelectedColumns(format.selectedColumns || []);
      setNonZeroColumns(format.nonZeroColumns || []);
      setPositionMappings(format.positionMappings || {});
      setCalculationType(format.calculationType || "Answer");
      setCalculatedColumnTypes(format.calculatedColumnTypes || {});
      setCalculatedColumnIsCustomString(
        format.calculatedColumnIsCustomString || {},
      );
      setCalculatedColumnNames(calcColNames);
      setEmptyColumnNames(format.emptyColumnNames || []);
      setCoaTargetIifColumn(format.coaTargetIifColumn || null);
      setBankTargetIifColumn(format.bankTargetIifColumn || null);
      setStoreSplitIifColumn(format.storeSplitIifColumn || null);
      setMemoMappingSets(
        format.memoMappingSets?.length
          ? format.memoMappingSets.map((set) => ({
              ...set,
              id: Date.now() + Math.random(), // Ensure unique IDs
            }))
          : [
              {
                id: Date.now(),
                memoMappings: {},
                memoMappingType: "Keys",
                memoSourceIifColumn: null,
                memoTargetIifColumn: null,
              },
            ],
      );
      setSelectedStates(format.selectedStates || []);
      setSelectedBrands(format.selectedBrands || []);
      setSelectedStoreNames(format.selectedStoreNames || []);
      setNormalizedColumnMap(format.normalizedColumnMap || {});
      setCalculatedColumnDefinitions(format.calculatedColumns || []);

      // Recreate calculated columns
      if (format.calculatedColumns?.length > 0 && sourceData.length > 0) {
        format.calculatedColumns.forEach((calcCol) => {
          const normalizedCalcCol = normalizeColumnName(calcCol.name);
          const existingColumn = normalizedColumnLookup.get(normalizedCalcCol);

          if (existingColumn && existingColumn !== calcCol.name) {
            notificationApi.warning({
              message: "Warning",
              description: `Calculated column "${calcCol.name}" conflicts with existing column "${existingColumn}". Skipping.`,
            });
            return;
          }

          let newData;
          let isCustomString = false;

          if (calcCol.selectedColumns?.length === 1 && !calcCol.formula) {
            const colIndex = tempSourceColumns.indexOf(
              calcCol.selectedColumns[0],
            );
            if (colIndex === -1) {
              notificationApi.warning({
                message: "Warning",
                description: `Column "${calcCol.selectedColumns[0]}" not found in source data. Skipping calculated column "${calcCol.name}".`,
              });
              return;
            }
            newData = tempSourceData.map((row) => row[colIndex] ?? "");
            isCustomString = true;
          } else {
            const formula =
              calcCol.formula || calcCol.selectedColumns?.join(" ") || "";
            const normalizedSourceColumns = tempSourceColumns.map((col) =>
              col.trim().toLowerCase(),
            );
            const columns = formula
              .split(/([-+*/()])/)
              .map((part) => part.trim())
              .filter((part) => part && !/[-+*/()]/.test(part))
              .map((col) => col.toLowerCase());

            isCustomString = !columns.some((col) =>
              normalizedSourceColumns.includes(col),
            );

            if (isCustomString) {
              if (!formula) {
                notificationApi.warning({
                  message: "Warning",
                  description: `No formula provided for calculated column "${calcCol.name}". Skipping.`,
                });
                return;
              }
              newData = tempSourceData.map(() => formula);
            } else {
              newData = tempSourceData.map((row, rowIndex) => {
                try {
                  let formulaCopy = formula.toLowerCase();
                  let isValid = true;

                  columns.forEach((col) => {
                    const colIndex = normalizedSourceColumns.indexOf(col);
                    if (colIndex === -1) {
                      throw new Error(
                        `Column "${col}" not found in source data at row ${rowIndex}`,
                      );
                    }
                    let value = row[colIndex];

                    if (value === null || value === undefined || value === "") {
                      value = 0;
                    } else if (typeof value === "string") {
                      const cleanedValue = value.replace(/[^0-9.-]/g, "");
                      const parsedValue = parseFloat(cleanedValue);
                      if (
                        isNaN(parsedValue) ||
                        !cleanedValue.match(/^-?\d*\.?\d*$/)
                      ) {
                        value = 0;
                        isValid = false;
                      } else {
                        value = parsedValue;
                      }
                    }

                    const escapedCol = col.replace(
                      /[.*+?^${}()|[\]\\#]/g,
                      "\\$&",
                    );
                    formulaCopy = formulaCopy.replace(
                      new RegExp(escapedCol, "g"),
                      value,
                    );
                  });

                  if (!isValid || !formulaCopy.match(/^[0-9+\-*/().\s]+$/)) {
                    throw new Error(
                      `Invalid formula syntax: "${formulaCopy}" at row ${rowIndex}`,
                    );
                  }

                  const result =
                    calcCol.calculationType === "Answer"
                      ? eval(formulaCopy)
                      : formulaCopy;

                  if (
                    calcCol.calculationType === "Answer" &&
                    (isNaN(result) || !isFinite(result))
                  ) {
                    throw new Error(
                      `Formula evaluation resulted in invalid number: "${result}" at row ${rowIndex}`,
                    );
                  }

                  return result;
                } catch (error) {
                  notificationApi.warning({
                    message: "Warning",
                    description: `Error calculating value for row ${
                      rowIndex + 1
                    } in column "${calcCol.name}": ${error.message}. Using 0.`,
                  });
                  return 0;
                }
              });
            }
          }

          // Update source columns and data
          if (!tempSourceColumns.includes(calcCol.name)) {
            tempSourceColumns = [...tempSourceColumns, calcCol.name];
          }
          tempSourceData = tempSourceData.map((row, index) => [
            ...row,
            newData[index],
          ]);

          // Update calculated column states
          setCalculatedColumnTypes((prev) => ({
            ...prev,
            [calcCol.name]: isCustomString
              ? "Formula"
              : calcCol.calculationType,
          }));
          setCalculatedColumnIsCustomString((prev) => ({
            ...prev,
            [calcCol.name]: isCustomString,
          }));
        });

        // Apply updated columns and data
        setSourceColumns(tempSourceColumns);
        setSourceData(tempSourceData);

        // Update normalized column map
        const newNormalizedColumnMap = {};
        tempSourceColumns.forEach((col) => {
          const normalized = normalizeColumnName(col);
          newNormalizedColumnMap[normalized] = col;
        });
        setNormalizedColumnMap((prev) => ({
          ...prev,
          ...newNormalizedColumnMap,
        }));
      }

      setIsFormatModified(false);
      notificationApi.success({
        message: "Success",
        description: `Format "${format.name}" applied successfully.`,
      });
    },
    [
      notificationApi,
      sourceColumns,
      sourceData,
      calculatedColumnNames,
      normalizedColumnLookup,
      normalizeColumnName,
    ],
  );

  // Handle format selection
  const handleFormatChange = useCallback(
    (formatId) => {
      const format = formats.find((f) => f._id === formatId);
      setSelectedFormat(formatId);
      setFormatName(format ? format.name : "");
      if (format) {
        applyFormat(format);
      } else {
        // Reset to default state if no format is selected
        setKeyMappings({});
        setValueMappings({});
        setSelectedColumns([]);
        setNonZeroColumns([]);
        setPositionMappings({});
        setCalculationType("Answer");
        setCalculatedColumnTypes({});
        setCalculatedColumnIsCustomString({});
        setCalculatedColumnNames([]);
        setEmptyColumnNames([]);
        setCoaTargetIifColumn(null);
        setBankTargetIifColumn(null);
        setStoreSplitIifColumn(null);
        setMemoMappingSets([
          {
            id: Date.now(),
            memoMappings: {},
            memoMappingType: "Keys",
            memoSourceIifColumn: null,
            memoTargetIifColumn: null,
          },
        ]);
        setSelectedStates([]);
        setSelectedBrands([]);
        setSelectedStoreNames([]);
        setNormalizedColumnMap({});
        setIsFormatModified(false);
      }
    },
    [formats, applyFormat],
  );

  // Track changes to mappings and calculated columns
  useEffect(() => {
    if (selectedFormat) {
      const format = formats.find((f) => f._id === selectedFormat);
      if (format) {
        const hasChanges =
          JSON.stringify(keyMappings) !==
            JSON.stringify(format.keyMappings || {}) ||
          JSON.stringify(valueMappings) !==
            JSON.stringify(format.valueMappings || {}) ||
          JSON.stringify(selectedColumns) !==
            JSON.stringify(format.selectedColumns || []) ||
          JSON.stringify(nonZeroColumns) !==
            JSON.stringify(format.nonZeroColumns || []) ||
          JSON.stringify(positionMappings) !==
            JSON.stringify(format.positionMappings || {}) ||
          calculationType !== (format.calculationType || "Answer") ||
          JSON.stringify(calculatedColumnTypes) !==
            JSON.stringify(format.calculatedColumnTypes || {}) ||
          JSON.stringify(calculatedColumnIsCustomString) !==
            JSON.stringify(format.calculatedColumnIsCustomString || {}) ||
          JSON.stringify(calculatedColumnNames) !==
            JSON.stringify(format.calculatedColumnNames || []) ||
          JSON.stringify(emptyColumnNames) !==
            JSON.stringify(format.emptyColumnNames || []) ||
          coaTargetIifColumn !== (format.coaTargetIifColumn || null) ||
          bankTargetIifColumn !== (format.bankTargetIifColumn || null) ||
          storeSplitIifColumn !== (format.storeSplitIifColumn || null) ||
          JSON.stringify(memoMappingSets) !==
            JSON.stringify(format.memoMappingSets || []) ||
          JSON.stringify(selectedStates) !==
            JSON.stringify(format.selectedStates || []) ||
          JSON.stringify(selectedBrands) !==
            JSON.stringify(format.selectedBrands || []) ||
          JSON.stringify(selectedStoreNames) !==
            JSON.stringify(format.selectedStoreNames || []) ||
          JSON.stringify(normalizedColumnMap) !==
            JSON.stringify(format.normalizedColumnMap || {});
        setIsFormatModified(hasChanges);
      }
    }
  }, [
    keyMappings,
    valueMappings,
    selectedColumns,
    nonZeroColumns,
    positionMappings,
    calculationType,
    calculatedColumnTypes,
    calculatedColumnIsCustomString,
    calculatedColumnNames,
    emptyColumnNames,
    coaTargetIifColumn,
    bankTargetIifColumn,
    storeSplitIifColumn,
    memoMappingSets,
    selectedStates,
    selectedBrands,
    selectedStoreNames,
    normalizedColumnMap,
    selectedFormat,
    formats,
  ]);

  // Save or update format in database
  const saveFormat = useCallback(
    async (overrideFormatId = null) => {
      if (!formatName) {
        notificationApi.error({
          message: "Error",
          description: "Please provide a format name.",
        });
        return false;
      }

      const formatData = {
        name: formatName,
        keyMappings,
        valueMappings,
        selectedColumns,
        nonZeroColumns,
        positionMappings,
        calculationType,
        calculatedColumnTypes,
        calculatedColumnIsCustomString,
        calculatedColumnNames,
        emptyColumnNames,
        coaTargetIifColumn,
        bankTargetIifColumn,
        storeSplitIifColumn,
        memoMappingSets,
        selectedStates,
        selectedBrands,
        selectedStoreNames,
        normalizedColumnMap,
        calculatedColumns: calculatedColumnDefinitions.map((col) => ({
          name: col.name,
          formula: col.formula,
          selectedColumns: col.selectedColumns || [],
          calculationType: col.calculationType,
        })),
      };

      try {
        const existingFormat = formats.find((f) => f.name === formatName);
        if (
          existingFormat &&
          existingFormat._id !== selectedFormat &&
          !overrideFormatId
        ) {
          setPendingFormatData(formatData);
          setExistingFormatId(existingFormat._id);
          setShowOverwriteModal(true);
          return false;
        }

        if (
          selectedFormat &&
          existingFormat?._id === selectedFormat &&
          !overrideFormatId
        ) {
          await axios.put(
            `${import.meta.env.VITE_API_URL}/api/formats/${selectedFormat}`,
            formatData,
          );
          notificationApi.success({
            message: "Success",
            description: `Format "${formatName}" updated successfully.`,
          });
        } else {
          const endpoint = overrideFormatId
            ? `${import.meta.env.VITE_API_URL}/api/formats/${overrideFormatId}`
            : `${import.meta.env.VITE_API_URL}/api/formats`;
          const method = overrideFormatId ? axios.put : axios.post;
          const response = await method(endpoint, formatData);
          const newFormat = response.data;
          setFormats((prev) =>
            overrideFormatId
              ? prev.map((f) => (f._id === overrideFormatId ? newFormat : f))
              : [...prev, newFormat],
          );
          setSelectedFormat(newFormat._id);
          notificationApi.success({
            message: "Success",
            description: `Format "${formatName}" ${
              overrideFormatId ? "updated" : "saved"
            } successfully.`,
          });
        }
        await fetchFormats();
        setIsFormatModified(false);
        return true;
      } catch (error) {
        if (
          error.response?.status === 400 &&
          error.response?.data?.message.includes("already exists")
        ) {
          setPendingFormatData(formatData);
          setExistingFormatId(error.response.data._id);
          setShowOverwriteModal(true);
          return false;
        }
        notificationApi.error({
          message: "Error",
          description: `Failed to save format: ${error.message}`,
        });
        return false;
      }
    },
    [
      formatName,
      keyMappings,
      valueMappings,
      selectedColumns,
      nonZeroColumns,
      positionMappings,
      calculationType,
      calculatedColumnTypes,
      calculatedColumnIsCustomString,
      calculatedColumnNames,
      emptyColumnNames,
      coaTargetIifColumn,
      bankTargetIifColumn,
      storeSplitIifColumn,
      memoMappingSets,
      selectedStates,
      selectedBrands,
      selectedStoreNames,
      normalizedColumnMap,
      calculatedColumnDefinitions,
      formats,
      selectedFormat,
      notificationApi,
      fetchFormats,
    ],
  );

  const handleOverwriteConfirm = useCallback(async () => {
    if (pendingFormatData && existingFormatId) {
      await saveFormat(existingFormatId);
      setShowOverwriteModal(false);
      setPendingFormatData(null);
      setExistingFormatId(null);
      return true;
    }
    return false;
  }, [pendingFormatData, existingFormatId, saveFormat]);

  const handleOverwriteCancel = useCallback(() => {
    setShowOverwriteModal(false);
    setPendingFormatData(null);
    setExistingFormatId(null);
    notificationApi.info({
      message: "Info",
      description: "Format save cancelled.",
    });
  }, [notificationApi]);

  const downloadMappedData = useCallback(async () => {
    // Validate required data
    if (!sourceData.length || !Object.keys(keyMappings).length) {
      notificationApi.error({
        message: "Error",
        description: "No source data or key mappings provided.",
      });
      return;
    }

    // Use a temporary format name if none provided, but don't save to database
    let effectiveFormatName = formatName;
    if (!effectiveFormatName) {
      effectiveFormatName = "Format_" + moment().format("YYYYMMDD_HHmmss");
    }

    // Save or update format only if formatName is provided
    if (formatName) {
      try {
        const saved = await saveFormat();
        if (!saved) {
          return;
        }
      } catch (error) {
        notificationApi.error({
          message: "Error",
          description:
            "Failed to save format: " + (error.message || "Unknown error"),
        });
        return;
      }
    }

    setDownloading(true);

    try {
      const chunkSize = 1000;
      const allMappedData = [];

      // Process data in chunks
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
          calculatedColumnIsCustomString,
        );
        mappedChunk.forEach(function (rowGroup, chunkIndex) {
          const originalIndex = i + chunkIndex;
          rowGroup.forEach(function (row) {
            row.sourceRowIndex = originalIndex;
          });
        });
        allMappedData.push(...mappedChunk);
      }

      const flattenedData = allMappedData.flat();
      const filledData = fillMissingDates(flattenedData);
      const convertedData = convertDates(filledData);

      // Validate store split column
      const storeSplitSourceColumn = valueMappings[storeSplitIifColumn]
        ? valueMappings[storeSplitIifColumn][0]
        : null;
      if (!storeSplitSourceColumn) {
        notificationApi.error({
          message: "Error",
          description:
            "No source column mapped to " +
            (storeSplitIifColumn || "undefined") +
            ". Cannot split by store.",
        });
        return;
      }

      // Group data by store
      const groupedByStore = {};
      allMappedData.forEach(function (rowGroup, rowIndex) {
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
      const totalColumns = iifHeaderRows[0] ? iifHeaderRows[0].length : 0;

      // Determine if we need to organize by state
      const organizeByState = selectedStates.length > 0;

      // Map stores to their states
      const storeToStateMap = new Map();
      if (organizeByState) {
        bmData.forEach((bm) => {
          if (bm.Name && bm.State) {
            storeToStateMap.set(bm.Name, bm.State);
          }
        });
      }

      // Generate IIF files for each store
      const storeNames = Object.keys(groupedByStore);
      for (let j = 0; j < storeNames.length; j++) {
        const storeName = storeNames[j];
        let storeGroups = groupedByStore[storeName];

        storeGroups = storeGroups.map(function (group) {
          return group.map(function (row) {
            const updatedRow = { ...row };

            // Handle MEMO mapping
            memoMappingSets.forEach((set, index) => {
              const {
                memoSourceIifColumn,
                memoTargetIifColumn,
                memoMappings,
                memoMappingType,
              } = set;

              let originalMemoValue = null;
              if (
                memoSourceIifColumn &&
                memoTargetIifColumn &&
                updatedRow[memoSourceIifColumn] !== undefined
              ) {
                originalMemoValue = updatedRow[memoSourceIifColumn];
              }

              if (
                originalMemoValue &&
                typeof originalMemoValue === "string" &&
                originalMemoValue.trim() !== ""
              ) {
                const normalizedMemoValue =
                  normalizeStoreName(originalMemoValue);
                const matchedKey = Object.keys(memoMappings).find(
                  (key) => normalizeStoreName(key) === normalizedMemoValue,
                );
                if (matchedKey) {
                  let memoValue;
                  if (memoMappingType === "Keys") {
                    memoValue = memoMappings[matchedKey];
                  } else if (memoMappingType === "Values") {
                    const mappedColumnName = memoMappings[matchedKey];
                    const normalizedMappedColumn =
                      normalizeColumnName(mappedColumnName);
                    const columnIndex = sourceColumns.findIndex(
                      (col) =>
                        normalizeColumnName(col) === normalizedMappedColumn,
                    );
                    if (columnIndex !== -1) {
                      const sourceRowIndex = row.sourceRowIndex;
                      memoValue =
                        sourceRowIndex !== undefined &&
                        sourceData[sourceRowIndex]
                          ? sourceData[sourceRowIndex][columnIndex]
                          : "";
                    } else {
                      memoValue = "";
                    }
                  } else if (memoMappingType === "Both") {
                    const mappedColumnName = memoMappings[matchedKey];
                    const normalizedMappedColumn =
                      normalizeColumnName(mappedColumnName);
                    const columnIndex = sourceColumns.findIndex(
                      (col) =>
                        normalizeColumnName(col) === normalizedMappedColumn,
                    );
                    if (columnIndex !== -1) {
                      const sourceRowIndex = row.sourceRowIndex;
                      memoValue =
                        sourceRowIndex !== undefined &&
                        sourceData[sourceRowIndex]
                          ? sourceData[sourceRowIndex][columnIndex]
                          : memoMappings[matchedKey];
                    } else {
                      memoValue = memoMappings[matchedKey];
                    }
                  }

                  if (memoValue && iifColumns.includes(memoTargetIifColumn)) {
                    const currentMemo = updatedRow[memoTargetIifColumn] || "";
                    updatedRow[memoTargetIifColumn] = currentMemo
                      ? `${currentMemo} ${memoValue}`
                      : memoValue;
                  } else if (!iifColumns.includes(memoTargetIifColumn)) {
                    notificationApi.warning({
                      message: "Warning",
                      description: `Target MEMO column "${memoTargetIifColumn}" in MEMO mapping set ${
                        index + 1
                      } not found in IIF template. MEMO mapping will be skipped.`,
                    });
                  }
                }
              }
            });

            // Apply COA mappings
            if (
              coaTargetIifColumn &&
              updatedRow[coaTargetIifColumn] !== undefined
            ) {
              const value = updatedRow[coaTargetIifColumn];
              if (typeof value === "string") {
                const normalizedValue = normalizeStoreName(value);
                const originalKeys = Object.keys(coaMappings);
                for (let k = 0; k < originalKeys.length; k++) {
                  const key = originalKeys[k];
                  const normalizedKey = normalizeStoreName(key);
                  if (normalizedValue === normalizedKey) {
                    updatedRow[coaTargetIifColumn] = coaMappings[key];
                    break;
                  }
                }
              }
            }

            // Apply bank mappings
            if (
              bankTargetIifColumn &&
              updatedRow[bankTargetIifColumn] !== undefined
            ) {
              let value = updatedRow[bankTargetIifColumn];
              value = value != null ? value.toString().trim() : "";
              if (value !== "") {
                const normalizedValue = normalizeStoreName(value);
                const mappedValue = bankMappingLookup.get(normalizedValue);
                if (mappedValue) {
                  updatedRow[bankTargetIifColumn] = mappedValue;
                }
              }
            }

            delete updatedRow.sourceRowIndex;
            return updatedRow;
          });
        });

        let storeWorksheetData = iifHeaderRows.concat([["!ENDTRNS"]]);

        storeGroups.forEach(function (group) {
          if (group.length === 0) return;

          const firstRow = group[0];
          const trnsRow = Array(totalColumns).fill("");
          trnsRow[0] = "TRNS";
          iifColumns.forEach(function (col, colIndex) {
            trnsRow[colIndex + 1] =
              firstRow[col] !== undefined ? firstRow[col] : "";
          });
          storeWorksheetData.push(trnsRow);

          for (let i = 1; i < group.length; i++) {
            const splRow = Array(totalColumns).fill("");
            splRow[0] = "SPL";
            iifColumns.forEach(function (col, colIndex) {
              splRow[colIndex + 1] =
                group[i][col] !== undefined ? group[i][col] : "";
            });
            storeWorksheetData.push(splRow);
          }

          const endRow = Array(totalColumns).fill("");
          endRow[0] = "ENDTRNS";
          storeWorksheetData.push(endRow);
        });

        const iifContent = storeWorksheetData
          .map(function (row) {
            return row.join("\t");
          })
          .join("\n");
        const sanitizedStoreName = storeName.replace(/[^a-zA-Z0-9-_ ]/g, "_");
        const fileName = sanitizedStoreName + ".iif";

        if (organizeByState) {
          // Get the state for this store
          const state = storeToStateMap.get(storeName) || "Unknown";
          // Sanitize state name for folder
          const sanitizedState = state.replace(/[^a-zA-Z0-9-_ ]/g, "_");
          // Create or get state folder in zip
          const stateFolder = zip.folder(sanitizedState);
          // Add IIF file to state folder
          stateFolder.file(fileName, iifContent);
        } else {
          // Add IIF file directly to zip root
          zip.file(fileName, iifContent);
        }
      }

      // Generate and download zip file
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(content);
      link.setAttribute("href", url);
      link.setAttribute("download", "store_iif_files.zip");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notificationApi.success({
        message: "Success",
        description: "Mapped data downloaded successfully.",
      });
    } catch (error) {
      notificationApi.error({
        message: "Error",
        description:
          "Failed to download mapped data: " +
          (error.message || "Unknown error"),
      });
    } finally {
      setDownloading(false);
    }
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
    bankMappingLookup,
    memoMappingSets,
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
    extractNumber,
    formatName,
    saveFormat,
    selectedStates,
    bmData,
  ]);

  // Update UI to reflect normalized column mappings
  const normalizedSourceColumns = useMemo(() => {
    return sourceColumns.map(
      (col) => normalizedColumnLookup.get(normalizeColumnName(col)) || col,
    );
  }, [sourceColumns, normalizedColumnLookup, normalizeColumnName]);

  return (
    <>
      {contextHolder}
      <Modal
        title="Format Name Conflict"
        open={showOverwriteModal}
        onOk={handleOverwriteConfirm}
        onCancel={handleOverwriteCancel}
        okText="Overwrite"
        cancelText="Cancel"
      >
        <p>
          A format named "{formatName}" already exists. Do you want to overwrite
          it?
        </p>
      </Modal>
      <section>
        <div className="container">
          <div className="space-y-4">
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <IMCard>
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <label className="selectLabel" htmlFor="DbBrandSelect">
                        Select Brand
                      </label>
                      <Select
                        id="DbBrandSelect"
                        value={selectedDbBrand}
                        className="mb-3"
                        onChange={handleDbBrandChange}
                        placeholder="Select a Brand"
                        style={{ width: "100%" }}
                        showSearch
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                          option.children
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        allowClear
                      >
                        {availableBrands.map((brand) => (
                          <Select.Option
                            key={`db-brand-${brand}`}
                            value={brand}
                          >
                            {brand}
                          </Select.Option>
                        ))}
                      </Select>
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
                        disabled={fetchingData || !selectedDbBrand} // Replace disabled={fetchingData} with this
                      >
                        {fetchingData ? <Spin size="small" /> : "Get Data"}
                      </IMButton>
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
                                onClick={() =>
                                  setSelectedStates(filteredStates)
                                }
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
                        {filteredStates.map((state) => (
                          <Select.Option key={`state-${state}`} value={state}>
                            {state}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                    {/* <Col span={8}>
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
                                onClick={() =>
                                  setSelectedBrands(filteredBrands)
                                }
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
                        {filteredBrands.map((brand) => (
                          <Select.Option key={`brand-${brand}`} value={brand}>
                            {brand}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col> */}
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
                                  setSelectedStoreNames(filteredStoreNames)
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
                        {filteredStoreNames.map((store) => (
                          <Select.Option key={`store-${store}`} value={store}>
                            {store}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                    <Col className="apply-filter-button-wrap" span={8}>
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
                  extra={
                    isAdmin && (
                      <IMPopover
                        className={"mapping-popver"}
                        content={
                          <>
                            <p>
                              <strong>
                                Select the IIF column (COA Mapping):
                              </strong>{" "}
                              <br />
                              Choose the column where you'll map the original
                              COA names.
                            </p>
                            <p>
                              <strong>
                                Select the IIF column (Bank Mapping):
                              </strong>{" "}
                              <br />
                              Choose the column where you'll map the original
                              bank names.
                            </p>
                            <p>
                              <strong>
                                Select the IIF column (Store Splitting):
                              </strong>{" "}
                              <br />
                              Choose the column where you'll map the store
                              names.
                            </p>
                          </>
                        }
                      />
                    )
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
                    {isAdmin && (
                      <>
                        <Col span={8}>
                          <label
                            className="selectLabel"
                            htmlFor="COAMappingSelect"
                          >
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
                            placeholder={
                              "Select the IIF column (Store Splitting)"
                            }
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
                      </>
                    )}

                    <Col span={24}>
                      <label className="selectLabel" htmlFor="FormatSelect">
                        Select Format
                      </label>
                      <IMSelect
                        id={"FormatSelect"}
                        value={selectedFormat}
                        handleChange={handleFormatChange}
                        placeholder={"Select a Format"}
                        disabled={!formats.length}
                        style={{ width: "100%" }}
                      >
                        {formats.map((format) => (
                          <Select.Option
                            key={`format-${format._id}`}
                            value={format._id}
                          >
                            {format.name}
                          </Select.Option>
                        ))}
                      </IMSelect>
                    </Col>
                    <Col span={24}>
                      <label
                        className="selectLabel"
                        htmlFor="NewIifColumnInput"
                      >
                        Add New IIF Column
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <Input
                          id="NewIifColumnInput"
                          value={newIifColumnName}
                          onChange={handleNewIifColumnNameChange}
                          placeholder="Enter new IIF column name"
                          style={{ flex: 1 }}
                        />
                        <IMButton
                          handleClick={addIifColumn}
                          variant="filled"
                          color="purple"
                          disabled={!iifColumns.length || !newIifColumnName}
                        >
                          Add Column to IIF
                        </IMButton>
                      </div>
                    </Col>
                  </Row>
                </IMCard>
              </Col>

              <Col span={24}>
                <IMCard
                  extra={
                    <IMButton
                      handleClick={addMemoMappingSet}
                      variant="solid"
                      color="green"
                      style={{ marginTop: "24px" }}
                    >
                      + Add MEMO Mapping Set
                    </IMButton>
                  }
                >
                  <Row gutter={[16, 16]} className="memo-mapping-wrap">
                    {memoMappingSets.map((set, index) => (
                      <React.Fragment key={set.id}>
                        <Col span={6}>
                          <IMUpload
                            handleChange={({ file }) =>
                              handleMemoMappingsChange(set.id, file)
                            }
                            accept=".xlsx,.xls,.csv"
                            variant="solid"
                            color="default"
                          >
                            Upload MEMO Mapping Sheet {index + 1}
                          </IMUpload>
                        </Col>
                        <Col span={6}>
                          <label
                            className="selectLabel"
                            htmlFor={`MemoSourceMappingSelect-${set.id}`}
                          >
                            Select the IIF column (MEMO Source {index + 1})
                          </label>
                          <IMSelect
                            id={`MemoSourceMappingSelect-${set.id}`}
                            value={set.memoSourceIifColumn}
                            handleChange={(value) =>
                              handleMemoSourceIifColumnChange(set.id, value)
                            }
                            placeholder={`Select the IIF column (MEMO Source ${
                              index + 1
                            })`}
                            disabled={!iifColumns.length}
                            style={{ width: "100%" }}
                          >
                            {iifColumns.map((iifColumn) => (
                              <Select.Option
                                key={`iif-memo-source-${set.id}-${iifColumn}`}
                                value={iifColumn}
                              >
                                {iifColumn}
                              </Select.Option>
                            ))}
                          </IMSelect>
                        </Col>
                        <Col span={6}>
                          <label
                            className="selectLabel"
                            htmlFor={`MemoTargetMappingSelect-${set.id}`}
                          >
                            Select the IIF column (MEMO Target {index + 1})
                          </label>
                          <IMSelect
                            id={`MemoTargetMappingSelect-${set.id}`}
                            value={set.memoTargetIifColumn}
                            handleChange={(value) =>
                              handleMemoTargetIifColumnChange(set.id, value)
                            }
                            placeholder={`Select the IIF column (MEMO Target ${
                              index + 1
                            })`}
                            disabled={!iifColumns.length}
                            style={{ width: "100%" }}
                          >
                            {iifColumns.map((iifColumn) => (
                              <Select.Option
                                key={`iif-memo-target-${set.id}-${iifColumn}`}
                                value={iifColumn}
                              >
                                {iifColumn}
                              </Select.Option>
                            ))}
                          </IMSelect>
                        </Col>
                        <Col span={6}>
                          <label>MEMO Mapping Type {index + 1}: </label>
                          <Radio.Group
                            value={set.memoMappingType}
                            onChange={(e) =>
                              handleMemoMappingTypeChange(
                                set.id,
                                e.target.value,
                              )
                            }
                          >
                            <Radio value="Keys">Keys</Radio>
                            <Radio value="Values">Values</Radio>
                            <Radio value="Both">Both</Radio>
                          </Radio.Group>
                          {index > 0 && (
                            <IMButton
                              handleClick={() => removeMemoMappingSet(set.id)}
                              variant="solid"
                              color="red"
                              style={{ marginTop: "8px" }}
                            >
                              Remove
                            </IMButton>
                          )}
                        </Col>
                      </React.Fragment>
                    ))}
                  </Row>
                </IMCard>
              </Col>

              {isAdmin && (
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
                                <b>Step 3:</b> Name your new column. It’ll show
                                up for mapping!
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
                          allowClear
                          mode="multiple"
                          value={selectedColumns}
                          onChange={handleSelectedColumnsChange}
                          placeholder={"Select Columns"}
                          style={{ width: "100%" }}
                        >
                          {normalizedSourceColumns.map((sourceColumn) => (
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
                            calculatedColumnsFormula ||
                            selectedColumns.join(" ")
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
                      <Col span={12}>
                        <Input
                          value={emptyColumnName}
                          onChange={handleEmptyColumnNameChange}
                          className="w-full"
                          placeholder="Give a name to empty column"
                        />
                      </Col>
                      <Col span={24}>
                        <IMButton
                          handleClick={addEmptyColumn}
                          variant={"filled"}
                          color={"blue"}
                        >
                          Add Empty Column
                        </IMButton>
                      </Col>
                    </Row>
                  </IMCard>
                </Col>
              )}
              {isAdmin && (
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
                                value={keyMappings[iifColumn] || []}
                                onChange={(e) => {
                                  const selectedColumns = Array.from(
                                    e.target.selectedOptions,
                                  ).map((option) => option.value);
                                  handleKeyMapping(selectedColumns, iifColumn);
                                }}
                                className="w-full p-2 border rounded h-32"
                              >
                                {normalizedSourceColumns.map((sourceColumn) => (
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
                                value={valueMappings[iifColumn] || []}
                                onChange={(e) => {
                                  const selectedColumns = Array.from(
                                    e.target.selectedOptions,
                                  ).map((option) => option.value);
                                  handleValueMapping(
                                    selectedColumns,
                                    iifColumn,
                                  );
                                }}
                                className="w-full p-2 border rounded h-32"
                              >
                                {normalizedSourceColumns.map((sourceColumn) => (
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
              )}
              {isAdmin && (
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
                                  Pick columns you don’t want to map if they
                                  have a zero (0).
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
                              e.target.selectedOptions,
                            ).map((option) => option.value);
                            setNonZeroColumns(selectedColumns);
                          }}
                          className="w-full p-2 border rounded h-32"
                        >
                          {normalizedSourceColumns.map((sourceColumn) => (
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
                                  Picking a number from 1 to the minimum number
                                  of data fields is recommended.
                                </p>
                              </>
                            }
                          />
                        }
                      >
                        {singleMappedColumns.map((column) => {
                          const sourceColumn = valueMappings[column][0];
                          const mappingColumn = Object.keys(valueMappings).find(
                            (key) => valueMappings[key].includes(sourceColumn),
                          );
                          return (
                            <div className="mb-2" key={`position-${column}`}>
                              <label className="block mb-1">
                                {sourceColumn} (Mapped to {mappingColumn}{" "}
                                column):
                              </label>
                              <Select
                                value={positionMappings[sourceColumn]}
                                onChange={(value) =>
                                  handlePositionMappingChange(
                                    sourceColumn,
                                    value,
                                  )
                                }
                                allowClear
                                style={{ width: "100%" }}
                              >
                                {Array.from(
                                  { length: minPairs },
                                  (_, i) => i + 1,
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
                        {calculatedMappedColumns.map((column) => {
                          const sourceColumn = valueMappings[column].find(
                            (col) => calculatedColumnNames.includes(col),
                          );
                          const mappingColumn = Object.keys(valueMappings).find(
                            (key) => valueMappings[key].includes(sourceColumn),
                          );
                          return (
                            <div
                              className="mb-2"
                              key={`position-calculated-${column}`}
                            >
                              <label className="block mb-1">
                                {sourceColumn} (Mapped to {mappingColumn}{" "}
                                column):
                              </label>
                              <Select
                                value={positionMappings[sourceColumn]}
                                onChange={(value) =>
                                  handlePositionMappingChange(
                                    sourceColumn,
                                    value,
                                  )
                                }
                                allowClear
                                style={{ width: "100%" }}
                              >
                                {Array.from(
                                  { length: minPairs },
                                  (_, i) => i + 1,
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
                        {emptyMappedColumns.map((column) => {
                          const sourceColumn = valueMappings[column].find(
                            (col) => emptyColumnNames.includes(col),
                          );
                          const mappingColumn = Object.keys(valueMappings).find(
                            (key) => valueMappings[key].includes(sourceColumn),
                          );
                          return (
                            <div
                              className="mb-2"
                              key={`position-empty-${column}`}
                            >
                              <label className="block mb-1">
                                {sourceColumn} (Mapped to {mappingColumn}{" "}
                                column):
                              </label>
                              <Select
                                value={positionMappings[sourceColumn]}
                                onChange={(value) =>
                                  handlePositionMappingChange(
                                    sourceColumn,
                                    value,
                                  )
                                }
                                allowClear
                                style={{ width: "100%" }}
                              >
                                {Array.from(
                                  { length: minPairs },
                                  (_, i) => i + 1,
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
              )}
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
                {isAdmin && (
                  <Input
                    value={formatName}
                    onChange={(e) => setFormatName(e.target.value)}
                    className="w-full mb-3"
                    placeholder="Enter Format Name"
                    disabled={!isFormatModified && selectedFormat}
                  />
                )}
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
