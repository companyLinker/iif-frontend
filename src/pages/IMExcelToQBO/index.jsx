import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  Row,
  Col,
  Select,
  Upload,
  notification,
  Card,
  Button,
  Table,
  Tag,
  Typography,
  DatePicker,
  Spin,
} from "antd";
import {
  InboxOutlined,
  FileTextOutlined,
  BankOutlined,
  DatabaseOutlined,
  CloudDownloadOutlined,
} from "@ant-design/icons";
import "./IMExcelToQBO.css";

const { Dragger } = Upload;
const { Option } = Select;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// --- CHASE DESCRIPTION PARSER ---
const parseChaseDescription = (desc) => {
  if (!desc) return { name: "Transfer", memo: "" };
  if (desc.includes("ORIG CO NAME:")) {
    try {
      let content = desc.split("ORIG CO NAME:")[1];
      const endMarkers = [
        "ORIG ID:",
        "DESC DATE:",
        "CO ENTRY DESCR:",
        "CO ENTRY",
      ];
      let cutoffIndex = content.length;
      endMarkers.forEach((marker) => {
        const idx = content.indexOf(marker);
        if (idx !== -1 && idx < cutoffIndex) {
          cutoffIndex = idx;
        }
      });
      const rawName = content.substring(0, cutoffIndex).trim();
      return {
        name: rawName.substring(0, 32),
        memo: desc.trim(),
      };
    } catch (e) {
      return { name: desc.trim().substring(0, 32), memo: desc.trim() };
    }
  }
  return {
    name: desc.trim().substring(0, 32),
    memo: desc.trim(),
  };
};

// --- BANK CONFIGURATION ENGINE ---
const BANK_CONFIGS = {
  BOFA_DB: { name: "Bank of America (Database)", isDb: true },
  TDBANK: {
    name: "TD Bank",
    hasHeaders: true,
    mapRow: (row) => {
      let desc = row["Description"];
      let debitVal = row["Debit"];
      let creditVal = row["Credit"];
      let checkVal = row["Check Number"];
      const isShifted =
        debitVal && typeof debitVal === "string" && /[a-zA-Z]/.test(debitVal);
      if (isShifted) {
        desc = `${desc}, ${debitVal}`;
        debitVal = creditVal;
        creditVal = checkVal;
        checkVal = row["Account Running Balance"];
      }
      const debit = parseFloat(debitVal || 0);
      const credit = parseFloat(creditVal || 0);
      const amount = credit > 0 ? credit : -Math.abs(debit);
      return {
        date: row["Date"],
        description: desc,
        amount: amount,
        checkNum: checkVal,
        accountNum: row["Account Number"],
      };
    },
  },
  CHASE: {
    name: "Chase Bank",
    hasHeaders: true,
    mapRow: (row) => {
      let amount = 0;
      if (row["Amount"] !== undefined) {
        amount = parseFloat(row["Amount"]);
      } else {
        const debit = parseFloat(row["Debit"] || 0);
        const credit = parseFloat(row["Credit"] || 0);
        amount = credit > 0 ? credit : -Math.abs(debit);
      }
      const parsedDesc = parseChaseDescription(
        row["Description"] || row["Details"],
      );
      return {
        date: row["Date"] || row["Posting Date"],
        description: parsedDesc.name,
        memo: parsedDesc.memo,
        amount: amount,
        checkNum: row["Check Number"] || row["Check or Slip #"],
        accountNum: row["Account Number"],
      };
    },
  },
  TRUIST: {
    name: "Truist Bank",
    hasHeaders: true,
    mapRow: (row) => {
      let rawAmt = row["Amount"];
      if (typeof rawAmt === "string") {
        rawAmt = rawAmt.replace(/[$,\s]/g, "");
      }
      return {
        date: row["Date"] || row["Posted Date"] || row["Transaction Date"],
        description: row["Full description"] || row["Merchant name"],
        amount: parseFloat(rawAmt),
        checkNum: row["Check/Serial #"],
        accountNum: null,
      };
    },
  },
  WELLSFARGO: {
    name: "Wells Fargo",
    hasHeaders: false,
    mapRow: (row) => {
      const vals = Object.values(row);
      return {
        date: vals[0],
        amount: parseFloat(vals[1]),
        description: vals[4],
        checkNum: null,
        accountNum: null,
      };
    },
  },
  LOWELL: {
    name: "Lowell Five Cent",
    hasHeaders: true,
    mapRow: (row) => {
      const debit = parseFloat(row["Debit"] || 0);
      const credit = parseFloat(row["Credit"] || 0);
      const amount = credit > 0 ? credit : -Math.abs(debit);
      return {
        date: row["Post Date"],
        description: row["Description"],
        amount: amount,
        checkNum: row["Check"],
        accountNum: row["Account Number"],
      };
    },
  },
  FIRSTNATIONAL: {
    name: "First National Bank",
    hasHeaders: true,
    mapRow: (row) => {
      const debit = parseFloat(row["Debit"] || 0);
      const credit = parseFloat(row["Credit"] || 0);
      const amount = credit > 0 ? credit : -Math.abs(debit);
      return {
        date: row["Date"],
        description: row["Description"],
        amount: amount,
        checkNum: row["No."],
        accountNum: null,
      };
    },
  },
  BLUEFOUNDRY: {
    name: "Blue Foundry Bank",
    hasHeaders: true,
    mapRow: (row) => {
      return {
        date: row["Posting Date"],
        description: row["Description"],
        amount: parseFloat(row["Amount"]),
        checkNum: row["Check or Slip #"],
        accountNum: null,
      };
    },
  },
};

