import { Input } from "antd";
import "./IMInput.css";

export const IMInput = ({
  placeholder,
  maxLength,
  showCount,
  type,
  value,
  handleChange,
  ...rest
}) => {
  return (
    <Input
      showCount={showCount}
      maxLength={maxLength}
      className="IMInput"
      placeholder={placeholder}
      type={type}
      value={value}
      onChange={handleChange}
      {...rest}
    />
  );
};
