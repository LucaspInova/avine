import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set(["Promotor", "Entregador", "Gerencial"]);
const allowedStates = new Set([
  "CE",
  "MA",
  "BA",
  "PA",
  "PB",
  "PI",
  "PE",
  "AP",
  "SE",
  "RN",
  "AL",
]);

type JsonRecord = Record<string, unknown>;

type UserProfile = {
  id: string;
  auth_user_id: string | null;
  email: string;
  nome: string;
  perfil: string;
  estado: string;
  fotos_habilitadas: boolean;
  ativo: boolean;
  acesso_habilitado: boolean;
  foto_url: string | null;
  created_at: string;
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getDefaultKey(envName: string, fallbackName: string) {
  const fallback = Deno.env.get(fallbackName);
  if (fallback) return fallback;

  const value = Deno.env.get(envName);
  if (!value) return "";

  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return "";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function email(value: unknown) {
  return text(value).toLowerCase();
}

function boolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function validateProfile(input: JsonRecord) {
  const nome = text(input.nome);
  const normalizedEmail = email(input.email);
  const perfil = text(input.perfil) || "Gerencial";
  const estado = text(input.estado) || "CE";

  if (nome.length < 4) throw new Error("Informe um nome valido.");
  if (!isEmail(normalizedEmail)) throw new Error("Informe um e-mail valido.");
  if (!allowedRoles.has(perfil)) throw new Error("Perfil de acesso invalido.");
  if (!allowedStates.has(estado)) throw new Error("Estado invalido.");

  return {
    nome,
    email: normalizedEmail,
    perfil,
    estado,
    fotos_habilitadas: boolean(input.fotos_habilitadas),
  };
}

function publicProfile(profile: UserProfile) {
  return {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    email: profile.email,
    nome: profile.nome,
    perfil: profile.perfil,
    estado: profile.estado,
    fotos_habilitadas: profile.fotos_habilitadas,
    ativo: profile.ativo,
    acesso_habilitado: profile.acesso_habilitado,
    foto_url: profile.foto_url,
    created_at: profile.created_at,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Metodo nao permitido." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = getDefaultKey(
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
  );
  const secretKey = getDefaultKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const authorization = request.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse(500, {
      error: "Funcao Supabase sem configuracao de ambiente.",
    });
  }

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(401, { error: "Sessao invalida. Entre novamente." });
  }

  let body: JsonRecord;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Corpo JSON invalido." });
  }

  const token = authorization.slice("Bearer ".length);
  const callerClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser(token);

  if (callerError || !caller) {
    return jsonResponse(401, { error: "Sessao invalida. Entre novamente." });
  }

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("usuarios")
    .select("id, perfil, ativo, acesso_habilitado")
    .eq("auth_user_id", caller.id)
    .maybeSingle();

  if (
    callerProfileError ||
    callerProfile?.perfil !== "Gerencial" ||
    callerProfile?.ativo !== true ||
    callerProfile?.acesso_habilitado !== true
  ) {
    return jsonResponse(403, {
      error: "Apenas Gerenciais com acesso ativo podem administrar usuarios.",
    });
  }

  const action = text(body.action) || "create";

  if (action === "list") {
    const { data, error } = await adminClient
      .from("usuarios")
      .select(
        "id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, ativo, acesso_habilitado, foto_url, created_at",
      )
      .order("nome", { ascending: true });

    if (error) return jsonResponse(400, { error: error.message });
    return jsonResponse(200, {
      usuarios: (data as UserProfile[]).map(publicProfile),
    });
  }

  if (action === "create") {
    let profileInput: ReturnType<typeof validateProfile>;
    try {
      profileInput = validateProfile(body);
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "Dados invalidos.",
      });
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 12) {
      return jsonResponse(400, {
        error: "A senha deve ter pelo menos 12 caracteres.",
      });
    }

    const { data: existingProfile, error: existingError } = await adminClient
      .from("usuarios")
      .select("id, auth_user_id")
      .eq("email", profileInput.email)
      .maybeSingle();

    if (existingError) {
      return jsonResponse(400, { error: existingError.message });
    }
    if (existingProfile?.auth_user_id) {
      return jsonResponse(409, {
        error: "Este e-mail ja possui uma conta de acesso.",
      });
    }

    const { data: authData, error: createError } =
      await adminClient.auth.admin.createUser({
        email: profileInput.email,
        password,
        email_confirm: true,
        app_metadata: {
          role: profileInput.perfil.toLowerCase(),
          access_enabled: true,
        },
        user_metadata: { nome: profileInput.nome },
      });

    if (createError || !authData.user) {
      return jsonResponse(400, {
        error: createError?.message?.includes("already")
          ? "Este e-mail ja possui uma conta de acesso."
          : createError?.message ?? "Nao foi possivel criar a conta no Auth.",
      });
    }

    const profileMutation = {
      ...profileInput,
      auth_user_id: authData.user.id,
      ativo: true,
      acesso_habilitado: true,
    };

    const profileRequest = existingProfile
      ? adminClient
        .from("usuarios")
        .update(profileMutation)
        .eq("id", existingProfile.id)
      : adminClient.from("usuarios").insert(profileMutation);

    const { data: profile, error: profileError } = await profileRequest
      .select(
        "id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, ativo, acesso_habilitado, foto_url, created_at",
      )
      .single();

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return jsonResponse(400, {
        error: profileError?.message ??
          "Nao foi possivel salvar o perfil operacional.",
      });
    }

    return jsonResponse(200, { usuario: publicProfile(profile as UserProfile) });
  }

  if (action === "update" || action === "set_access") {
    const usuarioId = text(body.usuario_id);
    if (!usuarioId) {
      return jsonResponse(400, { error: "Usuario alvo obrigatorio." });
    }

    const { data: target, error: targetError } = await adminClient
      .from("usuarios")
      .select(
        "id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, ativo, acesso_habilitado, foto_url, created_at",
      )
      .eq("id", usuarioId)
      .maybeSingle();

    if (targetError || !target) {
      return jsonResponse(404, { error: "Usuario nao encontrado." });
    }

    let nextProfile: ReturnType<typeof validateProfile>;
    try {
      nextProfile = action === "update"
        ? validateProfile({ ...target, ...body })
        : validateProfile(target);
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "Dados invalidos.",
      });
    }

    const nextActive = action === "update"
      ? boolean(body.ativo, target.ativo)
      : boolean(body.ativo, target.ativo);
    const nextAccess = action === "set_access"
      ? boolean(body.acesso_habilitado, target.acesso_habilitado)
      : boolean(body.acesso_habilitado, target.acesso_habilitado);

    if (target.auth_user_id === caller.id && (!nextActive || !nextAccess)) {
      return jsonResponse(400, {
        error: "Voce nao pode bloquear o proprio acesso.",
      });
    }

    if (
      target.perfil === "Gerencial" &&
      target.ativo &&
      target.acesso_habilitado &&
      (!nextActive || !nextAccess || nextProfile.perfil !== "Gerencial")
    ) {
      const { count, error: countError } = await adminClient
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("perfil", "Gerencial")
        .eq("ativo", true)
        .eq("acesso_habilitado", true)
        .neq("id", target.id);

      if (countError) return jsonResponse(400, { error: countError.message });
      if ((count ?? 0) === 0) {
        return jsonResponse(400, {
          error: "Nao e permitido bloquear o ultimo Gerencial com acesso.",
        });
      }
    }

    if (nextAccess && !target.auth_user_id) {
      return jsonResponse(400, {
        error: "Crie uma conta Auth antes de habilitar o acesso deste perfil.",
      });
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password && password.length < 12) {
      return jsonResponse(400, {
        error: "A nova senha deve ter pelo menos 12 caracteres.",
      });
    }

    const authAttributes = {
      email: nextProfile.email,
      ...(password ? { password } : {}),
      user_metadata: { nome: nextProfile.nome },
      app_metadata: {
        role: nextProfile.perfil.toLowerCase(),
        access_enabled: nextAccess && nextActive,
      },
      ban_duration: nextAccess && nextActive ? "none" : "876000h",
    };

    if (target.auth_user_id) {
      const { error: authUpdateError } =
        await adminClient.auth.admin.updateUserById(
          target.auth_user_id,
          authAttributes,
        );

      if (authUpdateError) {
        return jsonResponse(400, { error: authUpdateError.message });
      }
    }

    const { data: updated, error: updateError } = await adminClient
      .from("usuarios")
      .update({
        ...nextProfile,
        ativo: nextActive,
        acesso_habilitado: nextAccess && nextActive,
      })
      .eq("id", target.id)
      .select(
        "id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, ativo, acesso_habilitado, foto_url, created_at",
      )
      .single();

    if (updateError || !updated) {
      if (target.auth_user_id) {
        await adminClient.auth.admin.updateUserById(target.auth_user_id, {
          email: target.email,
          user_metadata: { nome: target.nome },
          app_metadata: {
            role: target.perfil.toLowerCase(),
            access_enabled: target.acesso_habilitado && target.ativo,
          },
          ban_duration: target.acesso_habilitado && target.ativo
            ? "none"
            : "876000h",
        });
      }

      return jsonResponse(400, {
        error: updateError?.message ?? "Nao foi possivel atualizar o usuario.",
      });
    }

    return jsonResponse(200, {
      usuario: publicProfile(updated as UserProfile),
    });
  }

  return jsonResponse(400, { error: "Acao administrativa invalida." });
});
