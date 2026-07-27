import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/luizr/Downloads/dados avine.xlsx";
const outputDir = "C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/outputs/20260727_lojas_sem_duplicidade";
const outputPath = `${outputDir}/dados_avine_sem_duplicidades.xlsx`;
const previewDir = "C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/spreadsheet-work";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Planilha1");
const sourceRange = sheet.getRange("A1:D1691");
const allValues = sourceRange.values;
const header = allValues[0];
const sourceRows = allValues.slice(1);

const seenCodes = new Set();
const keptRows = [];
const removedRows = [];
for (let index = 0; index < sourceRows.length; index += 1) {
  const row = sourceRows[index];
  const sourceRowNumber = index + 2;
  const isBlank = row.every((cell) => cell === null || cell === "");
  if (isBlank) continue;
  const code = row[0] == null ? "" : String(row[0]).trim();
  if (code && seenCodes.has(code)) {
    removedRows.push({ sourceRowNumber, code, row });
    continue;
  }
  if (code) seenCodes.add(code);
  keptRows.push(row);
}

// Keep the existing header and formatting; rewrite only the data contents.
sheet.getRange("A2:D1691").clear({ applyTo: "contents" });
if (keptRows.length > 0) {
  sheet.getRangeByIndexes(1, 0, keptRows.length, 4).values = keptRows;
}

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const check = await workbook.inspect({
  kind: "table",
  sheetId: "Planilha1",
  range: `A1:D${Math.min(20, keptRows.length + 1)}`,
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 4,
  tableMaxCellChars: 80,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const topPreview = await workbook.render({ sheetName: "Planilha1", range: "A1:D30", scale: 2, format: "png" });
await fs.writeFile(`${previewDir}/after_Planilha1_top.png`, new Uint8Array(await topPreview.arrayBuffer()));
const bottomStartRow = Math.max(1, keptRows.length - 20);
const bottomPreview = await workbook.render({ sheetName: "Planilha1", range: `A${bottomStartRow}:D${keptRows.length + 1}`, scale: 2, format: "png" });
await fs.writeFile(`${previewDir}/after_Planilha1_bottom.png`, new Uint8Array(await bottomPreview.arrayBuffer()));

console.log(JSON.stringify({
  originalNonEmptyRows: sourceRows.filter((row) => row.some((cell) => cell !== null && cell !== "")).length,
  keptRows: keptRows.length,
  removedRows: removedRows.length,
  removed: removedRows.map(({ sourceRowNumber, code }) => ({ sourceRowNumber, code })),
  outputPath,
}, null, 2));
