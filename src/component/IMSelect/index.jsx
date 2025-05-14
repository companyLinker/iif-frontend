import { Select } from "antd";
import "./IMSelect.css";

export const IMSelect = ({
  handleChange,
  placeholder,
  children,
  style,
  ...rest
}) => {
  return (
    <>
      <Select
        onChange={handleChange}
        allowClear
        placeholder={placeholder}
        style={style}
        {...rest}
      >
        {children}
      </Select>
    </>
  );
};
