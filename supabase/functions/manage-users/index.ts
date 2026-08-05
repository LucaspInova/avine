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
const PASSWORD_POLICY_ERROR =
  `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres, ` +
  "uma letra maiuscula, uma letra minuscula, um numero e um simbolo.";
const legacyGerencialEmails = new Set([
  "admin@avine.com.br",
  "avinegerencial@gmail.com",
]);
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

function validatePassword(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
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

function publicProfile(profile: UserProfile, authRole: string | null = null) {
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
    .select("id, perfil, estado, ativo, acesso_habilitado")
    .eq("auth_user_id", caller.id)
    .maybeSingle();

  if (
    callerProfileError ||
    !["Admin", "Gerencial"].includes(callerProfile?.perfil ?? "") ||
    callerProfile?.ativo !== true ||
    callerProfile?.acesso_habilitado !== true
  ) {
    return jsonResponse(403, {
      error: "Apenas Admins ou Gerenciais com acesso ativo podem administrar usuarios.",
    });
  }

  const isAdmin = callerProfile.perfil === "Admin" && callerAuthRole === "admin";
  const isScopedGerencial = callerProfile.perfil === "Gerencial" &&
    callerAuthRole === "gerencial";

  if (!isAdmin && !isScopedGerencial) {
    return jsonResponse(403, { error: "Role Auth inconsistente com o perfil operacional." });
  }

  function canManageTarget(target: { perfil?: string; estado?: string }) {
    if (isAdmin) return true;
    return target.perfil === "Promotor" &&
      target.estado === callerProfile.estado;
  }

  const action = text(body.action) || "create";

  if (action === "list") {
    let listQuery = adminClient
      .from("usuarios")
      .select(
        "id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, ativo, acesso_habilitado, foto_url, created_at",
      );

    if (isScopedGerencial) {
      listQuery = listQuery.eq("estado", callerProfile.estado);
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
    if (!usuarioId) {
      return jsonResponse(400, { error: "Usuario alvo obrigatorio." });
    }

    const { data: target, error: targetError } = await adminClient
      .from("usuarios")
      .select("id, auth_user_id, email, perfil")
      .eq("id", usuarioId)
      .maybeSingle();

    if (targetError || !target) {
      return jsonResponse(404, { error: "Usuario nao encontrado." });
    }

    if (
      target.perfil !== "Admin" ||
      !legacyGerencialEmails.has(email(target.email))
    ) {
      return jsonResponse(400, {
        error: "Somente os dois usuarios gerenciais legados podem ser excluidos por esta acao.",
      });
    }

    if (target.auth_user_id === caller.id) {
      return jsonResponse(400, { error: "Voce nao pode excluir o proprio acesso." });
    }

    if (target.auth_user_id) {
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(
        target.auth_user_id,
      );

      if (authDeleteError) {
        return jsonResponse(400, { error: authDeleteError.message });
      }
    }

    const { error: profileDeleteError } = await adminClient
      .from("usuarios")
      .delete()
      .eq("id", target.id);

    if (profileDeleteError) {
      return jsonResponse(400, { error: profileDeleteError.message });
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
      (profileInput.perfil !== "Promotor" || profileInput.estado !== callerProfile.estado)) {
      return jsonResponse(403, {
        error: "O Gerencial somente pode cadastrar Promotores da sua UF.",
      });
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (!validatePassword(password)) {
      return jsonResponse(400, {
        error: PASSWORD_POLICY_ERROR,
      });
    }

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

    return jsonResponse(200, { usuario: publicProfile(profile as UserProfile, authRole) });
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

    if (!canManageTarget(target)) {
      return jsonResponse(403, {
        error: "O Gerencial somente pode administrar Promotores da sua UF.",
      });
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
      target.perfil === "Admin" &&
      target.ativo &&
      target.acesso_habilitado &&
      (!nextActive || !nextAccess || nextProfile.perfil !== "Admin")
    ) {
      const { count, error: countError } = await adminClient
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("perfil", "Admin")
        .eq("ativo", true)
        .eq("acesso_habilitado", true)
        .neq("id", target.id);

      if (countError) return jsonResponse(400, { error: countError.message });
      if ((count ?? 0) === 0) {
        return jsonResponse(400, {
          error: "Nao e permitido bloquear o ultimo Admin com acesso.",
        });
      }
    }

    if (nextAccess && !target.auth_user_id) {
      return jsonResponse(400, {
        error: "Crie uma conta Auth antes de habilitar o acesso deste perfil.",
      });
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
            role: target.perfil === "Admin" ? "admin" : target.perfil.toLowerCase(),
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
      usuario: publicProfile(updated as UserProfile, authRole),
    });
  }

  return jsonResponse(400, { error: "Acao administrativa invalida." });
});
