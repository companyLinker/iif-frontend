import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Dragger from "antd/es/upload/Dragger";
import { Col, Row, message, Spin } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { IMCard } from "../../component/IMCard";
import { IMButton } from "../../component/IMButton";
import "./IMChequeSheetGenerator.css";

// Big files are gzipped in the browser first. A proxy in front of the API
// rejects bodies over its limit (nginx default: 1 MB) with a 413 that the
// browser then reports as a misleading CORS error; compressed, a typical
// cheque file is 5-10x smaller and goes through.
const gzipIfPossible = async (file) => {
  if (typeof CompressionStream === "undefined" || file.size < 256 * 1024) {
    return file;
  }
  try {
    const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
    const blob = await new Response(stream).blob();
    return new File([blob], `${file.name}.gz`, { type: "application/gzip" });
  } catch {
    return file;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const IMChequeSheetGenerator = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Route protection: Kick out anyone who is not admin or chequesheet_user
  useEffect(() => {
    const userRole = localStorage.getItem("userRole");
    if (userRole !== "admin" && userRole !== "chequesheet_user") {
      message.error("You do not have permission to view this page.");
      navigate("/"); // Redirect to home
    }
  }, [navigate]);

  const handleBeforeUpload = (file) => {
    setFile(file);
    return false;
  };

  const handleGenerate = async () => {
    if (!file) {
      message.error("Please upload a .txt or .csv file first.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", await gzipIfPossible(file));
      const endpoint = `${import.meta.env.VITE_API_URL}/api/generate-cheque-sheet`;

      // The server may be restarting for a moment: try again on 502/503/504 or
      // a dropped connection (generating a sheet changes nothing, so it is safe).
      let response;
      for (let attempt = 0; ; attempt++) {
        try {
          response = await fetch(endpoint, { method: "POST", body: formData });
        } catch {
          if (attempt < 3) {
            await sleep(1000 * (attempt + 1));
            continue;
          }
          throw new Error(
            "Could not reach the server. Check your connection and try again.",
          );
        }
        if ([502, 503, 504].includes(response.status) && attempt < 3) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        break;
      }

      if (!response.ok) {
        let reason = "";
        if (response.status === 413) {
          reason =
            "The file is larger than the server accepts. Ask an administrator to raise the upload limit.";
        } else {
          try {
            reason = (await response.json()).message;
          } catch {
            // body was not JSON
          }
        }
        throw new Error(reason || `Server responded with ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "ChequeSheets_Output.zip");
      document.body.appendChild(link);
      link.click();
      link.remove();

      message.success("Files generated and downloaded successfully!");
      setFile(null);
    } catch (error) {
      console.error(error);
      message.error(error.message || "An error occurred while generating the files.");
    } finally {
      setLoading(false);
    }
  };

  // Prevent UI flicker for unauthorized roles
  const userRole = localStorage.getItem("userRole");
  if (userRole !== "admin" && userRole !== "chequesheet_user") {
    return null;
  }

  return (
    <Spin spinning={loading} tip="Processing data and generating zip...">
      <Row gutter={[24, 24]}>
        <Col span={12}>
          <IMCard title={"Cheque sheet generator"}>
            <Dragger
              beforeUpload={handleBeforeUpload}
              fileList={file ? [file] : []}
              onRemove={() => setFile(null)}
              accept=".csv"
              style={{ padding: 20 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag .csv file here</p>
              <p className="ant-upload-hint">
                Ensure the file contains the required columns.
              </p>
            </Dragger>
            <IMButton
              color={"green"}
              variant={"solid"}
              className={"mt-4"}
              onClick={handleGenerate}
              disabled={!file}
            >
              Generate & Download
            </IMButton>
          </IMCard>
        </Col>
      </Row>
    </Spin>
  );
};

export default IMChequeSheetGenerator;
