import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════
// ⛔ INATIVAR USUÁRIO — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Preserva a linha em `usuarios`, o login no Auth e todo o histórico.
// Protege contra auto-inativação, último admin e chamadas não autorizadas.
// ═══════════════════════════════════════════════════════════════════════
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ success: false, error: "Email é obrigatório" });
  }

  try {
    // ═══ 1. Autenticação ═══
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const { data: { user: authUser }, error: authUserErr } = await supabase.auth.getUser(token);
    if (authUserErr || !authUser) {
      return NextResponse.json({ success: false, error: "Sessão inválida" }, { status: 401 });
    }

    // ═══ 2. Quem tá chamando precisa ser admin ═══
    const { data: chamador } = await supabase
      .from("usuarios")
      .select("role, email")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    if (chamador?.role !== "admin") {
      return NextResponse.json({
        success: false,
        error: "Só administradores podem inativar usuários"
      }, { status: 403 });
    }

    // ═══ 3. Proteção: não pode deletar a si mesmo ═══
    if (chamador.email?.toLowerCase() === email.toLowerCase()) {
      return NextResponse.json({
        success: false,
        error: "Você não pode inativar a si mesmo. Peça pra outro admin fazer isso."
      }, { status: 400 });
    }

    // ═══ 4. Busca o alvo ═══
    const { data: alvo } = await supabase
      .from("usuarios")
      .select("id, auth_user_id, role, nome")
      .ilike("email", email)
      .maybeSingle();

    if (!alvo) {
      return NextResponse.json({ success: false, error: "Usuário não encontrado" }, { status: 404 });
    }

    // ═══ 5. Proteção: não pode esvaziar a lista de admins ═══
    if (alvo.role === "admin") {
      const { count: totalAdmins } = await supabase
        .from("usuarios")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("ativo", true);
      if ((totalAdmins || 0) <= 1) {
        return NextResponse.json({
          success: false,
          error: "Não dá pra inativar o último administrador. Crie outro admin antes."
        }, { status: 400 });
      }
    }

    // ═══ 6. Inativa sem apagar cadastro, Auth ou vínculos históricos ═══
    const { error: updateError } = await supabase
      .from("usuarios")
      .update({ ativo: false })
      .eq("id", alvo.id);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, inativado: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}