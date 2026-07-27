import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/Users/luizr/Downloads/dados avine.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Planilha1");
const values = sheet.getRange("A1:D1691").values;

const rows = values.slice(1).map((row, index) => ({
  sourceRow: index + 2,
  row,
  code: row[0] == null ? "" : String(row[0]).trim(),
}));
const dataRows = rows.filter(({ row }) => row.some((cell) => cell !== null && cell !== ""));
const byCode = new Map();
for (const item of dataRows) {
  const key = item.code || `__blank_code__${item.sourceRow}`;
  if (!byCode.has(key)) byCode.set(key, []);
  byCode.get(key).push(item);
}
const duplicateCodes = [...byCode.entries()]
  .filter(([, items]) => items.length > 1)
  .map(([code, items]) => ({
    code,
    rows: items.map((item) => item.sourceRow),
    values: items.map((item) => item.row),
  }));
const exactKeys = new Map();
for (const item of dataRows) {
  const key = JSON.stringify(item.row.map((cell) => cell == null ? "" : String(cell).trim().toUpperCase()));
  exactKeys.set(key, (exactKeys.get(key) ?? 0) + 1);
}
console.log(JSON.stringify({
  totalSheetRows: values.length,
  nonEmptyDataRows: dataRows.length,
  uniqueCodes: byCode.size,
  duplicateCodeGroups: duplicateCodes.length,
  duplicateRowsByCode: duplicateCodes.reduce((sum, item) => sum + item.rows.length - 1, 0),
  exactDuplicateRows: [...exactKeys.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
  blankCodeRows: dataRows.filter((item) => !item.code).map((item) => item.sourceRow),
  duplicateCodes,
}, null, 2));
