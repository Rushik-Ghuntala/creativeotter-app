export const csvCell = (value: string | number | null) => {
  let text = value === null ? "" : String(value)
  if (typeof value === "string" && /^[=+@\-\t\r\n]/.test(text))
    text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export const csvRow = (values: (string | number | null)[]) =>
  values.map(csvCell).join(",") + "\r\n"
