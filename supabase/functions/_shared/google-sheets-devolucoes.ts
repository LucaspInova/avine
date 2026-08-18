import {
  type DevolucaoDatabase,
  isValidIsoDate,
  normalizeText,
  toInteger,
  toMoney,
  toRequiredString,
  uniqueItemKey,
} from "./devolucoes-sync.ts";

const EXPECTED_HEADERS = [
  "Estab",
  "NFD",
  "Data Emissão",
  "Cod Cli",
  "Nome Abrev",
  "Cidade",
  "UF",
  "Item Avine",
  "Descricao do Item Avine",
  "Quant. Galinha",
  "Quant Codorna",
  "Valor Galinha",
  "Valor Codorna",
  "CHAVE",
];

export interface InvalidSheetItem {
  row: number;
  error: string;
  item: Record<string, string | null>;
}

export interface NormalizedSheetData {
  receivedCount: number;
  validRowCount: number;
  duplicateCount: number;
  items: DevolucaoDatabase[];
  invalidItems: InvalidSheetItem[];
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index++) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV inválido: campo entre aspas não foi encerrado.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (rows[0]?.[0]) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  }

  return rows;
}

export function parseSheetDate(value: unknown): string {
  const normalized = toRequiredString(value, "Data Emissão");
  if (isValidIsoDate(normalized)) {
    return normalized;
  }

  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) {
    throw new Error(`Data de emissão inválida: ${normalized}`);
  }

  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  if (!isValidIsoDate(isoDate)) {
    throw new Error(`Data de emissão inválida: ${normalized}`);
  }

  return isoDate;
}

function assertHeaders(headers: string[]): void {
  const actual = headers.slice(0, EXPECTED_HEADERS.length);
  if (
    actual.length !== EXPECTED_HEADERS.length ||
    actual.some((header, index) => header.trim() !== EXPECTED_HEADERS[index])
  ) {
    throw new Error(
      `Cabeçalhos inesperados na planilha. Esperado: ${
        EXPECTED_HEADERS.join(" | ")
      }.`,
    );
  }
}

function invalidPreview(row: string[]): Record<string, string | null> {
  return {
    estabelecimento: normalizeText(row[0]),
    nota_fiscal: normalizeText(row[1]),
    data_emissao: normalizeText(row[2]),
    codigo_cliente: normalizeText(row[3]),
    codigo_produto: normalizeText(row[7]),
    chave_acesso: normalizeText(row[13], { maxLength: 44 }),
  };
}

function normalizeSheetRow(
  row: string[],
  nowIso: string,
): DevolucaoDatabase {
  const chaveAcesso = toRequiredString(row[13], "CHAVE");
  if (!/^\d{44}$/.test(chaveAcesso)) {
    throw new Error(
      `Chave de acesso inválida: ${chaveAcesso}. Esperado: 44 dígitos.`,
    );
  }

  const dataEmissao = parseSheetDate(row[2]);
  const notaFiscal = toInteger(row[1], "NFD");
  const codigoCliente = toInteger(row[3], "Cod Cli");
  const quantidadeGalinha = toInteger(row[9], "Quant. Galinha", 0);
  const quantidadeCodorna = toInteger(row[10], "Quant Codorna", 0);
  const valorGalinha = toMoney(row[11], "Valor Galinha", 0);
  const valorCodorna = toMoney(row[12], "Valor Codorna", 0);

  if (notaFiscal <= 0 || codigoCliente <= 0) {
    throw new Error("NFD e Cod Cli devem ser maiores que zero.");
  }

  if (
    quantidadeGalinha < 0 || quantidadeCodorna < 0 ||
    valorGalinha < 0 || valorCodorna < 0
  ) {
    throw new Error("Quantidades e valores não podem ser negativos.");
  }

  return {
    estabelecimento: toRequiredString(row[0], "Estab"),
    nota_fiscal: notaFiscal,
    chave_acesso: chaveAcesso,
    data_emissao: dataEmissao,
    valor: Number((valorGalinha + valorCodorna).toFixed(2)),
    quantidade_galinha: quantidadeGalinha,
    valor_galinha: valorGalinha,
    quantidade_codorna: quantidadeCodorna,
    valor_codorna: valorCodorna,
    codigo_cliente: codigoCliente,
    nome_abreviado: normalizeText(row[4]),
    uf: normalizeText(row[6], { uppercase: true, maxLength: 2 }),
    cidade: normalizeText(row[5]),
    codigo_produto: toRequiredString(row[7], "Item Avine"),
    descricao_produto: normalizeText(row[8]),
    data_referencia: dataEmissao,
    atualizado_em: nowIso,
  };
}

function assertSameIdentity(
  current: DevolucaoDatabase,
  incoming: DevolucaoDatabase,
): void {
  const identityFields: Array<keyof DevolucaoDatabase> = [
    "estabelecimento",
    "nota_fiscal",
    "chave_acesso",
    "data_emissao",
    "codigo_cliente",
    "codigo_produto",
  ];

  const mismatched = identityFields.find(
    (field) => current[field] !== incoming[field],
  );

  if (mismatched) {
    throw new Error(
      `Linhas da mesma chave/produto divergem no campo ${mismatched}.`,
    );
  }
}

export function normalizeSheetCsv(
  csv: string,
  nowIso = new Date().toISOString(),
): NormalizedSheetData {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    throw new Error("A consulta da planilha retornou um CSV vazio.");
  }

  assertHeaders(rows[0]);

  const dataRows = rows.slice(1).filter((row) =>
    row.some((value) => value.trim())
  );
  const itemsMap = new Map<string, DevolucaoDatabase>();
  const invalidItems: InvalidSheetItem[] = [];
  let validRowCount = 0;
  let duplicateCount = 0;

  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index];

    try {
      const item = normalizeSheetRow(row, nowIso);
      const key = uniqueItemKey(item);
      const existing = itemsMap.get(key);

      if (!existing) {
        itemsMap.set(key, item);
      } else {
        assertSameIdentity(existing, item);
        existing.quantidade_galinha += item.quantidade_galinha;
        existing.quantidade_codorna += item.quantidade_codorna;
        existing.valor_galinha = Number(
          (existing.valor_galinha + item.valor_galinha).toFixed(2),
        );
        existing.valor_codorna = Number(
          (existing.valor_codorna + item.valor_codorna).toFixed(2),
        );
        existing.valor = Number(
          (existing.valor_galinha + existing.valor_codorna).toFixed(2),
        );
        duplicateCount++;
      }

      validRowCount++;
    } catch (error) {
      invalidItems.push({
        row: index + 2,
        error: error instanceof Error ? error.message : String(error),
        item: invalidPreview(row),
      });
    }
  }

  return {
    receivedCount: dataRows.length,
    validRowCount,
    duplicateCount,
    items: Array.from(itemsMap.values()),
    invalidItems,
  };
}

export function summarizeInvalidSheetItems(
  invalidItems: InvalidSheetItem[],
  limit: number,
): Array<Record<string, unknown>> {
  return invalidItems.slice(0, limit).map((invalidItem) => ({
    row: invalidItem.row,
    error: invalidItem.error,
    ...invalidItem.item,
  }));
}
