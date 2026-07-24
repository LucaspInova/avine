import { createClient } from "@supabase/supabase-js";

const API_BASE_URL =
  "https://datalake.avine.com.br/api/v1/devolucoes";

const TABLE_NAME = "nfd_itens";
const LOG_TABLE_NAME = "nfd_logs";

const TIME_ZONE = "America/Fortaleza";
const UPSERT_BATCH_SIZE = 500;
const INVALID_ITEMS_LOG_LIMIT = 50;
const INVALID_ITEMS_RESPONSE_LIMIT = 10;

interface ApiDevolucao {
  estabelecimento?: unknown;
  nota_fiscal?: unknown;
  chave_acesso?: unknown;
  data_emissao?: unknown;
  valor?: unknown;
  quantidade_galinha?: unknown;
  valor_galinha?: unknown;
  quantidade_codorna?: unknown;
  valor_codorna?: unknown;
  codigo_cliente?: unknown;
  nome_abreviado?: unknown;
  uf?: unknown;
  cidade?: unknown;
  codigo_produto?: unknown;
  descricao_produto?: unknown;
}

interface DevolucaoDatabase {
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

interface InvalidItem {
  index: number;
  error: string;
  item: ApiDevolucao;
}

interface LojaDatabase {
  codigo: string;
  nome: string;
  uf: string;
  cidade: string;
}

interface RequestBody {
  due_date?: string;
}

function jsonResponse(
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

function normalizeText(
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

function toRequiredString(
  value: unknown,
  field: string,
): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`Campo obrigatório ausente: ${field}`);
  }

  return normalized;
}

function toInteger(
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

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(
      `Campo ${field} deveria ser inteiro. Valor recebido: ${String(value)}`,
    );
  }

  return parsed;
}

