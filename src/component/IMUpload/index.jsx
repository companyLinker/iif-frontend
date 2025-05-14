import React from "react";
import { Upload } from "antd";
import { IMButton } from "../IMButton";
import { UploadOutlined } from "@ant-design/icons";
import "./IMUpload.css";

export const IMUpload = ({
  handleChange,
  color,
  variant,
  children,
  ...rest
}) => {
  // Custom beforeUpload to handle file locally
  const beforeUpload = (file) => {
    // Call handleChange with the file
    handleChange({ file });
    // Return false to prevent automatic upload
    return false;
  };

  // Customize the upload list item rendering
  const customUploadList = {
    showRemoveIcon: true, // Allow removing the file
    showPreviewIcon: false, // Disable preview
  };

  return (
    <Upload
      className="IMUpload"
      beforeUpload={beforeUpload}
      maxCount={1}
      // Show the file list with custom rendering
      showUploadList={customUploadList}
      // Update file status to 'done' to indicate selection
      onChange={({ file }) => {
        if (file.status !== "removed") {
          file.status = "done"; // Mark as 'done' to show in list without upload
        }
      }}
      {...rest}
    >
      <IMButton
        className={"btnClassName"}
        color={color}
        variant={variant}
        icon={<UploadOutlined />}
      >
        {children}
      </IMButton>
    </Upload>
  );
};
