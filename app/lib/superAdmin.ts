// ═══════════════════════════════════════════════════════════════════════
// 🛡️ Super Admin — Helper centralizado
// ─────────────────────────────────────────────────────────────────────
// Esse email tem PRIVILÉGIOS ELEVADOS no sistema:
//   - Nunca pode ser excluído (interface e backend rejeitam)
//   - Nunca pode ser editado por outros (role/ativo fixos)
//   - Bypassa qualquer verificação de permissão
//   - Aparece com badge especial 🛡️
//
// Importe e use isSuperAdmin(email) em qualquer check de permissão.
// ═══════════════════════════════════════════════════════════════════════

export const SUPER_ADMIN_EMAIL = "admin@grupounita.net.br";

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase();
}