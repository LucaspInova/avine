declare const Deno: {
  env: { get(name: string): string | undefined };
};

type SupabaseClient = any;

export const TABLE_NAME = "nfd_itens";
export const LOG_TABLE_NAME = "nfd_logs";
export const TIME_ZONE = "America/Fortaleza";
export const INSERT_BATCH_SIZE = 500;
export const INVALID_ITEMS_LOG_LIMIT = 50;
export const INVALID_ITEMS_RESPONSE_LIMIT = 10;

export type SyncSource = "api" | "sheets";

export interface DevolucaoDatabase {
  estabelecimento: string;
  nota_fiscal: number;
  chave_acesso: string;
  data_emissao: string;
  valor: number;
  quantidade_galinha: number;
  valor_galinha: number;
  quantidade_codorna: number;
  valor_codorna: number;
  codigo_cliente: number;
  nome_abreviado: string | null;
  uf: string | null;
  cidade: string | null;
  codigo_produto: string;
  descricao_produto: string | null;
  data_referencia: string;
  atualizado_em: string;
}

export interface LojaDatabase {
  codigo: string;
  nome: string;
  uf: string;
  cidade: string;
}

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function normalizeText(
  value: unknown,
  options?: {
    uppercase?: boolean;
    maxLength?: number;
  },
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  let normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  if (options?.uppercase) {
    normalized = normalized.toUpperCase();
  }

  if (options?.maxLength) {
    normalized = normalized.slice(0, options.maxLength);
  }

  return normalized;
}

export function toRequiredString(
  value: unknown,
  field: string,
): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`Campo obrigatório ausente: ${field}`);
  }

  return normalized;
}

function normalizedNumericString(value: string): string {
  const trimmed = value.trim();

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)) {
    return trimmed.replaceAll(".", "").replace(",", ".");
  }

  if (/^-?\d+(,\d+)?$/.test(trimmed)) {
    return trimmed.replace(",", ".");
  }

  return trimmed;
}

export function toInteger(
  value: unknown,
  field: string,
  defaultValue?: number,
): number {
  if (
    (value === null || value === undefined || value === "") &&
    defaultValue !== undefined
  ) {
    return defaultValue;
  }

  const parsed = typeof value === "string"
    ? Number(normalizedNumericString(value))
    : Number(value);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(
      `Campo ${field} deveria ser inteiro. Valor recebido: ${String(value)}`,
    );
  }

  return parsed;
}

export function toMoney(
  value: unknown,
  field: string,
  defaultValue?: number,
): number {
  if (
    (value === null || value === undefined || value === "") &&
    defaultValue !== undefined
  ) {
    return defaultValue;
  }

  const parsed = typeof value === "string"
    ? Number(normalizedNumericString(value))
    : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Campo ${field} deveria ser numérico. Valor recebido: ${String(value)}`,
    );
  }

  return Number(parsed.toFixed(2));
}

export function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatDateInTimeZone(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Não foi possível calcular a data no fuso configurado.");
  }

  return `${year}-${month}-${day}`;
}

export function addDays(isoDate: string, days: number): string {
  if (!isValidIsoDate(isoDate)) {
    throw new Error(`Data ISO inválida: ${isoDate}`);
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

export function getYesterdayInFortaleza(): string {
  return addDays(formatDateInTimeZone(new Date()), -1);
}

export function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

export async function readJsonRequestBody(
  req: Request,
): Promise<Record<string, unknown>> {
  if (req.method !== "POST") {
    return {};
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const body = await req.json();
    return typeof body === "object" && body !== null
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function uniqueItemKey(item: DevolucaoDatabase): string {
  return `${item.chave_acesso}::${item.codigo_produto}`;
}

export async function insertOnlyNewItems(
  supabase: SupabaseClient,
  items: DevolucaoDatabase[],
): Promise<{ insertedCount: number; batchCount: number }> {
  const batches = splitIntoBatches(items, INSERT_BATCH_SIZE);
  let insertedCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(batch, {
        onConflict: "chave_acesso,codigo_produto",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      throw new Error(
        `Erro no lote ${batchIndex + 1} de ${batches.length}: ${error.message}`,
      );
    }

    insertedCount += data?.length ?? 0;

    console.log(JSON.stringify({
      event: "batch_processed",
      batch: batchIndex + 1,
      total_batches: batches.length,
      candidate_records: batch.length,
      inserted_records: data?.length ?? 0,
      total_inserted_records: insertedCount,
    }));
  }

  return { insertedCount, batchCount: batches.length };
}

export async function syncLojas(
  supabase: SupabaseClient,
  items: DevolucaoDatabase[],
): Promise<number> {
  const lojasMap = new Map<string, LojaDatabase>();

  for (const item of items) {
    const codigo = String(item.codigo_cliente);
    const nome = item.nome_abreviado?.trim() ?? "";
    const uf = item.uf?.trim().toUpperCase() ?? "";
    const cidade = item.cidade?.trim() ?? "";

    if (codigo && nome && uf && cidade) {
      lojasMap.set(codigo, { codigo, nome, uf, cidade });
    }
  }

  const lojas = Array.from(lojasMap.values());
  if (lojas.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("lojas")
    .upsert(lojas, { onConflict: "codigo", ignoreDuplicates: false });

  if (error) {
    throw new Error(`Não foi possível sincronizar as lojas: ${error.message}`);
  }

  return lojas.length;
}

export async function conferirFstdAvulsas(
  supabase: SupabaseClient,
): Promise<unknown> {
  const { data, error } = await supabase.rpc("conferir_fstd_avulsas");

  if (error) {
    throw new Error(
      `Não foi possível conferir as FSTDs avulsas: ${error.message}`,
    );
  }

  return data;
}

export function requireCronAuthorization(req: Request): string | null {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return "Secret CRON_SECRET não encontrado.";
  }

  return req.headers.get("x-cron-secret") === cronSecret
    ? null
    : "Não autorizado.";
}
