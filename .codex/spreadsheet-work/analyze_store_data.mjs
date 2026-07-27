import fs from "node:fs/promises";

const stores = JSON.parse(await fs.readFile("C:/Users/luizr/OneDrive/Desktop/Projeto avine t/avine/spreadsheet-work/stores_unique.json", "utf8"));
const allowed = new Set(["CE", "MA", "BA", "PA", "PB", "PI", "PE", "AP", "SE", "RN", "AL"]);
const byUf = new Map();
for (const store of stores) byUf.set(store.uf, (byUf.get(store.uf) ?? 0) + 1);
const invalid = stores.filter((store) => !allowed.has(store.uf));
console.log(JSON.stringify({
  total: stores.length,
  byUf: Object.fromEntries([...byUf.entries()].sort()),
  invalidCount: invalid.length,
  invalid,
}, null, 2));
