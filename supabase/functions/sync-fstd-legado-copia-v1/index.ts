import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  INVALID_ITEMS_LOG_LIMIT,
  INVALID_ITEMS_RESPONSE_LIMIT,
  jsonResponse,
  LOG_TABLE_NAME,
  requireCronAuthorization,
  splitIntoBatches,
  formatDateInTimeZone,
} from "../_shared/devolucoes-sync.ts";
import {
  normalizeCopiaV1Csv,
  planCopiaV1Sync,
  sourceHash,
  type ComparableFstdLegadoRecord,
  type FstdLegadoRecord,
} from "../_shared/copia-v1-legado.ts";

const SPREADSHEET_ID = "1nY6DIL4_PTaxizF60iSY84jGF8zyzvyTrLyJ8V32tK0";
const SHEET_NAME = "COPIA V1";
const FETCH_TIMEOUT_MS = 120_000;
const LEGACY_PAGE_SIZE = 1_000;
const INSERT_BATCH_SIZE = 500;
const SOURCE = "copia_v1";

type SupabaseClient = any;

interface ExistingLegacyRecord extends ComparableFstdLegadoRecord {
  legado_id: number;
}

/**
 * A Data API pode devolver timestamp sem milissegundos ou com offset em vez de
 * `Z`. Normalizamos o registro existente para a mesma representacao usada pela
 * planilha antes de comparar; sem isto, uma mesma NFD poderia parecer nova.
 */
function normalizeExistingRecord(value: Record<string, unknown>): ExistingLegacyRecord | null {
  const date = value.data_preenchimento === null || value.data_preenchimento === undefined
    ? null
    : new Date(String(value.data_preenchimento));
  const requiredNumbers = [
    value.qtd_total_galinha,
    value.qtd_retorno_galinha,
    value.qtd_total_codorna,
    value.qtd_retorno_codorna,
  ].map(Number);

  if (
    !date || Number.isNaN(date.getTime()) ||
    requiredNumbers.some((number) => !Number.isInteger(number)) ||
    value.legado_id === null || value.legado_id === undefined
  ) {
    return null;
  }

  return {
    legado_id: Number(value.legado_id),
    codigo_loja: String(value.codigo_loja ?? "").trim(),
    numero_nfd: String(value.numero_nfd ?? "").trim(),
    id: String(value.id ?? "").trim(),
    numero_controle: value.numero_controle === null || value.numero_controle === undefined
      ? null
      : String(value.numero_controle).trim(),
    data_preenchimento: date.toISOString(),
    responsavel_fstd: value.responsavel_fstd === null || value.responsavel_fstd === undefined
      ? null
      : String(value.responsavel_fstd).trim(),
    motivo: value.motivo === null || value.motivo === undefined
      ? null
      : String(value.motivo).trim(),
    qtd_total_galinha: requiredNumbers[0],
    qtd_retorno_galinha: requiredNumbers[1],
    qtd_total_codorna: requiredNumbers[2],
    qtd_retorno_codorna: requiredNumbers[3],
    origem: String(value.origem ?? ""),
  };
}

function buildSheetsUrl(): URL {
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`,
  );
  url.searchParams.set("sheet", SHEET_NAME);
  url.searchParams.set("headers", "1");
  url.searchParams.set("tqx", "out:csv");
  return url;
}

function assertNotGoogleError(body: string): void {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<")) {
    throw new Error(
      "A planilha nao retornou CSV. Confirme se o acesso por link continua habilitado.",
    );
  }

  if (!trimmed.startsWith("{")) return;

  try {
    const parsed = JSON.parse(trimmed) as {
      status?: unknown;
      errors?: Array<{ detailed_message?: unknown; message?: unknown }>;
    };
    if (parsed.status === "error") {
      const detail = parsed.errors?.[0]?.detailed_message ??
        parsed.errors?.[0]?.message ?? "erro nao detalhado";
      throw new Error(`A consulta da planilha falhou: ${String(detail)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("A consulta")) {
      throw error;
    }
  }
}

