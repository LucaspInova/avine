import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  addDays,
  conferirFstdAvulsas,
  getYesterdayInFortaleza,
  insertOnlyNewItems,
  INVALID_ITEMS_LOG_LIMIT,
  INVALID_ITEMS_RESPONSE_LIMIT,
  isValidIsoDate,
  jsonResponse,
  LOG_TABLE_NAME,
  readJsonRequestBody,
  requireCronAuthorization,
  syncLojas,
} from "../_shared/devolucoes-sync.ts";
import {
  normalizeSheetCsv,
  summarizeInvalidSheetItems,
} from "../_shared/google-sheets-devolucoes.ts";

const SPREADSHEET_ID = "1d0FwvgxWRl_qfYtKTuSXe-GiJrXszvvIPcl2xpLllQg";
const SHEET_NAME = "ITENS DA DEVOLUÇÃO";
const DEFAULT_LOOKBACK_DAYS = 21;
const MAX_LOOKBACK_DAYS = 31;
const FETCH_TIMEOUT_MS = 120_000;

interface DateRange {
  startDate: string;
  endDate: string;
}

function inclusiveDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function resolveDateRange(
  requestUrl: URL,
  body: Record<string, unknown>,
): DateRange {
  const dueDate = requestUrl.searchParams.get("due_date") ??
    (body.due_date === undefined ? undefined : String(body.due_date));

  if (dueDate !== undefined) {
    if (!isValidIsoDate(dueDate)) {
      throw new Error("due_date inválido. Utilize o formato YYYY-MM-DD.");
    }
    return { startDate: dueDate, endDate: dueDate };
  }

  const endDate = requestUrl.searchParams.get("end_date") ??
    (body.end_date === undefined
      ? getYesterdayInFortaleza()
      : String(body.end_date));
  const startDate = requestUrl.searchParams.get("start_date") ??
    (body.start_date === undefined
      ? addDays(endDate, -(DEFAULT_LOOKBACK_DAYS - 1))
      : String(body.start_date));

  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    throw new Error(
      "start_date e end_date devem utilizar o formato YYYY-MM-DD.",
    );
  }

  const days = inclusiveDays(startDate, endDate);
  if (days < 1) {
    throw new Error("start_date não pode ser posterior a end_date.");
  }
  if (days > MAX_LOOKBACK_DAYS) {
    throw new Error(
      `O intervalo máximo por chamada é de ${MAX_LOOKBACK_DAYS} dias.`,
    );
  }

  return { startDate, endDate };
}

