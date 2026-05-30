import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🏢 useWorkspace — UnitaSystem (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// No Unita não temos workspaces (uso interno). Esse hook é mantido APENAS
// pra compatibilidade com componentes do Wolf que esperam essa interface.
//
// Retorna sempre wsId="unita" e o user logado. Não consulta tabela
// `workspaces` (que não existe no Unita).
// ═══════════════════════════════════════════════════════════════════════

type User = {
  id: string;
  email: string;
};

// "Pseudo-workspace" fixo do Unita — só pra manter shape compatível
type Workspace = {
  id: number;
  nome: string;
  owner_id: string;
  owner_email: string;
  plano: string;
  ativo: boolean;
  username: string;
};

const PSEUDO_WORKSPACE: Workspace = {
  id: 1,
  nome: "Grupo Unita",
  owner_id: "unita",
  owner_email: "admin@grupounita.com.br",
  plano: "ultra",
  ativo: true,
  username: "unita",
};

export function useWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser({ id: authUser.id, email: authUser.email || "" });
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // wsId é SEMPRE "unita" (single-tenant)
  const wsId = "unita";
  const wsPronto = !loading && !!user;

  return {
    workspace: PSEUDO_WORKSPACE,
    user,
    loading,
    signOut,
    wsId,
    wsPronto,
  };
}