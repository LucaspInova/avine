import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set(["Promotor", "Gerencial", "Admin"]);
const allowedAuthRoles = new Set(["admin", "gerencial", "promotor"]);
const PASSWORD_MIN_LENGTH = 8;
const DEFAULT_PROMOTER_PASSWORD = "Promotor12345";
const PASSWORD_POLICY_ERROR =
  `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres, ` +
  "uma letra maiuscula, uma letra minuscula e um numero.";

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
  ufs: string[];
  fotos_habilitadas: boolean;
  ativo: boolean;
  acesso_habilitado: boolean;
  foto_url: string | null;
  last_access_at: string | null;
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

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function validatePassword(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password);
}

function validateAuthRole(input: JsonRecord, profile: string) {
  const requested = text(input.auth_role) ||
    (profile === "Admin" ? "admin" : profile.toLowerCase());
  const expected = profile === "Admin"
    ? "admin"
    : profile === "Gerencial"
    ? "gerencial"
    : profile === "Promotor"
    ? "promotor"
    : "";
  if (!allowedAuthRoles.has(requested) || requested !== expected) {
    throw new Error("Role Auth invalida.");
  }
  return requested;
}

function validateProfile(input: JsonRecord) {
  const nome = text(input.nome);
  const normalizedEmail = email(input.email);
  const perfil = text(input.perfil) || "Gerencial";
  const requestedUfs = Array.isArray(input.ufs) ? input.ufs.map(text).filter(Boolean) : [];
  const estadoInput = text(input.estado);
  const ufs = perfil === "Admin" ? [] : [...new Set((requestedUfs.length ? requestedUfs : estadoInput ? [estadoInput] : []).map((uf) => uf.toUpperCase()))];
  const estado = perfil === "Admin" ? "CE" : ufs[0] ?? "";

  if (nome.length < 4) throw new Error("Informe um nome valido.");
  if (nome !== nome.toUpperCase()) throw new Error("O nome deve conter apenas letras maiusculas.");
  if (!isEmail(normalizedEmail)) throw new Error("Informe um e-mail valido.");
  if (!allowedRoles.has(perfil)) throw new Error("Perfil de acesso invalido.");
  if (ufs.some((uf) => !allowedStates.has(uf))) throw new Error("UF invalida.");
  if (perfil === "Admin" && ufs.length) throw new Error("Admin deve possuir escopo global.");
  if (perfil === "Gerencial" && ufs.length < 1) throw new Error("Gerencial deve possuir ao menos uma UF.");
  if (perfil === "Promotor" && ufs.length !== 1) throw new Error("Promotor deve possuir exatamente uma UF.");

  return {
    nome,
    email: normalizedEmail,
    perfil,
    estado,
    ufs,
    fotos_habilitadas: true,
  };
}

