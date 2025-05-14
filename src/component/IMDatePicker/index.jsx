import { DatePicker } from "antd";
import "./IMDatePicker.css";

export const IMDatePicker = ({
  placeholder,
  handleChange,
  rangePicker,
  defaultValue,
  defaultPickerValue,
  limitDays = null, // Add a new prop with a default value of null
}) => {
  const { RangePicker } = DatePicker;
  const getYearMonth = (date) => date.year() * 12 + date.month();

  const disabledDate = (current, { from, type }) => {
    if (limitDays !== null && from) {
      const minDate = from.add(-limitDays, "days");
      const maxDate = from.add(limitDays, "days");
      switch (type) {
        case "year":
          return (
            current.year() < minDate.year() || current.year() > maxDate.year()
          );
        case "month":
          return (
            getYearMonth(current) < getYearMonth(minDate) ||
            getYearMonth(current) > getYearMonth(maxDate)
          );
        default:
          return Math.abs(current.diff(from, "days")) >= limitDays + 1;
      }
    }
    return false;
  };

  return !rangePicker ? (
    <DatePicker
      format={{
        format: "YYYY-MM-DD",
        type: "mask",
      }}
      placeholder={placeholder}
      className="IMDatePicker"
      popupClassName="IMDatePickerCalender"
      onChange={handleChange}
      defaultValue={defaultValue}
      defaultPickerValue={defaultPickerValue}
    />
  ) : (
    <RangePicker
      className="IMDatePicker"
      popupClassName="IMDatePickerCalender"
      disabledDate={disabledDate}
      placeholder={["From", "To"]}
      onChange={handleChange}
      defaultValue={defaultValue}
      defaultPickerValue={defaultPickerValue}
    />
  );
};
