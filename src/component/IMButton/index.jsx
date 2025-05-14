import { Button } from "antd";
import "./IMButton.css";

export const IMButton = ({
  color,
  variant,
  children,
  handleClick,
  className,
  ...rest
}) => {
  return (
    <Button
      className={`IMButton ${className}`}
      color={color}
      variant={variant}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </Button>
  );
};
