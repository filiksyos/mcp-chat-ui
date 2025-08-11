import moment from "moment-timezone";

export const parseJSON = (value: string): any => {
  try {
    if (!value || value.trim() === "") {
      return {};
    }
    return JSON.parse(value);
  } catch (e) {
    console.warn("JSON parse failed, returning raw value:", e);
    return value;
  }
};

export const now = () =>
  moment()
    .tz(process.env.TZ_IANA || "America/Los_Angeles")
    .format("YYYY-MM-DD HH:mm:ss");

export const convertAllDateTimesInText = (text: string) => {
  if (typeof text !== "string" || !text) {
    return text;
  }

  const dateTimeRegex = /(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})/g;

  const replacementPattern = "$1T$2";

  return text.replace(dateTimeRegex, replacementPattern);
};