async function readExistingRecords(
  supabase: SupabaseClient,
): Promise<ExistingLegacyRecord[]> {
  const records: ExistingLegacyRecord[] = [];

  for (let from = 0;; from += LEGACY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("fstd_legado")
      .select(
        "legado_id,codigo_loja,numero_nfd,id,numero_controle,data_preenchimento,responsavel_fstd,motivo,qtd_total_galinha,qtd_retorno_galinha,qtd_total_codorna,qtd_retorno_codorna,origem",
      )
      .order("legado_id", { ascending: true })
      .range(from, from + LEGACY_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Nao foi possivel ler fstd_legado: ${error.message}`);
    }

    const page = (data ?? []) as Record<string, unknown>[];
    records.push(
      ...page.map(normalizeExistingRecord).filter(
        (record): record is ExistingLegacyRecord => record !== null,
      ),
    );
    if (page.length < LEGACY_PAGE_SIZE) break;
  }

  return records;
}

async function insertNewRecords(
  supabase: SupabaseClient,
  records: FstdLegadoRecord[],
): Promise<{ insertedCount: number; batchCount: number }> {
  let insertedCount = 0;
  const batches = splitIntoBatches(records, INSERT_BATCH_SIZE);

  for (const batch of batches) {
    const { data, error } = await supabase
      .from("fstd_legado")
      .upsert(batch, { onConflict: "source_hash", ignoreDuplicates: true })
      .select("legado_id");

    if (error) {
      throw new Error(`Nao foi possivel inserir em fstd_legado: ${error.message}`);
    }
    insertedCount += data?.length ?? 0;
  }

  return { insertedCount, batchCount: batches.length };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(
      { success: false, error: "Metodo nao permitido. Utilize GET ou POST." },
      405,
    );
  }

  const authorizationError = requireCronAuthorization(req);
  if (authorizationError) {
    return jsonResponse(
      { success: false, error: authorizationError },
      authorizationError === "Nao autorizado." ? 401 : 500,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const databaseSecretKey = Deno.env.get("DB_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !databaseSecretKey) {
    return jsonResponse(
      { success: false, error: "Secrets de acesso ao banco nao estao completos." },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, databaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const sheetsUrl = buildSheetsUrl();
  let logId: number | null = null;

  try {
    const { data: createdLog, error: createLogError } = await supabase
      .from(LOG_TABLE_NAME)
      .insert({
        fonte: SOURCE,
        data_referencia: formatDateInTimeZone(new Date()),
        status: "executando",
        url_consultada: sheetsUrl.toString(),
        mensagem: "Consulta a COPIA V1 iniciada.",
      })
      .select("id")
      .single();

    if (createLogError) {
      throw new Error(`Nao foi possivel criar o log: ${createLogError.message}`);
    }
    logId = createdLog.id;

    const response = await fetch(sheetsUrl, {
      headers: { Accept: "text/csv" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const csv = await response.text();
    if (!response.ok) {
      throw new Error(`O Google Sheets respondeu com HTTP ${response.status}.`);
    }
    assertNotGoogleError(csv);

    const normalized = normalizeCopiaV1Csv(csv);
    if (normalized.receivedCount === 0) {
      await supabase.from(LOG_TABLE_NAME).update({
        status: "sem_dados",
        finalizado_em: new Date().toISOString(),
        registros_recebidos: 0,
        registros_processados: 0,
        registros_existentes: 0,
        registros_invalidos: 0,
        registros_divergentes: 0,
        detalhes_invalidos: [],
        mensagem: "A aba COPIA V1 nao retornou registros.",
      }).eq("id", logId);

      return jsonResponse({ success: true, source: SOURCE, status: "sem_dados", log_id: logId });
    }

    if (normalized.records.length === 0) {
      throw new Error(
        `A COPIA V1 retornou ${normalized.receivedCount} registros, mas nenhum passou pela validacao.`,
      );
    }

    const existingRecords = await readExistingRecords(supabase);
    const syncPlan = planCopiaV1Sync(normalized.records, existingRecords);
    const recordsToInsert = await Promise.all(syncPlan.recordsToInsert.map(
      async ({ record, occurrence }) => ({
        ...record,
        source_hash: await sourceHash(record, occurrence),
      }),
    ));

    const { insertedCount, batchCount } = await insertNewRecords(
      supabase,
      recordsToInsert,
    );
    const { matchedCount, divergentExisting } = syncPlan;
    const details = [
      ...normalized.invalidRows.slice(0, INVALID_ITEMS_LOG_LIMIT).map((item) => ({
        tipo: "linha_invalida",
        ...item,
      })),
      ...divergentExisting.slice(0, INVALID_ITEMS_LOG_LIMIT).map((item) => ({
        tipo: "ausente_ou_alterada_na_origem",
        codigo_loja: item.codigo_loja,
        numero_nfd: item.numero_nfd,
        id: item.id,
      })),
    ];
    const message =
      `Sincronizacao COPIA V1 concluida: ${insertedCount} novos registros inseridos, ` +
      `${matchedCount} ja existentes, ${normalized.invalidRows.length} invalidos e ` +
      `${divergentExisting.length} divergentes mantidos no historico.`;

    const { error: finishLogError } = await supabase.from(LOG_TABLE_NAME).update({
      status: "sucesso",
      finalizado_em: new Date().toISOString(),
      registros_recebidos: normalized.receivedCount,
      registros_processados: insertedCount,
      registros_existentes: matchedCount,
      registros_invalidos: normalized.invalidRows.length,
      registros_divergentes: divergentExisting.length,
      detalhes_invalidos: details,
      mensagem: message,
    }).eq("id", logId);
    if (finishLogError) {
      console.error(JSON.stringify({ event: "log_update_failed", log_id: logId, error: finishLogError.message }));
    }

    return jsonResponse({
      success: true,
      source: SOURCE,
      status: "sucesso",
      registros_recebidos: normalized.receivedCount,
      registros_validos: normalized.records.length,
      registros_invalidos: normalized.invalidRows.length,
      registros_inseridos: insertedCount,
      registros_ja_existentes: matchedCount,
      registros_divergentes: divergentExisting.length,
      lotes_processados: batchCount,
      erros_amostra: details.slice(0, INVALID_ITEMS_RESPONSE_LIMIT),
      log_id: logId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "sync_failed", source: SOURCE, log_id: logId, error: errorMessage }));
    if (logId !== null) {
      await supabase.from(LOG_TABLE_NAME).update({
        status: "erro",
        finalizado_em: new Date().toISOString(),
        mensagem: "A sincronizacao COPIA V1 nao foi concluida.",
        erro: errorMessage.slice(0, 5000),
      }).eq("id", logId);
    }
    return jsonResponse(
      { success: false, source: SOURCE, status: "erro", log_id: logId, error: errorMessage },
      500,
    );
  }
});
