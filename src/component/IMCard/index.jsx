import React from "react";
import { Card } from "antd"; // Assuming you're using Ant Design's Card component
import "./IMCard.css";

export const IMCard = ({ title, children, className, ...rest }) => {
  // Combine the static 'IMCard' class with the custom className prop
  const combinedClassName = `IMCard ${className || ""}`.trim();

  return (
    <Card
      title={title}
      className={combinedClassName}
      variant="borderless"
      {...rest}
    >
      {children}
    </Card>
  );
};
