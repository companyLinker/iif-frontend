import React from "react";
import { Table } from "antd";
import "./IMTable.css";

export const IMTable = ({
  columns,
  dataSource,
  handleTableChange,
  ...rest
}) => {
  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      onChange={handleTableChange}
      className="IMTable"
      rowHoverable={false}
      {...rest}
    />
  );
};
