import { Popover } from "antd";
import "./IMPopover.css";

export const IMPopover = ({ content, title, className, ...rest }) => {
  return (
    <Popover
      className={`IMPopover ${className}`}
      content={content}
      title={title}
      {...rest}
    >
      <i className="ri-information-line"></i>
    </Popover>
  );
};
