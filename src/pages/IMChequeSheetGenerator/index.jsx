import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Dragger from "antd/es/upload/Dragger";
import { Col, Row, message, Spin } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { IMCard } from "../../component/IMCard";
import { IMButton } from "../../component/IMButton";
import "./IMChequeSheetGenerator.css";

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
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        "http://localhost:3001/api/generate-cheque-sheet",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to generate file");
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
      message.error("An error occurred while generating the files.");
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
              accept=".txt,.csv"
              style={{ padding: 20 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag .txt or .csv file here
              </p>
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