function buildSheetsQueryUrl({ startDate, endDate }: DateRange): URL {
  const query = [
    "select A,B,D,E,F,J,K,N,O,P,Q,R,S,U",
    `where D >= date '${startDate}' and D <= date '${endDate}'`,
  ].join(" ");
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`,
  );
  url.searchParams.set("sheet", SHEET_NAME);
  url.searchParams.set("headers", "1");
  url.searchParams.set("tqx", "out:csv");
  url.searchParams.set("tq", query);
  return url;
}

function assertNotGoogleError(body: string): void {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<")) {
    throw new Error(
      "A planilha não retornou CSV. Confirme se o acesso por link continua habilitado.",
    );
  }

  if (!trimmed.startsWith("{")) {
    return;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      status?: unknown;
      errors?: Array<{ detailed_message?: unknown; message?: unknown }>;
    };
    if (parsed.status === "error") {
      const detail = parsed.errors?.[0]?.detailed_message ??
        parsed.errors?.[0]?.message ?? "erro não detalhado";
      throw new Error(`A consulta da planilha falhou: ${String(detail)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("A consulta")) {
      throw error;
    }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(
      { success: false, error: "Método não permitido. Utilize GET ou POST." },
      405,
    );
  }

  const authorizationError = requireCronAuthorization(req);
  if (authorizationError) {
    return jsonResponse(
      { success: false, error: authorizationError },
      authorizationError === "Não autorizado." ? 401 : 500,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const databaseSecretKey = Deno.env.get("DB_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !databaseSecretKey) {
    return jsonResponse(
      {
        success: false,
        error: "Secrets de acesso ao banco não estão completos.",
      },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, databaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let logId: number | null = null;
  let range: DateRange | null = null;
  let sheetsUrl: URL | null = null;

  try {
    const body = await readJsonRequestBody(req);
    range = resolveDateRange(new URL(req.url), body);
    sheetsUrl = buildSheetsQueryUrl(range);

    const { data: createdLog, error: createLogError } = await supabase
      .from(LOG_TABLE_NAME)
      .insert({
        fonte: "sheets",
        data_referencia: range.endDate,
        status: "executando",
        url_consultada: sheetsUrl.toString(),
        mensagem:
          `Consulta à planilha iniciada (${range.startDate} a ${range.endDate}).`,
      })
      .select("id")
      .single();

    if (createLogError) {
      throw new Error(
        `Não foi possível criar o log: ${createLogError.message}`,
      );
    }

    logId = createdLog.id;
    console.log(JSON.stringify({
      event: "sync_started",
      source: "sheets",
      start_date: range.startDate,
      end_date: range.endDate,
      log_id: logId,
    }));

    const sheetsResponse = await fetch(sheetsUrl, {
      method: "GET",
      headers: { Accept: "text/csv" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const responseText = await sheetsResponse.text();

    if (!sheetsResponse.ok) {
      throw new Error(
        `O Google Sheets respondeu com HTTP ${sheetsResponse.status}.`,
      );
    }
    assertNotGoogleError(responseText);

    const normalized = normalizeSheetCsv(responseText);
    if (normalized.receivedCount === 0) {
      await supabase.from(LOG_TABLE_NAME).update({
        status: "sem_dados",
        finalizado_em: new Date().toISOString(),
        registros_recebidos: 0,
        registros_processados: 0,
        registros_invalidos: 0,
        detalhes_invalidos: [],
        mensagem:
          `A planilha não retornou registros de ${range.startDate} a ${range.endDate}.`,
      }).eq("id", logId);

      return jsonResponse({
        success: true,
        source: "sheets",
        status: "sem_dados",
        start_date: range.startDate,
        end_date: range.endDate,
        registros_recebidos: 0,
        registros_processados: 0,
        log_id: logId,
      });
    }

    if (normalized.items.length === 0) {
      throw new Error(
        `A planilha retornou ${normalized.receivedCount} registros, mas nenhum passou pela validação. Primeiro erro: ${
          normalized.invalidItems[0]?.error ?? "não identificado"
        }.`,
      );
    }

    const { insertedCount, batchCount } = await insertOnlyNewItems(
      supabase,
      normalized.items,
    );
    await syncLojas(supabase, normalized.items);
    const conferenciaData = await conferirFstdAvulsas(supabase);

    const invalidDetails = summarizeInvalidSheetItems(
      normalized.invalidItems,
      INVALID_ITEMS_LOG_LIMIT,
    );
    const finishMessage =
      `Sincronização Sheets concluída: ${insertedCount} novos itens inseridos, ` +
      `${normalized.items.length - insertedCount} já existentes, ` +
      `${normalized.duplicateCount} linhas agregadas e ` +
      `${normalized.invalidItems.length} inválidas ignoradas.`;

    const { error: finishLogError } = await supabase
      .from(LOG_TABLE_NAME)
      .update({
        status: "sucesso",
        finalizado_em: new Date().toISOString(),
        registros_recebidos: normalized.receivedCount,
        registros_processados: insertedCount,
        registros_invalidos: normalized.invalidItems.length,
        detalhes_invalidos: invalidDetails,
        mensagem: finishMessage,
      })
      .eq("id", logId);

    if (finishLogError) {
      console.error(JSON.stringify({
        event: "log_update_failed",
        source: "sheets",
        log_id: logId,
        error: finishLogError.message,
      }));
    }

    return jsonResponse({
      success: true,
      source: "sheets",
      status: "sucesso",
      start_date: range.startDate,
      end_date: range.endDate,
      registros_recebidos: normalized.receivedCount,
      registros_validos: normalized.validRowCount,
      registros_invalidos: normalized.invalidItems.length,
      registros_duplicados_agregados: normalized.duplicateCount,
      registros_apos_agregacao: normalized.items.length,
      registros_inseridos: insertedCount,
      registros_ja_existentes: normalized.items.length - insertedCount,
      lotes_processados: batchCount,
      conferencia_fstd_avulsas: conferenciaData,
      erros_amostra: summarizeInvalidSheetItems(
        normalized.invalidItems,
        INVALID_ITEMS_RESPONSE_LIMIT,
      ),
      log_id: logId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      event: "sync_failed",
      source: "sheets",
      start_date: range?.startDate ?? null,
      end_date: range?.endDate ?? null,
      log_id: logId,
      error: errorMessage,
    }));

    if (logId !== null) {
      await supabase.from(LOG_TABLE_NAME).update({
        status: "erro",
        finalizado_em: new Date().toISOString(),
        mensagem: "A sincronização por Sheets não foi concluída.",
        erro: errorMessage.slice(0, 5000),
      }).eq("id", logId);
    }

    return jsonResponse(
      {
        success: false,
        source: "sheets",
        status: "erro",
        start_date: range?.startDate ?? null,
        end_date: range?.endDate ?? null,
        log_id: logId,
        error: errorMessage,
      },
      500,
    );
  }
});
