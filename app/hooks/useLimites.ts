import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 📊 useLimites — UnitaSystem (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// No Wolf esse hook lê limites do plano (tabela `cadastros`).
// No Unita, sem limites — uso interno do Grupo Unita.
// Mantido pra compatibilidade com componentes do Wolf.
// ═══════════════════════════════════════════════════════════════════════

type Limites = {
  usuarios_liberados: number;
  conexoes_liberadas: number;
  permite_webjs: boolean;
  permite_waba: boolean;
  permite_instagram: boolean;
  plano: string;
};

const SEM_LIMITES: Limites = {
  usuarios_liberados: 9999,
  conexoes_liberadas: 9999,
  permite_webjs: true,
  permite_waba: true,
  permite_instagram: true,
  plano: "ultra",
};

export function useLimites(_email?: string, _isAdmin?: boolean) {
  const [limites] = useState<Limites>(SEM_LIMITES);
  const [loading] = useState(false);
  return { limites, loading };
}