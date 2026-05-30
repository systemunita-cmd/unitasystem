import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════
// 🗑️ DELETAR USUÁRIO — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Remove do auth.users + tabela `usuarios`. Protege contra:
//   • Auto-exclusão (não pode deletar a si mesmo)
//   • Esvaziar a equipe de admins (não deleta o último admin)
//   • Chamadas não autenticadas / não-admin
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
        error: "Só administradores podem remover usuários"
      }, { status: 403 });
    }

    // ═══ 3. Proteção: não pode deletar a si mesmo ═══
    if (chamador.email?.toLowerCase() === email.toLowerCase()) {
      return NextResponse.json({
        success: false,
        error: "Você não pode remover a si mesmo. Peça pra outro admin fazer isso."
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
          error: "Não dá pra remover o último administrador. Crie outro admin antes."
        }, { status: 400 });
      }
    }

    // ═══ 6. Remove da tabela usuarios ═══
    await supabase.from("usuarios").delete().eq("id", alvo.id);

    // ═══ 7. Remove do Supabase Auth ═══
    if (alvo.auth_user_id) {
      await supabase.auth.admin.deleteUser(alvo.auth_user_id).catch((e: any) => {
        console.error("[deletar-usuario] erro ao apagar do Auth:", e?.message);
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}