const IMExcelToQBO = () => {
  const [selectedBank, setSelectedBank] = useState(null);
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [groupedData, setGroupedData] = useState({});
  const [bankMappings, setBankMappings] = useState([]);

  // --- DB Mode States ---
  const [bofaAccounts, setBofaAccounts] = useState([]);
  const [selectedBofaAccounts, setSelectedBofaAccounts] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    const fetchMappings = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/bank-mapping-data`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        const data = await response.json();
        setBankMappings(data);
      } catch (err) {
        console.error("Failed to fetch bank mappings", err);
      }
    };
    fetchMappings();
  }, []);

  // Fetch BofA Accounts when mode is selected
  useEffect(() => {
    if (selectedBank === "BOFA_DB") {
      setLoadingAccounts(true);
      fetch(`${import.meta.env.VITE_API_URL}/api/bofa-accounts`)
        .then((res) => res.json())
        .then((data) => {
          setBofaAccounts(data);
          setLoadingAccounts(false);
        })
        .catch((err) => {
          console.error(err);
          notification.error({ message: "Failed to fetch accounts" });
          setLoadingAccounts(false);
        });
    }
  }, [selectedBank]);

  const getCompanyName = (accNum) => {
    if (!accNum || accNum === "Unknown" || accNum === "General_Account")
      return "Account";

    // 1. Try DB Mapping
    const mapping = bankMappings.find((item) => {
      const fields = [
        item.BankAccountNo1,
        item.BankAccountNo2,
        item.BankAccountNo3,
        item.BankAccountNo4,
      ];
      return fields.some((field) => field && String(field).includes(accNum));
    });

    if (mapping && mapping.CompanyTaxName) {
      return mapping.CompanyTaxName.trim().replace(/\s+/g, "_");
    }

    // 2. Try BofA Account List
    if (bofaAccounts.length > 0) {
      const bofaAcc = bofaAccounts.find((a) => a.accountNumber === accNum);
      if (bofaAcc) return bofaAcc.accountName.trim().replace(/\s+/g, "_");
    }

    return "Account";
  };

  const handleFileUpload = ({ file, onSuccess }) => {
    setFiles((prev) => [...prev, file]);
    setTimeout(() => onSuccess("ok"), 0);
  };

  const removeFile = (fileToRemove) => {
    setFiles((prev) => prev.filter((f) => f.uid !== fileToRemove.uid));
    setGroupedData({});
  };

  // --- PROCESS DATABASE (BOFA) ---
  const processDatabaseData = async () => {
    if (!selectedBofaAccounts.length || !dateRange) {
      notification.error({ message: "Please select accounts and date range" });
      return;
    }

    setProcessing(true);
    setGroupedData({});

    try {
      const payload = {
        accountNumbers: selectedBofaAccounts,
        startDate: dateRange[0].format("YYYY-MM-DD"),
        endDate: dateRange[1].format("YYYY-MM-DD"),
      };

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/bofa-data`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const transactions = await response.json();

      if (!transactions || transactions.length === 0) {
        notification.warning({ message: "No transactions found" });
        setProcessing(false);
        return;
      }

      const newGroupedData = {};

      transactions.forEach((tx, index) => {
        const accNum = tx.accountNumber;
        if (!newGroupedData[accNum]) newGroupedData[accNum] = [];

        // 1. DATE: 2025-12-02 -> 20251202120000
        const rawDate = tx.asOfDate;
        const formattedDate = rawDate.replace(/-/g, "") + "120000";

        // 2. AMOUNT & TYPE: Use 'Credit'/'Debit' indicator + absolute amount
        const rawAmount = parseFloat(tx.amount || 0);
        let type = "CREDIT";
        let amount = Math.abs(rawAmount);

        if (tx.creditDebitIndicator === "Debit") {
          type = "DEBIT";
          amount = -Math.abs(rawAmount);
        }

        // 3. CHECK NUMBER (If "Check" in text)
        let checkNum = null;
        if (
          (tx.transactionDescription &&
            tx.transactionDescription.toLowerCase().includes("check")) ||
          (tx.detailText && tx.detailText.toLowerCase().includes("check"))
        ) {
          type = "CHECK";
          // Try to find 4+ digit number in details
          const match = (tx.detailText || "").match(/\d{4,}/);
          if (match) checkNum = match[0];
        }

        // 4. NAME: Front text from details (max 32 chars)
        // Matches BofA sample: <NAME>FISERV MERCHANT  DES:DEPOSIT
        let name = (tx.detailText || "Transaction").substring(0, 32);

        // 5. MEMO: Full details
        const memo = `${tx.customerReference || ""} ${tx.detailText || ""}`
          .trim()
          .substring(0, 255);

        // 6. FITID
        const fitId = `${rawDate.replace(/-/g, "")}${accNum}${index}`;

        newGroupedData[accNum].push({
          date: formattedDate,
          amount: amount,
          name: name,
          memo: memo,
          fitId: fitId,
          type: type,
          checkNum: checkNum,
        });
      });

      setGroupedData(newGroupedData);
      notification.success({
        message: "Fetched Data",
        description: `Loaded ${transactions.length} items.`,
      });
    } catch (error) {
      console.error(error);
      notification.error({ message: "Database Error" });
    } finally {
      setProcessing(false);
    }
  };

  // --- PROCESS FILES ---
  const processFiles = async () => {
    if (!selectedBank) {
      notification.error({ message: "Please select a bank first." });
      return;
    }
    if (files.length === 0) {
      notification.error({ message: "Please upload at least one file." });
      return;
    }

    setProcessing(true);
    const bankConfig = BANK_CONFIGS[selectedBank];
    const newGroupedData = {};

    try {
      for (const file of files) {
        const data = await readFile(file);
        const worksheet = data.Sheets[data.SheetNames[0]];
        const jsonOptions = bankConfig.hasHeaders ? {} : { header: 1 };
        let jsonData = XLSX.utils.sheet_to_json(worksheet, jsonOptions);

        jsonData.forEach((row, index) => {
          try {
            const mapped = bankConfig.mapRow(row);

            if (!mapped.date || (mapped.amount === 0 && !mapped.description))
              return;

            let finalAccNum = mapped.accountNum;
            if (!finalAccNum) {
              const fileNameMatch = file.name.match(/^(\d+)/);
              if (fileNameMatch) {
                finalAccNum = fileNameMatch[1];
              } else {
                finalAccNum = "General_Account";
              }
            }
            finalAccNum = String(finalAccNum).replace(/\D/g, "");
            if (finalAccNum === "") finalAccNum = "Unknown";

            if (!newGroupedData[finalAccNum]) {
              newGroupedData[finalAccNum] = [];
            }

            const formattedDate = formatOFXDate(mapped.date);

            let type = "CREDIT";
            if (mapped.amount < 0) type = "DEBIT";
            if (mapped.checkNum) type = "CHECK";

            const fitId = `${finalAccNum}1${formattedDate.substring(
              0,
              8,
            )}${String(index).padStart(7, "0")}`;

            newGroupedData[finalAccNum].push({
              date: formattedDate,
              amount: mapped.amount,
              name: (mapped.description || "Transfer").substring(0, 32),
              memo: (mapped.memo || mapped.description || "").substring(0, 255),
              fitId: fitId,
              type: type,
              checkNum: mapped.checkNum,
            });
          } catch (e) {
            console.warn("Skipping row", row, e);
          }
        });
      }

      setGroupedData(newGroupedData);
      notification.success({
        message: "Processing Complete",
        description: `Found transactions for ${
          Object.keys(newGroupedData).length
        } distinct accounts.`,
      });
    } catch (error) {
      console.error(error);
      notification.error({
        message: "Error reading files",
        description: error.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  const readFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        resolve(workbook);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const formatOFXDate = (dateVal) => {
    try {
      let dateObj;
      if (typeof dateVal === "number") {
        dateObj = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
      } else {
        dateObj = new Date(dateVal);
      }

      if (isNaN(dateObj.getTime())) return "20250101120000";

      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");

      return `${y}${m}${d}120000`;
    } catch {
      return "20250101120000";
    }
  };

  const generateAndDownloadZip = () => {
    const zip = new JSZip();
    const accounts = Object.keys(groupedData);

    if (accounts.length === 0) {
      notification.warning({ message: "No data to download" });
      return;
    }

    accounts.forEach((accNum) => {
      const txns = groupedData[accNum];

      const isBofA = selectedBank === "BOFA_DB";
      const qboContent = createQBOString(accNum, txns, isBofA);

      const companyName = getCompanyName(accNum);
      const fileName = `${companyName}_${accNum}.qbo`;

      zip.file(fileName, qboContent);
    });

    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, `Converted_Transactions_${Date.now()}.zip`);
      notification.success({ message: "ZIP File Downloaded!" });
    });
  };

  const cleanXml = (str) => {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  const createQBOString = (accountNum, transactions, isBofA) => {
    const nowStr = formatOFXDate(new Date());
    const startDate = transactions.length ? transactions[0].date : nowStr;
    const endDate = transactions.length
      ? transactions[transactions.length - 1].date
      : nowStr;

    // Use specific BofA headers if mode is BOFA_DB
    const FID = isBofA ? "13540" : "10809";
    const INTU_BID = isBofA ? "54111" : "10809";
    const ORG = isBofA ? "BankOfAmerica" : "Citizens";
    const BANKID = isBofA ? "011000138" : "000000000";

    let txnString = "";
    transactions.forEach((t) => {
      txnString += `<STMTTRN>
<TRNTYPE>${t.type}
<DTPOSTED>${t.date}
<TRNAMT>${t.amount.toFixed(2)}
<FITID>${t.fitId}${t.checkNum ? `\n<CHECKNUM>${t.checkNum}` : ""}
<NAME>${cleanXml(t.name)}
<MEMO>${cleanXml(t.memo)}
</STMTTRN>
`;
    });

    return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${nowStr}
<LANGUAGE>ENG
<FI>
<ORG>${ORG}
<FID>${FID}
</FI>
<INTU.BID>${INTU_BID}
<INTU.USERID>PNR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>${BANKID}</BANKID>
<ACCTID>${accountNum}</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${startDate}
<DTEND>${endDate}
${txnString}</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>0.00
<DTASOF>${endDate}
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (text) => text.substring(0, 8),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (t) => <Tag color={t === "DEBIT" ? "red" : "green"}>{t}</Tag>,
    },
    { title: "Name", dataIndex: "name", key: "name" },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (a) => (
        <span style={{ color: a < 0 ? "red" : "green" }}>{a.toFixed(2)}</span>
      ),
    },
  ];

  return (
    <div className="im-excel-qbo-container" style={{ padding: 20 }}>
      <Title level={2} style={{ textAlign: "center", marginBottom: 30 }}>
        Advanced Bank to QBO Converter
      </Title>

      <Row gutter={[24, 24]} justify="center">
        {/* --- STEP 1: BANK SELECTION --- */}
        <Col xs={24} md={12}>
          <Card
            title="Step 1: Select Source"
            bordered={false}
            className="shadow-card"
          >
            <Select
              placeholder="Select source..."
              style={{ width: "100%" }}
              size="large"
              onChange={setSelectedBank}
              value={selectedBank}
            >
              {Object.keys(BANK_CONFIGS).map((key) => (
                <Option key={key} value={key}>
                  {BANK_CONFIGS[key].isDb ? (
                    <DatabaseOutlined />
                  ) : (
                    <BankOutlined />
                  )}{" "}
                  {BANK_CONFIGS[key].name}
                </Option>
              ))}
            </Select>
          </Card>
        </Col>

        {/* --- STEP 2: INPUT (FILE OR DB) --- */}
        <Col xs={24} md={12}>
          <Card
            title="Step 2: Provide Data"
            bordered={false}
            className="shadow-card"
          >
            {selectedBank === "BOFA_DB" ? (
              <div style={{ padding: "0 10px" }}>
                <Text strong>Select Accounts:</Text>
                {loadingAccounts ? (
                  <Spin size="small" style={{ marginLeft: 10 }} />
                ) : (
                  <Select
                    mode="multiple"
                    style={{ width: "100%", marginBottom: 15 }}
                    placeholder="Select accounts (Searchable)"
                    optionFilterProp="children"
                    value={selectedBofaAccounts}
                    onChange={setSelectedBofaAccounts}
                  >
                    {bofaAccounts.map((acc) => {
                      // If name is missing or generic, just emphasize the number
                      const displayName =
                        acc.accountName && acc.accountName !== "Unknown Entity"
                          ? `${acc.accountNumber} - ${acc.accountName}`
                          : `${acc.accountNumber} (No Name Available)`;

                      return (
                        <Option
                          key={acc.accountNumber}
                          value={acc.accountNumber}
                        >
                          {displayName}
                        </Option>
                      );
                    })}
                  </Select>
                )}

                <Text strong>Date Range:</Text>
                <RangePicker
                  style={{ width: "100%", marginTop: 5 }}
                  onChange={setDateRange}
                />
              </div>
            ) : (
              // File Upload UI
              <>
                <Dragger
                  customRequest={handleFileUpload}
                  showUploadList={false}
                  multiple={true}
                  accept=".csv,.xls,.xlsx"
                  style={{ padding: 20 }}
                  disabled={!selectedBank}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined style={{ color: "#1890ff" }} />
                  </p>
                  <p className="ant-upload-text">
                    Click or drag statement files here
                  </p>
                </Dragger>
                <div style={{ marginTop: 15 }}>
                  {files.map((f) => (
                    <Tag
                      closable
                      onClose={() => removeFile(f)}
                      key={f.uid}
                      color="blue"
                      style={{ marginBottom: 5 }}
                    >
                      <FileTextOutlined /> {f.name}
                    </Tag>
                  ))}
                </div>
              </>
            )}
          </Card>
        </Col>

        {/* --- ACTION BUTTONS --- */}
        <Col span={24} style={{ textAlign: "center" }}>
          {selectedBank === "BOFA_DB" ? (
            <Button
              type="primary"
              size="large"
              icon={<DatabaseOutlined />}
              onClick={processDatabaseData}
              loading={processing}
              disabled={!selectedBofaAccounts.length || !dateRange}
              style={{ width: 220, marginRight: 20 }}
            >
              Fetch & Process DB
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              onClick={processFiles}
              loading={processing}
              disabled={files.length === 0 || !selectedBank}
              style={{ width: 220, marginRight: 20 }}
            >
              Process Files
            </Button>
          )}

          {Object.keys(groupedData).length > 0 && (
            <Button
              type="primary"
              danger
              size="large"
              icon={<CloudDownloadOutlined />}
              onClick={generateAndDownloadZip}
              style={{ width: 220 }}
            >
              Download ZIP
            </Button>
          )}
        </Col>

        {/* --- PREVIEW SECTION --- */}
        {Object.keys(groupedData).length > 0 && (
          <Col span={24}>
            <Card title="Preview & Grouping Result" className="shadow-card">
              <Row gutter={[16, 16]}>
                {Object.keys(groupedData).map((accNum) => (
                  <Col span={24} key={accNum}>
                    <Card
                      type="inner"
                      title={`${getCompanyName(accNum)} (${accNum}) - ${groupedData[accNum].length} txns`}
                    >
                      <Table
                        dataSource={groupedData[accNum].slice(0, 5)}
                        columns={columns}
                        pagination={false}
                        rowKey="fitId"
                        size="small"
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default IMExcelToQBO;
