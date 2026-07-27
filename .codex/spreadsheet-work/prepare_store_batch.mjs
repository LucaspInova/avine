import fs from "node:fs/promises";

const dataPath = "C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/spreadsheet-work/stores_unique.json";
const batchIndex = Number(process.argv[2] ?? 0);
const batchSize = Number(process.argv[3] ?? 150);

const stores = JSON.parse(await fs.readFile(dataPath, "utf8"));

const start = batchIndex * batchSize;
const batch = stores.slice(start, start + batchSize);
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const valuesSql = batch
  .map((store) => `(${sqlString(store.codigo)}, ${sqlString(store.nome)}, ${sqlString(store.uf)}, ${sqlString(store.cidade)})`)
  .join(",\n");
const query = batch.length === 0
  ? ""
  : `insert into public.lojas (codigo, nome, uf, cidade) values\n${valuesSql}\non conflict (codigo) do nothing;`;

console.log(JSON.stringify({
  batchIndex,
  batchSize,
  totalUniqueStores: stores.length,
  start,
  count: batch.length,
  query,
}));
