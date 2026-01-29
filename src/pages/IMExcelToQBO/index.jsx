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
} from "antd";
import {
  InboxOutlined,
  FileTextOutlined,
  BankOutlined,
} from "@ant-design/icons";
import "./IMExcelToQBO.css";

const { Dragger } = Upload;
const { Option } = Select;
const { Title } = Typography;

// --- CHASE DESCRIPTION PARSER (FIXED) ---
const parseChaseDescription = (desc) => {
  if (!desc) return { name: "Transfer", memo: "" };

  // Check for the specific "ORIG CO NAME:" pattern
  if (desc.includes("ORIG CO NAME:")) {
    try {
      // 1. Get everything AFTER "ORIG CO NAME:"
      let content = desc.split("ORIG CO NAME:")[1];

      // 2. Define the specific labels that mark the END of the company name
      const endMarkers = [
        "ORIG ID:",
        "DESC DATE:",
        "CO ENTRY DESCR:",
        "CO ENTRY",
      ];

      // 3. Find the earliest occurrence of any of these markers
      let cutoffIndex = content.length;
      endMarkers.forEach((marker) => {
        const idx = content.indexOf(marker);
        if (idx !== -1 && idx < cutoffIndex) {
          cutoffIndex = idx;
        }
      });

      // 4. Extract the name up to that marker
      const rawName = content.substring(0, cutoffIndex).trim();

      return {
        name: rawName.substring(0, 32), // QBO limit
        memo: desc.trim(), // Keep full original text in memo
      };
    } catch (e) {
      // Fallback if parsing fails
      return { name: desc.trim().substring(0, 32), memo: desc.trim() };
    }
  }

  // Fallback for Checks or simple descriptions (e.g., "CHECK 20255")
  // For these, we put the description in BOTH name and memo
  return {
    name: desc.trim().substring(0, 32),
    memo: desc.trim(),
  };
};

// --- BANK CONFIGURATION ENGINE ---
const BANK_CONFIGS = {
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
      // Chase often has a single 'Amount' column with signs.
      // If your sheet has separate Debit/Credit, parseFloat will handle the nulls as 0.
      let amount = 0;
      if (row["Amount"] !== undefined) {
        amount = parseFloat(row["Amount"]);
      } else {
        const debit = parseFloat(row["Debit"] || 0);
        const credit = parseFloat(row["Credit"] || 0);
        amount = credit > 0 ? credit : -Math.abs(debit);
      }

      // Use the FIXED parser logic here
      const parsedDesc = parseChaseDescription(
        row["Description"] || row["Details"],
      );

      return {
        date: row["Date"] || row["Posting Date"],
        description: parsedDesc.name, // Extracted Payee name (e.g., AMERICAN EXPRESS)
        memo: parsedDesc.memo, // Full Details
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

  const getCompanyName = (accNum) => {
    if (!accNum || accNum === "Unknown" || accNum === "General_Account")
      return "Account";

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
      const qboContent = createQBOString(accNum, txns);

      const companyName = getCompanyName(accNum);
      const fileName = `${companyName}_${accNum}.qbo`;

      zip.file(fileName, qboContent);
    });

    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, `Converted_Bank_Files_${Date.now()}.zip`);
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

  const createQBOString = (accountNum, transactions) => {
    const nowStr = formatOFXDate(new Date());
    const startDate = transactions.length ? transactions[0].date : nowStr;
    const endDate = transactions.length
      ? transactions[transactions.length - 1].date
      : nowStr;

    const FID = "10809";
    const INTU_BID = "10809";
    const ORG = "Citizens";

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
<BANKID>000000000</BANKID>
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
        <Col xs={24} md={12}>
          <Card
            title="Step 1: Select Bank Format"
            bordered={false}
            className="shadow-card"
          >
            <Select
              placeholder="Select your bank..."
              style={{ width: "100%" }}
              size="large"
              onChange={setSelectedBank}
              value={selectedBank}
            >
              {Object.keys(BANK_CONFIGS).map((key) => (
                <Option key={key} value={key}>
                  <BankOutlined /> {BANK_CONFIGS[key].name}
                </Option>
              ))}
            </Select>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card
            title="Step 2: Upload Statements"
            bordered={false}
            className="shadow-card"
          >
            <Dragger
              customRequest={handleFileUpload}
              showUploadList={false}
              multiple={true}
              accept=".csv,.xls,.xlsx"
              style={{ padding: 20 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: "#1890ff" }} />
              </p>
              <p className="ant-upload-text">
                Click or drag multiple files here
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
          </Card>
        </Col>

        <Col span={24} style={{ textAlign: "center" }}>
          <Button
            type="primary"
            size="large"
            onClick={processFiles}
            loading={processing}
            disabled={files.length === 0 || !selectedBank}
            style={{ width: 200, marginRight: 20 }}
          >
            Process Files
          </Button>

          {Object.keys(groupedData).length > 0 && (
            <Button
              type="primary"
              danger
              size="large"
              onClick={generateAndDownloadZip}
              style={{ width: 200 }}
            >
              Download ZIP
            </Button>
          )}
        </Col>

        {Object.keys(groupedData).length > 0 && (
          <Col span={24}>
            <Card title="Preview & Grouping Result" className="shadow-card">
              <Row gutter={[16, 16]}>
                {Object.keys(groupedData).map((accNum) => (
                  <Col span={24} key={accNum}>
                    <Card
                      type="inner"
                      title={`Account: ${accNum} (${groupedData[accNum].length} transactions)`}
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
