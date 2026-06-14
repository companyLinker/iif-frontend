import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import axios from "axios";
import { IMTable } from "../../component/IMTable";
import { IMDatePicker } from "../../component/IMDatePicker";
import { IMButton } from "../../component/IMButton";
import { IMCard } from "../../component/IMCard";
import * as XLSX from "xlsx";
import moment from "moment";
import { evaluate } from "mathjs";
import { Col, Row, Select, Input, notification } from "antd";

const { TextArea } = Input;

// ─── Formula Engine ───────────────────────────────────────────────────────────
// Column-name-aware longest-match tokenizer.
//
// PROBLEM: Simple operator-split tokenizers break on column names that CONTAIN
// operator characters, e.g. "Non-TaxableSales" has a literal hyphen.
//
// SOLUTION: Accept the known column list and try to match them FIRST at each
// position (longest column name wins). Only after no column matches do we fall
// back to treating the character as a math operator or number.
//
// This makes the engine fully dynamic: works with any column names, including
// ones containing hyphens (-), hash (#), underscores (_), dots, etc.

/**
 * Tokenize a formula string into tokens, using a column-name-aware longest-match
 * strategy so that column names with special chars (like "Non-TaxableSales" or "#1")
 * are correctly emitted as a single identifier token.
 *
 * @param {string} formula        - The raw formula string typed by the user.
 * @param {string[]} knownColumns - All available column names (used for longest-match).
 * @returns {Array<{type: 'ident'|'num'|'op'|'unknown', value: string}>}
 *
 * Token types:
 *   'ident'   – a matched column name
 *   'num'     – a numeric literal (e.g. "2", "0.5")
 *   'op'      – a math operator or paren (+, -, *, /, %, (, ))
 *   'unknown' – an unrecognized word (not a column, not a number, not an op)
 */
function tokenizeFormula(formula, knownColumns = []) {
  // Sort columns by length DESC so the longest name wins when names share a prefix.
  // Example: "Non-TaxableSales" beats "Non" so the hyphen isn't treated as an op.
  const sortedCols = [...knownColumns].sort((a, b) => b.length - a.length);

  const tokens = [];
  let i = 0;

  while (i < formula.length) {
    // ── Skip whitespace ──────────────────────────────────────────────────────
    if (/\s/.test(formula[i])) { i++; continue; }

    // ── Try to match a known column name (longest-match first) ───────────────
    // A valid match requires the token to be followed by a boundary character
    // (end-of-string, whitespace, or a math operator/paren) so we don't
    // greedily match a short name that is a prefix of a longer one.
    let colMatched = false;
    for (const col of sortedCols) {
      if (formula.startsWith(col, i)) {
        const nextChar = formula[i + col.length];
        const isBoundary = nextChar === undefined || /[\s+\-*/%()]/.test(nextChar);
        if (isBoundary) {
          tokens.push({ type: "ident", value: col });
          i += col.length;
          colMatched = true;
          break;
        }
      }
    }
    if (colMatched) continue;

    // ── Math operator or paren ───────────────────────────────────────────────
    if (/[+\-*/%()]/.test(formula[i])) {
      tokens.push({ type: "op", value: formula[i] });
      i++;
      continue;
    }

    // ── Numeric literal ──────────────────────────────────────────────────────
    if (/[0-9.]/.test(formula[i])) {
      let num = "";
      while (i < formula.length && /[0-9.]/.test(formula[i])) num += formula[i++];
      tokens.push({ type: "num", value: num });
      continue;
    }

    // ── Unknown token (grab until whitespace/operator) ───────────────────────
    // This will surface as a validation error so the user gets a clear message.
    let unk = "";
    while (i < formula.length && !/[\s+\-*/%()]/.test(formula[i])) unk += formula[i++];
    if (unk) tokens.push({ type: "unknown", value: unk });
  }

  return tokens;
}

/**
 * Evaluate a formula string, substituting each column identifier with its
 * numeric value from colValues, then running mathjs evaluate().
 *
 * @param {string} formula     - Formula string, e.g. "Col1 + Non-TaxableSales * 2"
 * @param {Object} colValues   - Map of { columnName: numericValue }
 * @returns {number}           - Result rounded to 2 decimal places
 * @throws {Error}             - If formula syntax is invalid or result is non-finite
 */
function evaluateFormula(formula, colValues) {
  const knownColumns = Object.keys(colValues);
  const tokens = tokenizeFormula(formula, knownColumns);
  const expr = tokens
    .map((tok) => {
      if (tok.type === "ident") {
        const val = colValues[tok.value];
        return val !== undefined ? val : 0;
      }
      return tok.value; // op, num, unknown
    })
    .join(" ");
  const rawResult = evaluate(expr);
  const result = Number(parseFloat(rawResult).toFixed(2));
  if (!isFinite(result) || isNaN(result)) throw new Error(`Invalid result: ${rawResult}`);
  return result;
}

