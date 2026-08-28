import { parseCsv } from "./google-sheets-devolucoes.ts";
import { normalizeText, toInteger } from "./devolucoes-sync.ts";

export const COPIA_V1_HEADERS = [
  "NFD",
  "FSTD",
  "ID",
  "Data de Emissão",
  "Data da Baixa",
  "Valor $",
  "VL GALINHA",
  "VL CODORNA",
  "MOTORISTA",
  "Motivo da Emissão",
  "Nome Abreviado",
  "Responsavel FSTD",
  "GALINHA NFD",
  "CODORNA NFD",
  "GALINHA RETORNO",
  "CODORNA RETORNO",
] as const;

export interface ComparableFstdLegadoRecord {
  codigo_loja: string;
  numero_nfd: string;
  id: string;
  numero_controle: string | null;
  data_preenchimento: string;
  responsavel_fstd: string | null;
  motivo: string | null;
  qtd_total_galinha: number;
  qtd_retorno_galinha: number;
  qtd_total_codorna: number;
  qtd_retorno_codorna: number;
  origem: string;
}

export interface FstdLegadoRecord extends ComparableFstdLegadoRecord {
  origem: "COPIA V1";
}

export interface InvalidCopiaV1Row {
  row: number;
  error: string;
  id: string | null;
  nfd: string | null;
}

export interface NormalizedCopiaV1Data {
  receivedCount: number;
  records: FstdLegadoRecord[];
  invalidRows: InvalidCopiaV1Row[];
}

function parseRequiredInteger(value: unknown, field: string): number {
  // A COPIA V1 pode exportar quantidades com virgulas no meio do numero
  // (por exemplo, "1,31"). Neste fluxo, a virgula e apenas um separador
  // indevido da origem; remove-la evita que a linha seja descartada como
  // decimal e preserva a regra de destino de trabalhar com inteiros.
  const normalizedValue = typeof value === "string"
    ? value.replaceAll(",", "")
    : value;
  const parsed = toInteger(normalizedValue, field);
  if (parsed < 0) {
    throw new Error(`Campo ${field} nao pode ser negativo.`);
  }
  return parsed;
}

function parseDate(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) {
    throw new Error("Campo Data da Baixa obrigatorio ausente.");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T00:00:00.000Z`;
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Data da Baixa invalida: ${raw}`);
  }

  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Data da Baixa invalida: ${raw}`);
  }

  return date.toISOString();
}

function parseId(value: unknown, numeroNfd: string): { codigoLoja: string; id: string } {
  const id = normalizeText(value);
  if (!id) {
    throw new Error("Campo ID obrigatorio ausente.");
  }

  const match = id.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    throw new Error(`ID invalido: ${id}. Esperado: codigo da loja - NFD.`);
  }

  const [, codigoLoja, nfdNoId] = match;
  if (nfdNoId !== numeroNfd) {
    throw new Error(`ID ${id} nao confere com a NFD ${numeroNfd}.`);
  }

  return { codigoLoja, id: `${codigoLoja} - ${nfdNoId}` };
}

function assertHeaders(headers: string[]): void {
  const actual = headers.slice(0, COPIA_V1_HEADERS.length);
  if (
    actual.length !== COPIA_V1_HEADERS.length ||
    actual.some((header, index) => header.trim() !== COPIA_V1_HEADERS[index])
  ) {
    throw new Error(
      `Cabecalhos inesperados em COPIA V1. Esperado: ${COPIA_V1_HEADERS.join(" | ")}.`,
    );
  }
}

function normalizeRow(row: string[]): FstdLegadoRecord {
  const numeroNfd = String(parseRequiredInteger(row[0], "NFD"));
  const { codigoLoja, id } = parseId(row[2], numeroNfd);

  return {
    codigo_loja: codigoLoja,
    numero_nfd: numeroNfd,
    id,
    numero_controle: normalizeText(row[1]),
    data_preenchimento: parseDate(row[4]),
    responsavel_fstd: normalizeText(row[11]),
    motivo: normalizeText(row[9]),
    qtd_total_galinha: parseRequiredInteger(row[12], "GALINHA NFD"),
    qtd_total_codorna: parseRequiredInteger(row[13], "CODORNA NFD"),
    qtd_retorno_galinha: parseRequiredInteger(row[14], "GALINHA RETORNO"),
    qtd_retorno_codorna: parseRequiredInteger(row[15], "CODORNA RETORNO"),
    origem: "COPIA V1",
  };
}

export function normalizeCopiaV1Csv(input: string): NormalizedCopiaV1Data {
  const rows = parseCsv(input);
  const [headers = [], ...dataRows] = rows;
  assertHeaders(headers);

  const records: FstdLegadoRecord[] = [];
  const invalidRows: InvalidCopiaV1Row[] = [];

  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index];
    if (!row.some((value) => value.trim())) continue;

    try {
      records.push(normalizeRow(row));
    } catch (error) {
      invalidRows.push({
        row: index + 2,
        error: error instanceof Error ? error.message : String(error),
        id: normalizeText(row[2]),
        nfd: normalizeText(row[0]),
      });
    }
  }

  return { receivedCount: dataRows.length, records, invalidRows };
}

export function comparisonKey(record: ComparableFstdLegadoRecord): string {
  return [
    record.codigo_loja,
    record.numero_nfd,
    record.id,
    record.numero_controle ?? "<null>",
    record.data_preenchimento,
    record.responsavel_fstd ?? "<null>",
    record.motivo ?? "<null>",
    record.qtd_total_galinha,
    record.qtd_retorno_galinha,
    record.qtd_total_codorna,
    record.qtd_retorno_codorna,
    record.origem,
  ].join("\u001f");
}

export interface PlannedCopiaV1Insert {
  record: FstdLegadoRecord;
  occurrence: number;
}

/**
 * Decide a carga sem depender da linha fisica da planilha. Assim, registros
 * legitimamente iguais continuam representados pela sua ocorrencia, enquanto
 * uma nova leitura do mesmo CSV nao cria duplicatas.
 */
export function planCopiaV1Sync(
  sourceRecords: FstdLegadoRecord[],
  existingRecords: ComparableFstdLegadoRecord[],
): {
  recordsToInsert: PlannedCopiaV1Insert[];
  matchedCount: number;
  divergentExisting: ComparableFstdLegadoRecord[];
} {
  const existingCounts = new Map<string, number>();
  for (const record of existingRecords) {
    const key = comparisonKey(record);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  const sourceOccurrences = new Map<string, number>();
  const recordsToInsert: PlannedCopiaV1Insert[] = [];
  for (const record of sourceRecords) {
    const key = comparisonKey(record);
    const occurrence = (sourceOccurrences.get(key) ?? 0) + 1;
    sourceOccurrences.set(key, occurrence);

    if (occurrence > (existingCounts.get(key) ?? 0)) {
      recordsToInsert.push({ record, occurrence });
    }
  }

  const sourceCounts = new Map<string, number>();
  for (const record of sourceRecords) {
    const key = comparisonKey(record);
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const divergentExisting = existingRecords.filter((record) => {
    if (record.origem !== "COPIA V1") return false;
    const key = comparisonKey(record);
    const count = sourceCounts.get(key) ?? 0;
    if (count === 0) return true;
    sourceCounts.set(key, count - 1);
    return false;
  });

  return {
    recordsToInsert,
    matchedCount: sourceRecords.length - recordsToInsert.length,
    divergentExisting,
  };
}

export async function sourceHash(
  record: FstdLegadoRecord,
  occurrence: number,
): Promise<string> {
  const payload = `${comparisonKey(record)}\u001f${occurrence}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `copia-v1-live-${hex}`;
}
