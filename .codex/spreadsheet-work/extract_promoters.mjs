import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/luizr/Downloads/dados avine.xlsx";
const outputPath = "C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/spreadsheet-work/promoters_source.json";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 5000,
  tableMaxRows: 8,
  tableMaxCols: 4,
  tableMaxCellChars: 100,
});
console.log(summary.ndjson);

const sheet = workbook.worksheets.getItemAt(0);
const values = sheet.getRange("A1:D250").values;
const promoters = [];
for (let index = 1; index < values.length; index += 1) {
  const row = values[index];
  if (row.every((cell) => cell === null || cell === "")) continue;
  promoters.push({
    sourceRow: index + 1,
    nome: String(row[0] ?? "").trim(),
    email: String(row[1] ?? "").trim().toLowerCase(),
    perfil: String(row[2] ?? "").trim(),
    estado: String(row[3] ?? "").trim().toUpperCase(),
  });
}

const duplicateEmails = [...new Set(promoters.map((item) => item.email).filter((email, index, values) => values.indexOf(email) !== index))];
const allowedStates = new Set(["CE", "MA", "BA", "PA", "PB", "PI", "PE", "AP", "SE", "RN", "AL"]);
const invalid = promoters.filter((item) => !item.nome || !/^\S+@\S+\.\S+$/.test(item.email) || item.perfil !== "Promotor" || !allowedStates.has(item.estado));

await fs.writeFile(outputPath, JSON.stringify(promoters), "utf8");
console.log(JSON.stringify({
  outputPath,
  totalRows: promoters.length,
  duplicateEmails,
  invalid,
  uniqueEmails: new Set(promoters.map((item) => item.email)).size,
}, null, 2));
