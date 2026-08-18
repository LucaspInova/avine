import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  conferirFstdAvulsas,
  type DevolucaoDatabase,
  getYesterdayInFortaleza,
  insertOnlyNewItems,
  INVALID_ITEMS_LOG_LIMIT,
  INVALID_ITEMS_RESPONSE_LIMIT,
  isValidIsoDate,
  jsonResponse,
  LOG_TABLE_NAME,
  normalizeText,
  readJsonRequestBody,
  requireCronAuthorization,
  syncLojas,
  toInteger,
  toMoney,
  toRequiredString,
  uniqueItemKey,
} from "../_shared/devolucoes-sync.ts";

const API_BASE_URL = "https://datalake.avine.com.br/api/v1/devolucoes";

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

interface InvalidItem {
  index: number;
  error: string;
  item: ApiDevolucao;
}

function normalizeApiItem(
  item: ApiDevolucao,
  dataReferencia: string,
): DevolucaoDatabase {
  const chaveAcesso = toRequiredString(item.chave_acesso, "chave_acesso");
  if (!/^\d{44}$/.test(chaveAcesso)) {
    throw new Error(
      `Chave de acesso inválida: ${chaveAcesso}. Esperado: 44 dígitos.`,
    );
  }

  const dataEmissao = toRequiredString(item.data_emissao, "data_emissao");
  if (!isValidIsoDate(dataEmissao)) {
    throw new Error(`Data de emissão inválida: ${dataEmissao}`);
  }

  return {
    estabelecimento: toRequiredString(item.estabelecimento, "estabelecimento"),
    nota_fiscal: toInteger(item.nota_fiscal, "nota_fiscal"),
    chave_acesso: chaveAcesso,
    data_emissao: dataEmissao,
    valor: toMoney(item.valor, "valor", 0),
    quantidade_galinha: toInteger(
      item.quantidade_galinha,
      "quantidade_galinha",
      0,
    ),
    valor_galinha: toMoney(item.valor_galinha, "valor_galinha", 0),
    quantidade_codorna: toInteger(
      item.quantidade_codorna,
      "quantidade_codorna",
      0,
    ),
    valor_codorna: toMoney(item.valor_codorna, "valor_codorna", 0),
    codigo_cliente: toInteger(item.codigo_cliente, "codigo_cliente"),
    nome_abreviado: normalizeText(item.nome_abreviado),
    uf: normalizeText(item.uf, { uppercase: true, maxLength: 2 }),
    cidade: normalizeText(item.cidade),
    codigo_produto: toRequiredString(item.codigo_produto, "codigo_produto"),
    descricao_produto: normalizeText(item.descricao_produto),
    data_referencia: dataReferencia,
    atualizado_em: new Date().toISOString(),
  };
}

