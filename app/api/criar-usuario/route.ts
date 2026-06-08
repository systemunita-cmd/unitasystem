import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════
// 👥 CRIAR USUÁRIO — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Cria um novo usuário no Auth + tabela `usuarios`.
//
// Hierarquia de permissão:
//   • admin       → cria admin, supervisor, atendente
//   • supervisor  → cria atendente (não pode criar admin nem supervisor)
//   • atendente   → não pode criar ninguém
//
// IMPORTANTE: o SQL setup do Unita tem um trigger `criar_usuario_automatico`
// que cria uma row na tabela `usuarios` automaticamente quando alguém é
// criado no auth.users. Esse endpoint detecta isso e faz UPDATE em vez
// de INSERT pra evitar erro de duplicate key.
// ═══════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Role = "admin" | "supervisor" | "atendente";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, senha, nome, role, equipe_id, grupo_id } = body as {
    email?: string; senha?: string; nome?: string;
    role?: Role; equipe_id?: number | null; grupo_id?: number | null;
  };

  // ═══ Validações básicas ═══
  if (!email || !senha || !nome) {
    return NextResponse.json({ success: false, error: "Campos obrigatórios: email, senha, nome" });
  }
  if (senha.length < 6) {
    return NextResponse.json({ success: false, error: "A senha deve ter no mínimo 6 caracteres" });
  }
  const roleFinal: Role = (role === "admin" || role === "supervisor" || role === "atendente") ? role : "atendente";

  try {
    // ═══ 1. Autenticação: quem está chamando essa API? ═══
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const { data: { user: authUser }, error: authUserErr } = await supabase.auth.getUser(token);
    if (authUserErr || !authUser) {
      return NextResponse.json({ success: false, error: "Sessão inválida" }, { status: 401 });
    }

    // ═══ 2. Verifica permissão do chamador ═══
    // Reconhece como admin total: o super admin (email) OU quem está no
    // grupo "Administração Geral" — além do role legado admin/supervisor.
    const SUPER_ADMIN_EMAIL = "admin@grupounita.net.br";
    const ehSuperAdmin = (authUser.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;

    const { data: chamador } = await supabase
      .from("usuarios")
      .select("role, grupo_id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    // Nome do grupo do chamador (normalizado: ignora acento/caixa/espaço)
    let grupoNorm = "";
    if (chamador?.grupo_id) {
      const { data: grupoChamador } = await supabase
        .from("grupos_permissao")
        .select("nome")
        .eq("id", chamador.grupo_id)
        .maybeSingle();
      grupoNorm = (grupoChamador?.nome || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
    }
    const ehAdminGeral = grupoNorm === "administracao geral" || grupoNorm === "administrador geral";

    // Fallback: se a tabela usuarios estiver vazia, libera (primeira instalação)
    let podeCre: boolean;
    let roleChamador: Role | null = (chamador?.role as Role) || null;
    if (!chamador) {
      const { count } = await supabase.from("usuarios").select("*", { count: "exact", head: true });
      podeCre = (count || 0) === 0; // primeiro user libera
      if (podeCre) roleChamador = "admin";
    } else {
      podeCre = ehSuperAdmin || ehAdminGeral || roleChamador === "admin" || roleChamador === "supervisor";
    }

    // Super admin e Administração Geral = admin total (podem criar qualquer cargo)
    if (ehSuperAdmin || ehAdminGeral) roleChamador = "admin";

    if (!podeCre) {
      return NextResponse.json({
        success: false,
        error: "Você não tem permissão para criar usuários (precisa ser admin ou supervisor)"
      }, { status: 403 });
    }

    // Hardening: supervisor só pode criar atendente
    if (roleChamador === "supervisor" && roleFinal !== "atendente") {
      return NextResponse.json({
        success: false,
        error: "Supervisores só podem criar usuários do tipo Atendente. Peça pra um admin criar outros admins/supervisores."
      }, { status: 403 });
    }

    // ═══ 3. Verifica se o email já está em uso ═══
    const { data: existente } = await supabase
      .from("usuarios")
      .select("email")
      .ilike("email", email)
      .maybeSingle();
    if (existente) {
      return NextResponse.json({ success: false, error: "email_exists" });
    }

    // ═══ 4. Cria no Supabase Auth ═══
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, role: roleFinal },
    });

    if (authError) {
      if (authError.message.includes("already been registered") || authError.message.includes("already exists")) {
        return NextResponse.json({ success: false, error: "email_exists" });
      }
      return NextResponse.json({ success: false, error: authError.message });
    }

    const novoUserId = authData.user?.id;
    if (!novoUserId) {
      return NextResponse.json({ success: false, error: "Falha ao criar usuário no Auth" });
    }

    // ═══ 5. UPSERT na tabela usuarios ═══
    // O trigger `criar_usuario_automatico` provavelmente já criou uma row.
    // Fazemos upsert pra atualizar com os valores corretos sem dar erro.
    const { error: dbError } = await supabase.from("usuarios").upsert([{
      auth_user_id: novoUserId,
      nome,
      email,
      role: roleFinal,
      equipe_id: equipe_id || null,
      grupo_id: grupo_id || null,
      ativo: true,
    }], { onConflict: "auth_user_id" });

    if (dbError) {
      // Rollback: remove do Auth se deu pau no banco
      await supabase.auth.admin.deleteUser(novoUserId).catch(() => {});
      return NextResponse.json({ success: false, error: dbError.message });
    }

    return NextResponse.json({ success: true, userId: novoUserId });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}