/**
 * Extract the unique set of column names referenced in a formula.
 * Uses column-aware tokenization so hyphenated names are found correctly.
 *
 * @param {string}   formula          - Formula string
 * @param {string[]} availableColumns - All valid column names
 * @returns {string[]}                - Array of unique matched column names
 */
function extractFormulaColumns(formula, availableColumns) {
  const tokens = tokenizeFormula(formula, availableColumns);
  // De-duplicate while preserving order
  const seen = new Set();
  return tokens
    .filter((t) => t.type === "ident")
    .map((t) => t.value)
    .filter((v) => { if (seen.has(v)) return false; seen.add(v); return true; });
}

/**
 * Validate that every identifier token in the formula is a recognised column.
 * Uses column-aware tokenization so "Non-TaxableSales" is validated as one name.
 *
 * @param {string}   formula          - Formula string
 * @param {string[]} availableColumns - All valid column names
 * @returns {{ valid: boolean, unknownTokens: string[] }}
 */
function validateFormula(formula, availableColumns) {
  const tokens = tokenizeFormula(formula, availableColumns);
  const unknownTokens = tokens
    .filter((t) => t.type === "unknown")
    .map((t) => t.value);
  return { valid: unknownTokens.length === 0, unknownTokens };
}

/**
 * Pre-compile a formula into a fast per-row executor function.
 *
 * Call this ONCE before processing rows. The returned executor accepts a row
 * object and returns the computed number — with zero re-parsing or re-sorting.
 *
 * Compilation steps (done once):
 *   1. Tokenize the formula with column-aware longest-match (handles hyphens etc.)
 *   2. Build an ordered list of [tokenIndex, columnName] substitution slots
 *   3. Return an executor that fills those slots with row values and calls mathjs
 *
 * @param {string}   formula          - Formula string
 * @param {string[]} availableColumns - All valid column names
 * @returns {{ formulaCols: string[], execute: (colValues: Object) => number }}
 */
function compileFormula(formula, availableColumns) {
  const tokens = tokenizeFormula(formula, availableColumns);

  // Build the output token array template (mix of static strings and column placeholders)
  // Each element is either { static: string } or { colIndex: number, col: string }
  const colList = []; // unique ordered column names referenced
  const colIndexMap = new Map();

  const templateParts = tokens.map((tok) => {
    if (tok.type === "ident") {
      if (!colIndexMap.has(tok.value)) {
        colIndexMap.set(tok.value, colList.length);
        colList.push(tok.value);
      }
      return { isCol: true, idx: colIndexMap.get(tok.value) };
    }
    return { isCol: false, val: tok.value };
  });

  // Pre-build the static parts of the expression string for fast join
  // The executor only needs to substitute the column values
  const execute = (colValues) => {
    // Build expression string by substituting column values
    let expr = "";
    for (const part of templateParts) {
      if (part.isCol) {
        expr += " " + (colValues[colList[part.idx]] ?? 0) + " ";
      } else {
        expr += part.val;
      }
    }
    const rawResult = evaluate(expr);
    const result = Number(parseFloat(rawResult).toFixed(2));
    if (!isFinite(result) || isNaN(result)) throw new Error(`Invalid result: ${rawResult}`);
    return result;
  };

  return { formulaCols: colList, execute };
}

