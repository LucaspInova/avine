import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/luizr/Downloads/dados avine.xlsx";
const workDir = "C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/spreadsheet-work";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 10,
  tableMaxCellChars: 120,
});
console.log(summary.ndjson);

const sheetNames = workbook.worksheets.items.map((sheet) => sheet.name);
console.log("SHEETS=" + JSON.stringify(sheetNames));
for (const sheetName of sheetNames) {
  const safeName = sheetName.replace(/[^a-z0-9_-]+/gi, "_");
  const topPreview = await workbook.render({ sheetName, range: "A1:D30", scale: 2, format: "png" });
  await fs.writeFile(`${workDir}/before_${safeName}_top.png`, new Uint8Array(await topPreview.arrayBuffer()));
  const bottomPreview = await workbook.render({ sheetName, range: "A1660:D1691", scale: 2, format: "png" });
  await fs.writeFile(`${workDir}/before_${safeName}_bottom.png`, new Uint8Array(await bottomPreview.arrayBuffer()));
}