function toMoney(
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

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Campo ${field} deveria ser numérico. Valor recebido: ${String(value)}`,
    );
  }

  return Number(parsed.toFixed(2));
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map((part) => Number(part));

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatDateInTimeZone(date: Date): string {
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
    throw new Error(
      "Não foi possível calcular a data no fuso configurado.",
    );
  }

  return `${year}-${month}-${day}`;
}

function getYesterdayInFortaleza(): string {
  const todayString = formatDateInTimeZone(new Date());

  const [year, month, day] = todayString
    .split("-")
    .map((value) => Number(value));

  const yesterday = new Date(
    Date.UTC(year, month - 1, day - 1, 12, 0, 0),
  );

  return yesterday.toISOString().slice(0, 10);
}

function splitIntoBatches<T>(
  items: T[],
  batchSize: number,
): T[][] {
  const batches: T[][] = [];

  for (
    let index = 0;
    index < items.length;
    index += batchSize
  ) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

async function readRequestBody(
  req: Request,
): Promise<RequestBody> {
  if (req.method !== "POST") {
    return {};
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const body = await req.json();

    if (
      typeof body === "object" &&
      body !== null &&
      "due_date" in body
    ) {
      return {
        due_date: String(
          (body as Record<string, unknown>).due_date,
        ),
      };
    }

    return {};
  } catch {
    return {};
  }
}

function normalizeApiItem(
  item: ApiDevolucao,
  dataReferencia: string,
): DevolucaoDatabase {
  const estabelecimento = toRequiredString(
    item.estabelecimento,
    "estabelecimento",
  );

  const chaveAcesso = toRequiredString(
    item.chave_acesso,
    "chave_acesso",
  );

  if (chaveAcesso.length !== 44) {
    throw new Error(
      `Chave de acesso inválida: ${chaveAcesso}. Esperado: 44 caracteres.`,
    );
  }

  const dataEmissao = toRequiredString(
    item.data_emissao,
    "data_emissao",
  );

  if (!isValidIsoDate(dataEmissao)) {
    throw new Error(
      `Data de emissão inválida: ${dataEmissao}`,
    );
  }

  const codigoProduto = toRequiredString(
    item.codigo_produto,
    "codigo_produto",
  );

  return {
    estabelecimento,

    nota_fiscal: toInteger(
      item.nota_fiscal,
      "nota_fiscal",
    ),

    chave_acesso: chaveAcesso,

    data_emissao: dataEmissao,

    valor: toMoney(
      item.valor,
      "valor",
      0,
    ),

    quantidade_galinha: toInteger(
      item.quantidade_galinha,
      "quantidade_galinha",
      0,
    ),

    valor_galinha: toMoney(
      item.valor_galinha,
      "valor_galinha",
      0,
    ),

    quantidade_codorna: toInteger(
      item.quantidade_codorna,
      "quantidade_codorna",
      0,
    ),

    valor_codorna: toMoney(
      item.valor_codorna,
      "valor_codorna",
      0,
    ),

    codigo_cliente: toInteger(
      item.codigo_cliente,
      "codigo_cliente",
    ),

    nome_abreviado: normalizeText(
      item.nome_abreviado,
    ),

    uf: normalizeText(
      item.uf,
      {
        uppercase: true,
        maxLength: 2,
      },
    ),

    cidade: normalizeText(
      item.cidade,
    ),

    codigo_produto: codigoProduto,

    descricao_produto: normalizeText(
      item.descricao_produto,
    ),

    data_referencia: dataReferencia,

    atualizado_em: new Date().toISOString(),
  };
}

function summarizeInvalidItems(
  invalidItems: InvalidItem[],
  limit: number,
): Array<Record<string, unknown>> {
  return invalidItems
    .slice(0, limit)
    .map((invalidItem) => ({
      index: invalidItem.index,
      error: invalidItem.error,
      estabelecimento:
        invalidItem.item.estabelecimento ?? null,
      nota_fiscal:
        invalidItem.item.nota_fiscal ?? null,
      chave_acesso:
        invalidItem.item.chave_acesso ?? null,
      codigo_produto:
        invalidItem.item.codigo_produto ?? null,
      descricao_produto:
        invalidItem.item.descricao_produto ?? null,
    }));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(
      {
        success: false,
        error:
          "Método não permitido. Utilize GET ou POST.",
      },
      405,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  const databaseSecretKey =
    Deno.env.get("DB_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const avineAuthorization = Deno.env.get(
    "AVINE_AUTHORIZATION",
  );

  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!supabaseUrl) {
    return jsonResponse(
      {
        success: false,
        error: "Secret SUPABASE_URL não encontrado.",
      },
      500,
    );
  }

  if (!databaseSecretKey) {
    return jsonResponse(
      {
        success: false,
        error:
          "Secret DB_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY não encontrado.",
      },
      500,
    );
  }

  if (!avineAuthorization) {
    return jsonResponse(
      {
        success: false,
        error:
          "Secret AVINE_AUTHORIZATION não encontrado.",
      },
      500,
    );
  }

  if (!cronSecret) {
    return jsonResponse(
      {
        success: false,
        error: "Secret CRON_SECRET não encontrado.",
      },
      500,
    );
  }

  const receivedCronSecret =
    req.headers.get("x-cron-secret");

  if (receivedCronSecret !== cronSecret) {
    return jsonResponse(
      {
        success: false,
        error: "Não autorizado.",
      },
      401,
    );
  }

  const supabase = createClient(
    supabaseUrl,
    databaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  let logId: number | null = null;
  let dataReferencia = "";
  let apiUrl: URL | null = null;

  try {
    const requestBody = await readRequestBody(req);
    const requestUrl = new URL(req.url);

    const requestedDate =
      requestUrl.searchParams.get("due_date") ??
      requestBody.due_date;

    dataReferencia =
      requestedDate ?? getYesterdayInFortaleza();

    if (!isValidIsoDate(dataReferencia)) {
      return jsonResponse(
        {
          success: false,
          error:
            "due_date inválido. Utilize o formato YYYY-MM-DD.",
          received: dataReferencia,
        },
        400,
      );
    }

    apiUrl = new URL(API_BASE_URL);
    apiUrl.searchParams.set(
      "DueDate",
      dataReferencia,
    );

    const {
      data: createdLog,
      error: createLogError,
    } = await supabase
      .from(LOG_TABLE_NAME)
      .insert({
        data_referencia: dataReferencia,
        status: "executando",
        url_consultada: apiUrl.toString(),
        mensagem: "Consulta à API iniciada.",
      })
      .select("id")
      .single();

    if (createLogError) {
      throw new Error(
        `Não foi possível criar o log: ${createLogError.message}`,
      );
    }

    logId = createdLog.id;

    console.log(
      JSON.stringify({
        event: "sync_started",
        data_referencia: dataReferencia,
        api_url: apiUrl.toString(),
        log_id: logId,
      }),
    );

    const apiResponse = await fetch(
      apiUrl.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: avineAuthorization,
        },
      },
    );

    const responseText = await apiResponse.text();

    if (!apiResponse.ok) {
      throw new Error(
        [
          `A API Avine respondeu com HTTP ${apiResponse.status}.`,
          "O conteúdo da resposta foi omitido dos logs por segurança.",
        ].join(" "),
      );
    }

    let apiData: unknown;

    try {
      apiData = JSON.parse(responseText);
    } catch {
      throw new Error(
        "A API Avine não retornou um JSON válido.",
      );
    }

    if (!Array.isArray(apiData)) {
      throw new Error(
        "Formato inesperado: a API deveria retornar um array.",
      );
    }

    if (apiData.length === 0) {
      const { error: noDataLogError } = await supabase
        .from(LOG_TABLE_NAME)
        .update({
          status: "sem_dados",
          finalizado_em: new Date().toISOString(),
          registros_recebidos: 0,
          registros_processados: 0,
          registros_invalidos: 0,
          detalhes_invalidos: [],
          mensagem:
            "A API não retornou registros para a data consultada.",
        })
        .eq("id", logId);

      if (noDataLogError) {
        console.error(
          JSON.stringify({
            event: "log_update_failed",
            log_id: logId,
            error: noDataLogError.message,
          }),
        );
      }

      return jsonResponse({
        success: true,
        status: "sem_dados",
        data_referencia: dataReferencia,
        api_url: apiUrl.toString(),
        registros_recebidos: 0,
        registros_validos: 0,
        registros_invalidos: 0,
        registros_processados: 0,
      });
    }

    const validItems: DevolucaoDatabase[] = [];
    const invalidItems: InvalidItem[] = [];

    for (
      let index = 0;
      index < apiData.length;
      index++
    ) {
      const item = apiData[index] as ApiDevolucao;

      try {
        const normalizedItem = normalizeApiItem(
          item,
          dataReferencia,
        );

        validItems.push(normalizedItem);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error);

        invalidItems.push({
          index,
          error: errorMessage,
          item,
        });

        console.error(
          JSON.stringify({
            event: "invalid_api_record",
            index,
            error: errorMessage,
            chave_acesso: normalizeText(item.chave_acesso, { maxLength: 44 }),
            codigo_produto: normalizeText(item.codigo_produto, { maxLength: 120 }),
          }),
        );
      }
    }

    if (
      validItems.length === 0 &&
      apiData.length > 0
    ) {
      const firstInvalidItem = invalidItems[0];

      throw new Error(
        [
          `A API retornou ${apiData.length} registros,`,
          "mas nenhum passou pela validação.",
          `Primeiro erro: ${
            firstInvalidItem?.error ??
            "não identificado"
          }.`,
          "O conteúdo do primeiro registro inválido foi omitido por segurança.",
        ].join(" "),
      );
    }

    const uniqueItemsMap = new Map<
      string,
      DevolucaoDatabase
    >();

    for (const item of validItems) {
      const uniqueKey =
        `${item.chave_acesso}::${item.codigo_produto}`;

      uniqueItemsMap.set(
        uniqueKey,
        item,
      );
    }

    const uniqueItems = Array.from(
      uniqueItemsMap.values(),
    );

    const duplicateCount =
      validItems.length - uniqueItems.length;

    const batches = splitIntoBatches(
      uniqueItems,
      UPSERT_BATCH_SIZE,
    );

    let processedCount = 0;

    for (
      let batchIndex = 0;
      batchIndex < batches.length;
      batchIndex++
    ) {
      const batch = batches[batchIndex];

      const { error: upsertError } =
        await supabase
          .from(TABLE_NAME)
          .upsert(
            batch,
            {
              onConflict:
                "chave_acesso,codigo_produto",
              ignoreDuplicates: false,
            },
          );

      if (upsertError) {
        throw new Error(
          [
            `Erro no lote ${batchIndex + 1}`,
            `de ${batches.length}:`,
            upsertError.message,
          ].join(" "),
        );
      }

      processedCount += batch.length;

      console.log(
        JSON.stringify({
          event: "batch_processed",
          batch: batchIndex + 1,
          total_batches: batches.length,
          batch_records: batch.length,
          processed_records: processedCount,
        }),
      );
    }

    const lojasMap = new Map<string, LojaDatabase>();

    for (const item of uniqueItems) {
      const codigo = String(item.codigo_cliente);
      const nome = item.nome_abreviado?.trim() ?? "";
      const uf = item.uf?.trim().toUpperCase() ?? "";
      const cidade = item.cidade?.trim() ?? "";

      if (codigo && nome && uf && cidade) {
        lojasMap.set(codigo, { codigo, nome, uf, cidade });
      }
    }

    const lojas = Array.from(lojasMap.values());
    if (lojas.length > 0) {
      const { error: lojasError } = await supabase
        .from("lojas")
        .upsert(lojas, { onConflict: "codigo", ignoreDuplicates: false });

      if (lojasError) {
        throw new Error(
          `Não foi possível sincronizar as lojas: ${lojasError.message}`,
        );
      }
    }

    const invalidDetails =
      summarizeInvalidItems(
        invalidItems,
        INVALID_ITEMS_LOG_LIMIT,
      );

    const finishMessage =
      invalidItems.length > 0
        ? `Sincronização concluída com ${invalidItems.length} registros inválidos ignorados.`
        : "Sincronização concluída sem registros inválidos.";

    const { error: finishLogError } =
      await supabase
        .from(LOG_TABLE_NAME)
        .update({
          status: "sucesso",
          finalizado_em: new Date().toISOString(),
          registros_recebidos: apiData.length,
          registros_processados: processedCount,
          registros_invalidos: invalidItems.length,
          detalhes_invalidos: invalidDetails,
          mensagem: finishMessage,
        })
        .eq("id", logId);

    if (finishLogError) {
      console.error(
        JSON.stringify({
          event: "log_update_failed",
          log_id: logId,
          error: finishLogError.message,
        }),
      );
    }

    return jsonResponse({
      success: true,
      status: "sucesso",
      data_referencia: dataReferencia,
      api_url: apiUrl.toString(),
      registros_recebidos: apiData.length,
      registros_validos: validItems.length,
      registros_invalidos: invalidItems.length,
      registros_duplicados_na_resposta:
        duplicateCount,
      registros_apos_remover_duplicidades:
        uniqueItems.length,
      registros_processados: processedCount,
      lotes_processados: batches.length,
      erros_amostra: summarizeInvalidItems(
        invalidItems,
        INVALID_ITEMS_RESPONSE_LIMIT,
      ),
      log_id: logId,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      JSON.stringify({
        event: "sync_failed",
        data_referencia:
          dataReferencia || null,
        api_url:
          apiUrl?.toString() ?? null,
        log_id: logId,
        error: errorMessage,
      }),
    );

    if (logId !== null) {
      const { error: errorLogUpdateError } =
        await supabase
          .from(LOG_TABLE_NAME)
          .update({
            status: "erro",
            finalizado_em:
              new Date().toISOString(),
            mensagem:
              "A sincronização não foi concluída.",
            erro: errorMessage.slice(0, 5000),
          })
          .eq("id", logId);

      if (errorLogUpdateError) {
        console.error(
          JSON.stringify({
            event:
              "error_log_update_failed",
            log_id: logId,
            error:
              errorLogUpdateError.message,
          }),
        );
      }
    }

    return jsonResponse(
      {
        success: false,
        status: "erro",
        data_referencia:
          dataReferencia || null,
        api_url:
          apiUrl?.toString() ?? null,
        log_id: logId,
        error: errorMessage,
      },
      500,
    );
  }
});