function summarizeInvalidItems(
  invalidItems: InvalidItem[],
  limit: number,
): Array<Record<string, unknown>> {
  return invalidItems.slice(0, limit).map((invalidItem) => ({
    index: invalidItem.index,
    error: invalidItem.error,
    estabelecimento: invalidItem.item.estabelecimento ?? null,
    nota_fiscal: invalidItem.item.nota_fiscal ?? null,
    chave_acesso: invalidItem.item.chave_acesso ?? null,
    codigo_produto: invalidItem.item.codigo_produto ?? null,
    descricao_produto: invalidItem.item.descricao_produto ?? null,
  }));
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
  const avineAuthorization = Deno.env.get("AVINE_AUTHORIZATION");

  if (!supabaseUrl || !databaseSecretKey || !avineAuthorization) {
    return jsonResponse(
      {
        success: false,
        error: "Secrets da sincronização por API não estão completos.",
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
  let dataReferencia = "";
  let apiUrl: URL | null = null;

  try {
    const body = await readJsonRequestBody(req);
    const requestUrl = new URL(req.url);
    const requestedDate = requestUrl.searchParams.get("due_date") ??
      (body.due_date === undefined ? undefined : String(body.due_date));

    dataReferencia = requestedDate ?? getYesterdayInFortaleza();
    if (!isValidIsoDate(dataReferencia)) {
      return jsonResponse(
        {
          success: false,
          error: "due_date inválido. Utilize o formato YYYY-MM-DD.",
          received: dataReferencia,
        },
        400,
      );
    }

    apiUrl = new URL(API_BASE_URL);
    apiUrl.searchParams.set("DueDate", dataReferencia);

    const { data: createdLog, error: createLogError } = await supabase
      .from(LOG_TABLE_NAME)
      .insert({
        fonte: "api",
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
    console.log(JSON.stringify({
      event: "sync_started",
      source: "api",
      data_referencia: dataReferencia,
      api_url: apiUrl.toString(),
      log_id: logId,
    }));

    const apiResponse = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: avineAuthorization,
      },
    });
    const responseText = await apiResponse.text();

    if (!apiResponse.ok) {
      throw new Error(
        `A API Avine respondeu com HTTP ${apiResponse.status}. O conteúdo foi omitido por segurança.`,
      );
    }

    let apiData: unknown;
    try {
      apiData = JSON.parse(responseText);
    } catch {
      throw new Error("A API Avine não retornou um JSON válido.");
    }

    if (!Array.isArray(apiData)) {
      throw new Error("Formato inesperado: a API deveria retornar um array.");
    }

    if (apiData.length === 0) {
      await supabase.from(LOG_TABLE_NAME).update({
        status: "sem_dados",
        finalizado_em: new Date().toISOString(),
        registros_recebidos: 0,
        registros_processados: 0,
        registros_invalidos: 0,
        detalhes_invalidos: [],
        mensagem: "A API não retornou registros para a data consultada.",
      }).eq("id", logId);

      return jsonResponse({
        success: true,
        source: "api",
        status: "sem_dados",
        data_referencia: dataReferencia,
        api_url: apiUrl.toString(),
        registros_recebidos: 0,
        registros_processados: 0,
      });
    }

    const validItems: DevolucaoDatabase[] = [];
    const invalidItems: InvalidItem[] = [];

    for (let index = 0; index < apiData.length; index++) {
      const item = apiData[index] as ApiDevolucao;
      try {
        validItems.push(normalizeApiItem(item, dataReferencia));
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        invalidItems.push({ index, error: errorMessage, item });
        console.error(JSON.stringify({
          event: "invalid_api_record",
          index,
          error: errorMessage,
          chave_acesso: normalizeText(item.chave_acesso, { maxLength: 44 }),
          codigo_produto: normalizeText(item.codigo_produto, {
            maxLength: 120,
          }),
        }));
      }
    }

    if (validItems.length === 0) {
      throw new Error(
        `A API retornou ${apiData.length} registros, mas nenhum passou pela validação. Primeiro erro: ${
          invalidItems[0]?.error ?? "não identificado"
        }.`,
      );
    }

    const uniqueItemsMap = new Map<string, DevolucaoDatabase>();
    for (const item of validItems) {
      uniqueItemsMap.set(uniqueItemKey(item), item);
    }
    const uniqueItems = Array.from(uniqueItemsMap.values());
    const duplicateCount = validItems.length - uniqueItems.length;

    const { insertedCount, batchCount } = await insertOnlyNewItems(
      supabase,
      uniqueItems,
    );
    await syncLojas(supabase, uniqueItems);
    const conferenciaData = await conferirFstdAvulsas(supabase);

    const invalidDetails = summarizeInvalidItems(
      invalidItems,
      INVALID_ITEMS_LOG_LIMIT,
    );
    const finishMessage =
      `Sincronização API concluída: ${insertedCount} novos itens inseridos, ` +
      `${uniqueItems.length - insertedCount} já existentes e ` +
      `${invalidItems.length} inválidos ignorados.`;

    const { error: finishLogError } = await supabase
      .from(LOG_TABLE_NAME)
      .update({
        status: "sucesso",
        finalizado_em: new Date().toISOString(),
        registros_recebidos: apiData.length,
        registros_processados: insertedCount,
        registros_invalidos: invalidItems.length,
        detalhes_invalidos: invalidDetails,
        mensagem: finishMessage,
      })
      .eq("id", logId);

    if (finishLogError) {
      console.error(JSON.stringify({
        event: "log_update_failed",
        source: "api",
        log_id: logId,
        error: finishLogError.message,
      }));
    }

    return jsonResponse({
      success: true,
      source: "api",
      status: "sucesso",
      data_referencia: dataReferencia,
      api_url: apiUrl.toString(),
      registros_recebidos: apiData.length,
      registros_validos: validItems.length,
      registros_invalidos: invalidItems.length,
      registros_duplicados_na_resposta: duplicateCount,
      registros_apos_remover_duplicidades: uniqueItems.length,
      registros_inseridos: insertedCount,
      registros_ja_existentes: uniqueItems.length - insertedCount,
      lotes_processados: batchCount,
      conferencia_fstd_avulsas: conferenciaData,
      erros_amostra: summarizeInvalidItems(
        invalidItems,
        INVALID_ITEMS_RESPONSE_LIMIT,
      ),
      log_id: logId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      event: "sync_failed",
      source: "api",
      data_referencia: dataReferencia || null,
      api_url: apiUrl?.toString() ?? null,
      log_id: logId,
      error: errorMessage,
    }));

    if (logId !== null) {
      await supabase.from(LOG_TABLE_NAME).update({
        status: "erro",
        finalizado_em: new Date().toISOString(),
        mensagem: "A sincronização por API não foi concluída.",
        erro: errorMessage.slice(0, 5000),
      }).eq("id", logId);
    }

    return jsonResponse(
      {
        success: false,
        source: "api",
        status: "erro",
        data_referencia: dataReferencia || null,
        api_url: apiUrl?.toString() ?? null,
        log_id: logId,
        error: errorMessage,
      },
      500,
    );
  }
});