function publicProfile(profile: UserProfile, authRole: string | null = null) {
  return {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    email: profile.email,
    nome: profile.nome,
    perfil: profile.perfil,
    estado: profile.estado,
    ufs: profile.ufs,
    fotos_habilitadas: profile.fotos_habilitadas,
    ativo: profile.ativo,
    acesso_habilitado: profile.acesso_habilitado,
    foto_url: profile.foto_url,
    last_access_at: profile.last_access_at,
    created_at: profile.created_at,
    auth_role: authRole,
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

  const callerAuthRole = text(caller.app_metadata?.role);

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("usuarios")
    .select("id, perfil, estado, ufs")
    .eq("auth_user_id", caller.id)
    .maybeSingle();

  if (
    callerProfileError ||
    !["Admin", "Gerencial"].includes(callerProfile?.perfil ?? "")
  ) {
    return jsonResponse(403, {
      error: "Apenas Admins ou Gerenciais cadastrados podem administrar usuarios.",
    });
  }

  const isAdmin = callerProfile.perfil === "Admin" && callerAuthRole === "admin";
  const isScopedGerencial = callerProfile.perfil === "Gerencial" &&
    callerAuthRole === "gerencial";

  if (!isAdmin && !isScopedGerencial) {
    return jsonResponse(403, { error: "Role Auth inconsistente com o perfil operacional." });
  }

  const callerUfs = Array.isArray(callerProfile.ufs) ? callerProfile.ufs : [callerProfile.estado];
  function canManageTarget(target: { perfil?: string; estado?: string }) {
    if (isAdmin) return true;
    return target.perfil === "Promotor" && callerUfs.includes(target.estado ?? "");
  }

  const action = text(body.action) || "create";

  if (action === "list") {
    let listQuery = adminClient
      .from("usuarios")
      .select(
        "id, auth_user_id, email, nome, perfil, estado, ufs, fotos_habilitadas, ativo, acesso_habilitado, foto_url, last_access_at, created_at",
      )
      .not("auth_user_id", "is", null);

    if (isScopedGerencial) {
      listQuery = listQuery.in("estado", callerUfs);
    }

    const { data, error } = await listQuery.order("nome", { ascending: true });

    if (error) return jsonResponse(400, { error: error.message });
    const { data: authUsersData, error: authUsersError } =
      await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (authUsersError) return jsonResponse(400, { error: authUsersError.message });

    const authRoles = new Map(
      (authUsersData.users ?? []).map((user) => [
        user.id,
        typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null,
      ]),
    );

    return jsonResponse(200, {
      usuarios: (data as UserProfile[]).map((profile) =>
        publicProfile(profile, profile.auth_user_id ? authRoles.get(profile.auth_user_id) ?? null : null)
      ),
    });
  }

  if (action === "delete") {
    const usuarioId = text(body.usuario_id);
    if (!usuarioId) return jsonResponse(400, { error: "Usuario alvo obrigatorio." });

    const { data: target, error: targetError } = await adminClient.from("usuarios")
      .select("id, auth_user_id, email, perfil, estado, ativo, acesso_habilitado")
      .eq("id", usuarioId).maybeSingle();
    if (targetError || !target) return jsonResponse(404, { error: "Usuario nao encontrado." });
    if (!canManageTarget(target)) return jsonResponse(403, {
      error: "O Gerencial somente pode excluir Promotores das suas UFs.",
    });
    if (target.auth_user_id === caller.id) return jsonResponse(400, {
      error: "Voce nao pode excluir o proprio acesso.",
    });
    if (target.perfil === "Admin" && target.auth_user_id) {
      const { count, error: countError } = await adminClient.from("usuarios")
        .select("id", { count: "exact", head: true }).eq("perfil", "Admin")
        .not("auth_user_id", "is", null).neq("id", target.id);
      if (countError) return jsonResponse(400, { error: countError.message });
      if ((count ?? 0) === 0) return jsonResponse(400, {
        error: "Nao e permitido remover o ultimo Admin com acesso.",
      });
    }
    if (target.perfil === "Promotor") {
      const { error: routeError } = await adminClient.from("loja_promotores")
        .update({ promotor_id: null }).eq("promotor_id", target.id);
      if (routeError) return jsonResponse(400, { error: routeError.message });
    }

    // Keep the operational profile as historical data. In particular,
    // fstd_processos intentionally restricts deletion of the Promotor that
    // performed the process. Detaching Auth first prevents deleteUser from
    // cascading into usuarios and violating that historical reference.
    const { error: detachError } = await adminClient.from("usuarios").update({
      auth_user_id: null,
      ativo: false,
      acesso_habilitado: false,
    }).eq("id", target.id);
    if (detachError) return jsonResponse(400, { error: detachError.message });

    if (target.auth_user_id) {
      const { error } = await adminClient.auth.admin.deleteUser(target.auth_user_id);
      if (error) {
        // Auth still exists, so restore the association and leave the account
        // usable instead of producing an inaccessible orphan on a transient
        // Auth Admin failure.
        const { error: restoreError } = await adminClient.from("usuarios").update({
          auth_user_id: target.auth_user_id,
          ativo: target.ativo,
          acesso_habilitado: target.acesso_habilitado,
        }).eq("id", target.id);
        return jsonResponse(400, {
          error: restoreError
            ? `Falha ao excluir a conta e restaurar o perfil: ${error.message}`
            : error.message,
        });
      }
    }
    return jsonResponse(200, { deleted: true });
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

    if (isScopedGerencial &&
      (profileInput.perfil !== "Promotor" || !callerUfs.includes(profileInput.estado))) {
      return jsonResponse(403, {
        error: "O Gerencial somente pode cadastrar Promotores das suas UFs.",
      });
    }

    const password = profileInput.perfil === "Promotor"
      ? DEFAULT_PROMOTER_PASSWORD
      : typeof body.password === "string" ? body.password : "";
    if (!validatePassword(password)) {
      return jsonResponse(400, {
        error: PASSWORD_POLICY_ERROR,
      });
    }

    const { count: duplicateNameCount, error: duplicateNameError } = await adminClient
      .from("usuarios").select("id", { count: "exact", head: true })
      .ilike("nome", profileInput.nome).not("auth_user_id", "is", null);
    if (duplicateNameError) return jsonResponse(400, { error: duplicateNameError.message });
    if ((duplicateNameCount ?? 0) > 0) return jsonResponse(409, {
      error: "Este nome ja esta em uso. Inclua um sobrenome para diferenciar.",
    });

    let authRole: string;
    try {
      authRole = validateAuthRole(body, profileInput.perfil);
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "Role Auth invalida.",
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
          role: authRole,
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
        "id, auth_user_id, email, nome, perfil, estado, ufs, fotos_habilitadas, ativo, acesso_habilitado, foto_url, last_access_at, created_at",
      )
      .single();

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return jsonResponse(400, {
        error: profileError?.message ??
          "Nao foi possivel salvar o perfil operacional.",
      });
    }

    return jsonResponse(200, { usuario: publicProfile(profile as UserProfile, authRole) });
  }

  if (action === "update") {
    const usuarioId = text(body.usuario_id);
    if (!usuarioId) {
      return jsonResponse(400, { error: "Usuario alvo obrigatorio." });
    }

    const { data: target, error: targetError } = await adminClient
      .from("usuarios")
      .select(
        "id, auth_user_id, email, nome, perfil, estado, ufs, fotos_habilitadas, ativo, acesso_habilitado, foto_url, last_access_at, created_at",
      )
      .eq("id", usuarioId)
      .maybeSingle();

    if (targetError || !target) {
      return jsonResponse(404, { error: "Usuario nao encontrado." });
    }

    if (!canManageTarget(target)) {
      return jsonResponse(403, {
        error: "O Gerencial somente pode administrar Promotores das suas UFs.",
      });
    }

    let nextProfile: ReturnType<typeof validateProfile>;
    try {
      nextProfile = validateProfile({ ...target, ...body });
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "Dados invalidos.",
      });
    }

    if (isScopedGerencial &&
      (nextProfile.perfil !== "Promotor" || !callerUfs.includes(nextProfile.estado))) {
      return jsonResponse(403, { error: "O Gerencial somente pode salvar Promotores das suas UFs." });
    }

    if (target.perfil === "Admin" && nextProfile.perfil !== "Admin") {
      const { count, error: countError } = await adminClient
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("perfil", "Admin")
        .not("auth_user_id", "is", null)
        .neq("id", target.id);

      if (countError) return jsonResponse(400, { error: countError.message });
      if ((count ?? 0) === 0) {
        return jsonResponse(400, {
          error: "Nao e permitido alterar o perfil do ultimo Admin cadastrado.",
        });
      }
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password && !target.auth_user_id) {
      return jsonResponse(400, {
        error: "Este usuario ainda nao possui uma conta de acesso para receber uma nova senha.",
      });
    }
    if (password && !validatePassword(password)) {
      return jsonResponse(400, {
        error: PASSWORD_POLICY_ERROR.replace("A senha", "A nova senha"),
      });
    }

    let authRole = text(body.auth_role);
    if (!authRole && target.auth_user_id) {
      const { data: targetAuth } = await adminClient.auth.admin.getUserById(
        target.auth_user_id,
      );
      authRole = text(targetAuth.user?.app_metadata?.role);
    }
    try {
      authRole = validateAuthRole({ auth_role: authRole }, nextProfile.perfil);
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "Role Auth invalida.",
      });
    }

    const authAttributes = {
      email: nextProfile.email,
      ...(password ? { password } : {}),
      user_metadata: { nome: nextProfile.nome },
      app_metadata: {
        role: authRole,
      },
      ban_duration: "none",
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
        ativo: true,
        acesso_habilitado: true,
      })
      .eq("id", target.id)
      .select(
        "id, auth_user_id, email, nome, perfil, estado, ufs, fotos_habilitadas, ativo, acesso_habilitado, foto_url, last_access_at, created_at",
      )
      .single();

    if (updateError || !updated) {
      if (target.auth_user_id) {
        await adminClient.auth.admin.updateUserById(target.auth_user_id, {
          email: target.email,
          user_metadata: { nome: target.nome },
          app_metadata: {
            role: target.perfil === "Admin" ? "admin" : target.perfil.toLowerCase(),
          },
          ban_duration: "none",
        });
      }

      return jsonResponse(400, {
        error: updateError?.message ?? "Nao foi possivel atualizar o usuario.",
      });
    }

    return jsonResponse(200, {
      usuario: publicProfile(updated as UserProfile, authRole),
    });
  }

  return jsonResponse(400, { error: "Acao administrativa invalida." });
});