// ─── Memoized Input ───────────────────────────────────────────────────────────
const MemoizedInput = React.memo(({ name, initialValue, onValueChange }) => {
  const [localValue, setLocalValue] = useState(initialValue);

  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onValueChange(name, newValue);
  };

  return (
    <input
      type="text"
      name={name}
      value={localValue}
      onChange={handleChange}
      style={{ width: "100%" }}
    />
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
const IMUpload = () => {
  const [notificationApi, contextHolder] = notification.useNotification();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  // columnOptions is derived from data — no useState needed, prevents infinite loop
  // (calling setState inside useMemo/useCallback during render causes infinite re-renders)
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [editColumns, setEditColumns] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [editRows, setEditRows] = useState({});
  const [editFormData, setEditFormData] = useState({});
  const [calculatedColumnName, setCalculatedColumnName] = useState("");
  const [calculatedColumnsFormula, setCalculatedColumnsFormula] = useState("");
  const [calculatedSelectedColumns, setCalculatedSelectedColumns] = useState([]);
  const [replaceColumn, setReplaceColumn] = useState(null);
  const [brandOptions, setBrandOptions] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [pageSize, setPageSize] = useState(20);
  const [formulas, setFormulas] = useState([]);
  const [selectedFormula, setSelectedFormula] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const ADMIN_PASSWORD = `${import.meta.env.VITE_DB_UPDATE_PSSWRD}`;
  const isAdmin = localStorage.getItem("userRole") === "admin";
  const allowedColumnsForNonAdmin = ["#1", "#2", "#3", "#4", "#5"];
  const separateWidthColumns = ["#1", "#2", "#3", "#4", "#5", "Date"];

  // Cache for formula column extraction – keyed by formula string + available columns fingerprint
  const formulaColCacheRef = useRef(new Map());

  // Get formula columns with caching
  const getFormulaColumns = useCallback((formula, availableCols) => {
    const cacheKey = formula + "||" + availableCols.join(",");
    if (formulaColCacheRef.current.has(cacheKey)) {
      return formulaColCacheRef.current.get(cacheKey);
    }
    const cols = extractFormulaColumns(formula, availableCols);
    formulaColCacheRef.current.set(cacheKey, cols);
    return cols;
  }, []);

  // ─── columnOptions derived from data FIRST (must be before any hook that uses it) ─
  const columnOptions = useMemo(() => {
    if (!data || data.length === 0) return [];
    const allKeys = Object.keys(data[0]).filter((key) => key !== "_id");
    const fixedOrder = ["StoreName", "Date", "State"];
    const sortedKeys = [
      ...fixedOrder.filter((key) => allKeys.includes(key)),
      ...allKeys.filter((key) => !fixedOrder.includes(key)),
    ];
    return sortedKeys
      .filter((key) => isAdmin || allowedColumnsForNonAdmin.includes(key))
      .map((key) => ({ label: key, value: key }));
  }, [data, isAdmin]);

  // ─── Transaction Logs ─────────────────────────────────────────────────────
  useEffect(() => {
    const clearTransactionLogs = async () => {
      if (selectedBrand) {
        try {
          const response = await axios.post(
            `${import.meta.env.VITE_API_URL}/api/clear-transaction-logs`,
            { brand: selectedBrand }
          );
          setCanUndo(false);
          setCanRedo(false);
          notificationApi.info({
            message: "Transaction Logs Cleared",
            description: `Cleared ${response.data.deletedCount} logs for ${selectedBrand}.`,
          });
        } catch (error) {
          console.error("Error clearing transaction logs:", error.response?.data || error);
          notificationApi.error({
            message: "Error Clearing Logs",
            description: error.response?.data?.message || "Failed to clear transaction logs.",
          });
        }
      }
    };
    const timer = setTimeout(clearTransactionLogs, 500);
    return () => clearTimeout(timer);
  }, [selectedBrand, notificationApi]);

  const checkTransactions = useCallback(async () => {
    if (!selectedBrand) return;
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/check-transactions`,
        { brand: selectedBrand }
      );
      setCanUndo(response.data.canUndo);
      setCanRedo(response.data.canRedo);
    } catch {
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [selectedBrand]);

  // ─── Fetch Brands & Formulas ──────────────────────────────────────────────
  useEffect(() => {
    const fetchBrandsAndFormulas = async () => {
      try {
        const [brandResponse, formulaResponse] = await Promise.all([
          axios.get(`${import.meta.env.VITE_API_URL}/api/brands`),
          axios.get(`${import.meta.env.VITE_API_URL}/api/formulas`),
        ]);

        const brands = brandResponse.data.map((brand) => ({
          label: brand,
          value: brand,
        }));
        setBrandOptions(brands);

        const formulaOptions = formulaResponse.data.map((formula) => ({
          label: `${formula.formula} → ${formula.column} (${formula.selected ? "Active" : "Inactive"})`,
          value: formula._id,
          formula: formula.formula,
          column: formula.column,
          selected: formula.selected,
          brand: formula.brand,
        }));
        setFormulas(formulaOptions);

        const activeFormula = formulaOptions.find((f) => f.selected);
        if (activeFormula) {
          setSelectedFormula(activeFormula);
          setCalculatedColumnsFormula(activeFormula.formula);
          setReplaceColumn(activeFormula.column);
          setCalculatedColumnName("");
        }
      } catch (error) {
        console.error("Error fetching brands or formulas:", error);
        notificationApi.error({
          message: "Error",
          description: "Failed to load brand or formula options.",
        });
      }
    };
    fetchBrandsAndFormulas();
  }, [notificationApi]);

  useEffect(() => {
    if (selectedBrand) {
      const activeFormula = formulas.find((f) => f.selected && f.brand === selectedBrand);
      if (activeFormula) {
        setSelectedFormula(activeFormula);
        setCalculatedColumnsFormula(activeFormula.formula);
        setReplaceColumn(activeFormula.column);
        setCalculatedColumnName("");
      } else {
        setSelectedFormula(null);
        setCalculatedColumnsFormula("");
        setReplaceColumn(null);
        setCalculatedColumnName("");
      }
      checkTransactions();
    } else {
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [selectedBrand, formulas, checkTransactions]);

  // ─── File Handling ────────────────────────────────────────────────────────
  const handleFileChange = (event) => {
    setFiles(Array.from(event.target.files));
  };

  // ─── Edit Form Data Update with Live Formula Recalculation ────────────────
  const updateEditFormData = useCallback(
    (name, value) => {
      const { rowIndex, column } = JSON.parse(name);

      setEditFormData((prev) => {
        const newFormData = {
          ...prev,
          [rowIndex]: {
            ...(prev[rowIndex] || {}),
            [column]: value,
          },
        };

        // Live-recalculate the formula target column if formula is active
        if (selectedFormula?.formula && selectedFormula?.column) {
          const formula = selectedFormula.formula;
          const targetColumn = selectedFormula.column;

          // Build current row values: editFormData overrides, then base data
          const rowOverrides = newFormData[rowIndex] || {};
          const baseRow = data[rowIndex] || {};
          const mergedRow = { ...baseRow, ...rowOverrides };

          const availableCols = columnOptions.map((o) => o.value);
          const formulaCols = getFormulaColumns(formula, availableCols);

          if (formulaCols.length > 0) {
            const colValues = {};
            formulaCols.forEach((col) => {
              let val = mergedRow[col];
              if (val === null || val === undefined || val === "") val = 0;
              else if (typeof val === "string") {
                const cleaned = val.replace(/[^0-9.-]/g, "");
                val = isNaN(parseFloat(cleaned)) ? 0 : parseFloat(cleaned);
              }
              colValues[col] = val;
            });

            try {
              newFormData[rowIndex][targetColumn] = evaluateFormula(formula, colValues);
            } catch {
              newFormData[rowIndex][targetColumn] = 0;
            }
          }
        }

        return newFormData;
      });
    },
    [data, selectedFormula, columnOptions, getFormulaColumns]
  );

  // columnOptions is declared earlier (before computeFormulaForRow) to avoid TDZ

  // ─── Generate Table Columns (pure function, no side effects) ─────────────
  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];

    const allKeys = Object.keys(data[0]).filter((key) => key !== "_id");
    const fixedOrder = ["StoreName", "Date", "State"];
    const sortedKeys = [
      ...fixedOrder.filter((key) => allKeys.includes(key)),
      ...allKeys.filter((key) => !fixedOrder.includes(key)),
    ];

    return sortedKeys.map((key) => {
      const column = {
        title: key,
        dataIndex: key,
        key,
        width: separateWidthColumns.includes(key) ? 110 : 180,
        render: (value, record) => {
          const originalIndex = data.findIndex(
            (item) => item.StoreName === record.StoreName && item.Date === record.Date && item._id
          );
          if (
            key !== "State" &&
            editColumns.includes(key) &&
            editRows[originalIndex] &&
            isAuthenticated
          ) {
            const inputName = JSON.stringify({ rowIndex: originalIndex, column: key });
            return (
              <MemoizedInput
                name={inputName}
                initialValue={editFormData[originalIndex]?.[key] ?? (value || "")}
                onValueChange={updateEditFormData}
              />
            );
          }
          return value ?? "";
        },
      };

      if (key === "StoreName" || key === "Date") column.fixed = "left";
      if (key === "State") { column.fixed = "left"; column.width = 80; }

      if (typeof data[0][key] === "number") {
        column.sorter = (a, b) => (a[key] ?? 0) - (b[key] ?? 0);
      } else if (typeof data[0][key] === "string") {
        column.sorter = (a, b) => (a[key] ?? "").localeCompare(b[key] ?? "");
      } else {
        column.sorter = (a, b) => (a[key] ?? 0) - (b[key] ?? 0);
      }

      if (key === "StoreName") {
        const uniqueStoreNames = [...new Set(data.map((item) => item[key]))]
          .filter((v) => v !== null && v !== undefined)
          .sort();
        column.filters = uniqueStoreNames.map((name) => ({ text: name, value: name }));
        column.onFilter = (value, record) => record[key] === value;
      }

      if (key === "Date") {
        const uniqueDates = [...new Set(data.map((item) => item[key]))]
          .filter((v) => v !== null && v !== undefined)
          .sort((a, b) => moment(a, "MM-DD-YYYY").diff(moment(b, "MM-DD-YYYY")));
        column.filters = uniqueDates.map((date) => ({ text: date, value: date }));
        column.onFilter = (value, record) => record[key] === value;
      }

      return column;
    });
  }, [data, isAuthenticated, editColumns, editRows, editFormData, updateEditFormData, isAdmin]);

  // ─── Upload ───────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedBrand) {
      notificationApi.error({ message: "Error", description: "Please select a brand." });
      return;
    }
    if (files.length === 0) {
      notificationApi.error({ message: "Error", description: "Please select at least one file to upload." });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("brand", selectedBrand);

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (response.status === 200) {
        const { insertedCount, duplicateCount, sheetCount, fileCount } = response.data;
        let message = `Upload completed! Total records inserted: ${insertedCount} from ${sheetCount} sheets across ${fileCount} files.`;
        if (duplicateCount > 0) message += ` Skipped ${duplicateCount} duplicate records.`;
        notificationApi.success({ message: "Success", description: message });
      } else {
        notificationApi.error({ message: "Error", description: "Error uploading files. Please try again." });
      }
    } catch {
      notificationApi.error({ message: "Error", description: "Error uploading files. Please try again." });
    }

    setUploading(false);
    setFiles([]);
    if (startDate && endDate) handleFetchData();
  };

  // ─── Data Effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (data.length > 0) {
      const dataWithoutId = data.map(({ _id, ...rest }) => rest);
      setFilteredData(dataWithoutId);
    } else {
      // columnOptions is now derived via useMemo — no setColumnOptions needed
      setSelectedColumns([]);
      setEditColumns([]);
      setCalculatedSelectedColumns([]);
      setReplaceColumn(null);
      setFilteredData([]);
      setEditRows({});
      setEditFormData({});
    }
  }, [data]);

  // ─── Fetch Data ───────────────────────────────────────────────────────────
  const handleDateChange = (dates) => {
    setStartDate(dates[0]);
    setEndDate(dates[1]);
  };

  const handleFetchData = useCallback(async () => {
    if (!selectedBrand) {
      notificationApi.error({ message: "Error", description: "Please select a brand." });
      return;
    }
    if (!startDate || !endDate) {
      notificationApi.error({ message: "Error", description: "Please select a valid date range." });
      return;
    }

    const formattedStartDate = startDate.format("MM-DD-YYYY");
    const formattedEndDate = endDate.format("MM-DD-YYYY");

    try {
      const [dataResponse, mappingResponse] = await Promise.all([
        axios.post(`${import.meta.env.VITE_API_URL}/api/data`, {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          brand: selectedBrand,
        }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/filter-options`, {
          params: { brand: selectedBrand },
        }),
      ]);

      const fetchedRecords = dataResponse.data.data;
      if (!fetchedRecords || fetchedRecords.length === 0) {
        notificationApi.warning({ message: "Warning", description: "No data found for the selected brand and date range." });
        setData([]);
        setEditRows({});
        setEditFormData({});
        checkTransactions();
        return;
      }

      const storeStateMap = {};
      if (mappingResponse.data?.storeMappings) {
        mappingResponse.data.storeMappings.forEach((mapping) => {
          const rawStoreNo = mapping.StoreNo || mapping.storeno || mapping.Store_No;
          if (rawStoreNo && mapping.State) {
            const cleanKey = String(rawStoreNo).trim().replace(/\.0+$/, "");
            storeStateMap[cleanKey] = mapping.State;
          }
        });
      }

      const mergedData = fetchedRecords.map((row) => {
        let stateValue = row.State || "";
        if (row.StoreName) {
          const allNumbers = String(row.StoreName).match(/(\d+)/g);
          if (allNumbers) {
            for (const num of allNumbers) {
              if (storeStateMap[num]) { stateValue = storeStateMap[num]; break; }
              const intKey = String(parseInt(num, 10));
              if (storeStateMap[intKey]) { stateValue = storeStateMap[intKey]; break; }
            }
          }
        }
        return { ...row, State: stateValue };
      });

      setData(mergedData);
      setEditRows({});
      setEditFormData({});
      checkTransactions();
    } catch (error) {
      console.error("Fetch Data Error:", error);
      notificationApi.error({ message: "Error", description: "Error fetching data. Please try again." });
    }
  }, [selectedBrand, startDate, endDate, notificationApi, checkTransactions]);

  // ─── Column & Formula Handlers ────────────────────────────────────────────
  const handleColumnSelect = (selected) => setSelectedColumns(selected);

  const handleEditColumnSelect = (selected) => {
    setEditColumns(selected);
    setIsAuthenticated(false);
    setEditRows({});
    setEditFormData({});
  };

  const handleAuthenticate = () => {
    if (editColumns.length === 0) { alert("Please select at least one column to edit."); return; }
    const password = prompt("Enter admin password:");
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      alert("Authentication successful!");
    } else {
      setIsAuthenticated(false);
      alert("Incorrect password!");
    }
  };

  const handleTableChange = (pagination, filters, sorter, extra) => {
    setFilteredData(extra.currentDataSource || []);
    setPageSize(pagination.pageSize);
  };

  const handleEdit = () => {
    if (!isAuthenticated) { alert("Please authenticate to edit records."); return; }
    if (data.length > 0) {
      const newEditRows = {};
      const newFormData = {};
      data.forEach((row, idx) => {
        newEditRows[idx] = true;
        newFormData[idx] = {};
        editColumns.forEach((col) => { newFormData[idx][col] = row[col] ?? ""; });
      });
      setEditRows(newEditRows);
      setEditFormData(newFormData);
    } else {
      alert("No data available to edit.");
    }
  };

  const handleSaveAll = async () => {
    if (!isAuthenticated) { alert("Please authenticate to edit records."); return; }
    const password = prompt("Enter admin password to save changes:");
    if (password !== ADMIN_PASSWORD) { alert("Incorrect password!"); return; }

    const loggedInUser = localStorage.getItem("loggedInUser") || localStorage.getItem("userRole") || "Unknown";
    const updatesToSend = [];

    Object.keys(editRows).forEach((rowIndex) => {
      if (editRows[rowIndex] && data[rowIndex]?._id && data[rowIndex]._id !== "null") {
        const updates = editFormData[rowIndex] || {};
        const originalRow = data[rowIndex];
        const changedUpdates = {};
        Object.keys(updates).forEach((key) => {
          if (updates[key] !== (originalRow[key] ?? "")) changedUpdates[key] = updates[key];
        });
        if (Object.keys(changedUpdates).length > 0) {
          updatesToSend.push({ id: data[rowIndex]._id, updates: changedUpdates });
        }
      }
    });

    if (updatesToSend.length === 0) {
      alert("No changes to save.");
      setEditRows({});
      setEditFormData({});
      return;
    }

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/data-bulk-update`, {
        updates: updatesToSend,
        brand: selectedBrand,
        username: loggedInUser,
      });
      if (response.status === 200) {
        alert("All changes saved successfully!");
        setEditRows({});
        setEditFormData({});
        handleFetchData();
        checkTransactions();
      } else {
        alert("Some updates failed. Please try again.");
      }
    } catch (error) {
      console.error("Error updating data:", error.response?.data || error);
      let errorMessage = "Error updating data: Please try again.";
      if (error.code === "ERR_NETWORK") errorMessage = "Network error: Check server connection or CORS configuration.";
      else if (error.response?.status === 413) errorMessage = "Payload too large: Try editing fewer rows or contact support.";
      alert(errorMessage);
    }
  };

  const handleCancel = () => { setEditRows({}); setEditFormData({}); };

  const handleDownload = () => {
    if (filteredData.length === 0) { alert("No data available to download."); return; }
    let dataForExcel = filteredData;
    if (selectedColumns.length > 0) {
      dataForExcel = filteredData.map((item) => {
        const filteredItem = {};
        selectedColumns.forEach((col) => { filteredItem[col] = item[col]; });
        return filteredItem;
      });
    }
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CT Data");
    const formattedStartDate = startDate ? startDate.format("MM-DD-YYYY") : "unknown";
    const formattedEndDate = endDate ? endDate.format("MM-DD-YYYY") : "unknown";
    XLSX.writeFile(workbook, `CT_Data_${formattedStartDate}_to_${formattedEndDate}.xlsx`);
  };

  // ─── Calculated Column Handlers ───────────────────────────────────────────
  const handleCalculatedColumnNameChange = (e) => {
    setCalculatedColumnName(e.target.value);
    setReplaceColumn(null);
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
    setCalculatedColumnName("");
  };

  const handleFormulaSelect = (value) => {
    const formula = formulas.find((f) => f.value === value);
    setSelectedFormula(formula || null);
    if (formula) {
      setCalculatedColumnsFormula(formula.formula);
      setReplaceColumn(formula.column);
      setCalculatedSelectedColumns([]);
      setCalculatedColumnName("");
    } else {
      setCalculatedColumnsFormula("");
      setReplaceColumn(null);
      setCalculatedSelectedColumns([]);
      setCalculatedColumnName("");
    }
  };

  const toggleFormulaSelection = async () => {
    if (!selectedFormula) {
      notificationApi.error({ message: "Error", description: "Please select a formula to toggle." });
      return;
    }
    try {
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/formulas/${selectedFormula.value}`,
        { selected: !selectedFormula.selected }
      );
      if (response.status === 200) {
        setFormulas((prev) =>
          prev.map((f) =>
            f.value === selectedFormula.value
              ? {
                  ...f,
                  selected: response.data.selected,
                  label: `${f.formula} → ${f.column} (${response.data.selected ? "Active" : "Inactive"})`,
                }
              : f
          )
        );
        setSelectedFormula((prev) => (prev ? { ...prev, selected: response.data.selected } : null));
        notificationApi.success({
          message: "Success",
          description: `Formula set to ${response.data.selected ? "Active" : "Inactive"}.`,
        });
      }
    } catch {
      notificationApi.error({ message: "Error", description: "Failed to toggle formula selection." });
    }
  };

  const handleUpdateFormula = async () => {
    if (!selectedFormula) return;
    try {
      const columnToUpdate = replaceColumn || calculatedColumnName || selectedFormula.column;
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/formulas/${selectedFormula.value}`,
        { formula: calculatedColumnsFormula, column: columnToUpdate }
      );
      if (response.status === 200) {
        notificationApi.success({ message: "Formula updated successfully" });
        setFormulas((prev) =>
          prev.map((f) =>
            f.value === selectedFormula.value
              ? {
                  ...f,
                  formula: calculatedColumnsFormula,
                  column: columnToUpdate,
                  label: `${calculatedColumnsFormula} → ${columnToUpdate} (${f.selected ? "Active" : "Inactive"})`,
                }
              : f
          )
        );
        setSelectedFormula((prev) => ({ ...prev, formula: calculatedColumnsFormula, column: columnToUpdate }));
      }
    } catch {
      notificationApi.error({ message: "Error", description: "Failed to update formula." });
    }
  };

  // ─── Apply Formula to Data (main function, fully fixed) ───────────────────
  const addCalculatedColumn = async () => {
    if (!selectedBrand) {
      notificationApi.error({ message: "Error", description: "Please select a brand." });
      return;
    }
    if (!calculatedColumnsFormula.trim()) {
      notificationApi.error({ message: "Error", description: "Please provide a formula for the calculated column." });
      return;
    }

    const columnToUpdate =
      replaceColumn ||
      calculatedColumnName ||
      (selectedFormula ? selectedFormula.column : null);

    if (!columnToUpdate) {
      notificationApi.error({
        message: "Error",
        description: "Please provide a name for the new column or select a column to replace.",
      });
      return;
    }

    if (replaceColumn && calculatedColumnName) {
      notificationApi.error({
        message: "Error",
        description: "Please provide either a new column name or select a column to replace, not both.",
      });
      return;
    }

    if (!replaceColumn && !selectedFormula && data.length > 0 && Object.keys(data[0]).includes(columnToUpdate)) {
      notificationApi.error({
        message: "Error",
        description: "Column name already exists. Please choose a unique name or select a column to replace.",
      });
      return;
    }

    // Validate formula using token-based approach
    const availableCols = columnOptions.map((o) => o.value);

    if (availableCols.length === 0) {
      notificationApi.error({
        message: "Error",
        description: "No column options available. Please fetch data first before applying a formula.",
      });
      return;
    }

    const { valid, unknownTokens } = validateFormula(calculatedColumnsFormula, availableCols);
    if (!valid) {
      notificationApi.error({
        message: "Error",
        description: `Formula contains unrecognized column names or invalid tokens: ${unknownTokens.join(", ")}. Available columns: ${availableCols.join(", ")}`,
      });
      return;
    }

    const formulaColsCheck = getFormulaColumns(calculatedColumnsFormula, availableCols);
    if (formulaColsCheck.length === 0) {
      notificationApi.error({
        message: "Error",
        description: "Formula contains no valid column names. Please check your formula and ensure the data is loaded.",
      });
      return;
    }

    if (data.length === 0) {
      notificationApi.error({
        message: "Error",
        description: "No data loaded. Please fetch data before applying a formula.",
      });
      return;
    }

    setCalculating(true);

    // ── Pre-compile formula ONCE (tokenize + sort columns once for all rows) ──
    // This avoids re-sorting the column list and re-tokenizing on every row.
    // compileFormula() returns an execute(colValues) function that is ~10-50x
    // faster per row than calling evaluateFormula() directly.
    const { formulaCols, execute } = compileFormula(calculatedColumnsFormula, availableCols);

    // ── Compute all row results in one synchronous pass (off the microtask queue)
    // We use a Promise + setTimeout(0) so the React loading state renders BEFORE
    // the CPU-heavy loop blocks the JS thread.
    const updates = await new Promise((resolve) => {
      setTimeout(() => {
        const results = [];
        for (const row of data) {
          try {
            // Build colValues for this row (only the columns used in the formula)
            const colValues = {};
            for (const col of formulaCols) {
              let val = row[col];
              if (val === null || val === undefined || val === "") {
                val = 0;
              } else if (typeof val === "string") {
                const cleaned = val.replace(/[^0-9.-]/g, "");
                val = isNaN(parseFloat(cleaned)) ? 0 : parseFloat(cleaned);
              } else if (typeof val === "number") {
                val = isNaN(val) ? 0 : val;
              }
              colValues[col] = val;
            }
            results.push({ _id: row._id, value: execute(colValues) });
          } catch (err) {
            console.warn(`Row ${row._id}: ${err.message}`);
            results.push({ _id: row._id, value: 0 });
          }
        }
        resolve(results);
      }, 0);
    });

    try {
      // Save formula if it's a new one
      if (!selectedFormula) {
        const formulaResponse = await axios.post(`${import.meta.env.VITE_API_URL}/api/formulas`, {
          formula: calculatedColumnsFormula,
          column: columnToUpdate,
          selected: false,
          brand: selectedBrand,
        });
        if (formulaResponse.status === 201) {
          const newFormula = formulaResponse.data;
          setFormulas((prev) => [
            ...prev,
            {
              label: `${newFormula.formula} → ${newFormula.column} (Inactive)`,
              value: newFormula._id,
              formula: newFormula.formula,
              column: newFormula.column,
              selected: newFormula.selected,
              brand: newFormula.brand,
            },
          ]);
        }
      }

      const loggedInUser = localStorage.getItem("loggedInUser") || localStorage.getItem("userRole") || "Unknown";

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/data-calculated-column`, {
        column: columnToUpdate,
        updates,
        isNewColumn: !replaceColumn && !selectedFormula,
        brand: selectedBrand,
        username: loggedInUser,
      });

      if (response.status === 200) {
        notificationApi.success({ message: "Success", description: response.data.message });
        setCalculatedColumnName("");
        setCalculatedColumnsFormula("");
        setCalculatedSelectedColumns([]);
        setReplaceColumn(null);
        handleFetchData();
        checkTransactions();
      }
    } catch (error) {
      console.error("Error adding calculated column or saving formula:", error.response?.data || error);
      notificationApi.error({
        message: "Error",
        description: error.response?.data?.message || "Error adding calculated column or saving formula. Please try again.",
      });
    } finally {
      setCalculating(false);
    }
  };

  // ─── Undo / Redo ──────────────────────────────────────────────────────────
  const handleUndo = async () => {
    if (!isAuthenticated) return alert("Please authenticate.");
    if (!selectedBrand) return;
    const loggedInUser = localStorage.getItem("loggedInUser") || "Unknown";
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/undo`, {
        brand: selectedBrand,
        username: loggedInUser,
      });
      if (response.status === 200) {
        notificationApi.success({ message: "Undo Success", description: "Changes reverted and logged." });
        handleFetchData();
        checkTransactions();
      }
    } catch {
      notificationApi.error({ message: "Undo failed" });
    }
  };

  const handleRedo = async () => {
    if (!isAuthenticated) return alert("Please authenticate.");
    if (!selectedBrand) return;
    const loggedInUser = localStorage.getItem("loggedInUser") || "Unknown";
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/redo`, {
        brand: selectedBrand,
        username: loggedInUser,
      });
      if (response.status === 200) {
        notificationApi.success({ message: "Redo Success", description: "Changes reapplied and logged." });
        handleFetchData();
        checkTransactions();
      }
    } catch {
      notificationApi.error({ message: "Redo failed" });
    }
  };

  const isEditing = Object.keys(editRows).length > 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {contextHolder}
      <section>
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
                {isAdmin && (
                  <>
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
                  </>
                )}
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
                    <Col span={12}>
                      <Select
                        value={selectedFormula?.value}
                        onChange={handleFormulaSelect}
                        placeholder="Select or create a formula"
                        style={{ width: "100%" }}
                        options={formulas}
                        allowClear
                      />
                    </Col>
                    <Col span={24}>
                      <TextArea
                        value={calculatedColumnsFormula}
                        onChange={handleCalculatedColumnsFormulaChange}
                        placeholder={`Formula (e.g., Col1 + Col2 - Col3). Available columns: ${columnOptions.map((o) => o.value).join(", ") || "fetch data first"}`}
                        rows={4}
                      />
                    </Col>
                    <Col span={24} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <IMButton
                        handleClick={addCalculatedColumn}
                        variant="filled"
                        color="purple"
                        disabled={calculating}
                        loading={calculating}
                      >
                        {selectedFormula ? "Apply Formula to Data" : "Add Calculated Column"}
                      </IMButton>

                      {selectedFormula && (
                        <>
                          <IMButton
                            handleClick={handleUpdateFormula}
                            variant="filled"
                            color="orange"
                          >
                            Update Formula
                          </IMButton>
                          <IMButton
                            handleClick={toggleFormulaSelection}
                            variant="outlined"
                            color={selectedFormula.selected ? "green" : "blue"}
                          >
                            {selectedFormula.selected ? "Deactivate" : "Activate"} Formula
                          </IMButton>
                        </>
                      )}
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
                    disabled={!isAuthenticated || (isEditing && !editColumns.length)}
                  >
                    {isEditing ? "Save All" : "Edit"}
                  </IMButton>
                  {isEditing && (
                    <IMButton color="gray" variant="outlined" handleClick={handleCancel}>
                      Cancel
                    </IMButton>
                  )}
                  <IMButton color="green" variant="filled" handleClick={handleDownload}>
                    Download
                  </IMButton>
                  <IMButton
                    color="red"
                    variant="outlined"
                    handleClick={handleUndo}
                    disabled={!isAuthenticated || !selectedBrand || !canUndo}
                  >
                    Undo
                  </IMButton>
                  <IMButton
                    color="blue"
                    variant="outlined"
                    handleClick={handleRedo}
                    disabled={!isAuthenticated || !selectedBrand || !canRedo}
                  >
                    Redo
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
