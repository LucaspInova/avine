import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/luizr/Downloads/dados avine.xlsx";
const outputPath = "C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/spreadsheet-work/stores_unique.json";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Planilha1");
const values = sheet.getRange("A1:D1691").values;

const seen = new Set();
const stores = [];
for (const row of values.slice(1)) {
  if (row.every((cell) => cell === null || cell === "")) continue;
  const codigo = String(row[0] ?? "").trim();
  const nome = String(row[1] ?? "").trim();
  const uf = String(row[2] ?? "").trim().toUpperCase();
  const cidade = String(row[3] ?? "").trim();
  if (!codigo || !nome || !uf || !cidade || seen.has(codigo)) continue;
  seen.add(codigo);
  stores.push({ codigo, nome, uf, cidade });
}

await fs.writeFile(outputPath, JSON.stringify(stores), "utf8");
console.log(JSON.stringify({ outputPath, totalUniqueStores: stores.length }));
