import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputPath = "C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/outputs/20260727_lojas_sem_duplicidade/dados_avine_sem_duplicidades.xlsx";
const input = await FileBlob.load(outputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Planilha1");
const values = sheet.getRange("A1:D1691").values;
const rows = values.slice(1).filter((row) => row.some((cell) => cell !== null && cell !== ""));
const codes = rows.map((row) => String(row[0] ?? "").trim()).filter(Boolean);
const uniqueCodes = new Set(codes);
const duplicateCodes = codes.filter((code, index) => codes.indexOf(code) !== index);

const summary = await workbook.inspect({
  kind: "sheet,table",
  sheetId: "Planilha1",
  range: "A1:D20",
  maxChars: 6000,
  tableMaxRows: 20,
  tableMaxCols: 4,
});
console.log(summary.ndjson);
console.log(JSON.stringify({
  nonEmptyRows: rows.length,
  uniqueCodes: uniqueCodes.size,
  duplicateCodes: [...new Set(duplicateCodes)],
  outputPath,
}, null, 2));
