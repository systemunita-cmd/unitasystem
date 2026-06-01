"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Folha de Pagamento
// ───────────────────────────────────────────────────────────────────────
// Folha por competência (mês/ano): por funcionário mostra salário base,
// proventos, descontos (INSS/IRRF/outros) e líquido. Totais no topo.
// MOCK em estado local. Em produção, calcular a partir de 'funcionarios'
// + regras de encargos e gravar em 'folha_itens' / 'folha_competencias'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ItemFolha = { id: string; nome: string; cargo: string; base: number; proventos: number; inss: number; irrf: number; outros: number };

const MOCK: ItemFolha[] = [
  { id: "1", nome: "Ana Beatriz Souza", cargo: "Analista Comercial", base: 3800, proventos: 450, inss: 418, irrf: 142, outros: 190 },
  { id: "2", nome: "Carlos Mendes", cargo: "Supervisor de Atendimento", base: 5200, proventos: 0, inss: 572, irrf: 287, outros: 260 },
  { id: "3", nome: "Rafael Lima", cargo: "Assistente Financeiro", base: 2900, proventos: 200, inss: 319, irrf: 0, outros: 145 },
  { id: "4", nome: "Patrícia Gomes", cargo: "Gerente Administrativo", base: 8400, proventos: 0, inss: 828, irrf: 712, outros: 420 },
  { id: "5", nome: "Larissa Nunes", cargo: "Vendedora", base: 2600, proventos: 680, inss: 286, irrf: 0, outros: 130 },
];

const COMPETENCIAS = ["06/2026", "05/2026", "04/2026", "03/2026"];

export function FolhaSection() {
  const [competencia, setCompetencia] = useState(COMPETENCIAS[0]);
  const [status, setStatus] = useState<"calculada" | "paga">("calculada");
  const lista = MOCK;

  const calc = (it: ItemFolha) => {
    const bruto = it.base + it.proventos;
    const descontos = it.inss + it.irrf + it.outros;
    return { bruto, descontos, liquido: bruto - descontos };
  };

  const totais = useMemo(() => lista.reduce((acc, it) => {
    const c = calc(it);
    return { bruto: acc.bruto + c.bruto, descontos: acc.descontos + c.descontos, liquido: acc.liquido + c.liquido };
  }, { bruto: 0, descontos: 0, liquido: 0 }), [lista]);

  const encargos = Math.round(totais.bruto * 0.268); // FGTS+INSS patronal aprox (exemplo)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>💰</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Folha de Pagamento</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Competência <b style={{ color: COR_TEXTO }}>{competencia}</b> · {lista.length} colaboradores</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={competencia} onChange={e => setCompetencia(e.target.value)} style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1f2937", outline: "none", fontWeight: 600 }}>
            {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setStatus(status === "calculada" ? "paga" : "calculada")}
            style={{ background: status === "paga" ? "#16a34a" : `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}30`, whiteSpace: "nowrap" }}>
            {status === "paga" ? "✓ Folha paga" : "💸 Marcar como paga"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Total bruto", value: real(totais.bruto), cor: "#6366f1", icon: "📊" },
          { label: "Descontos", value: real(totais.descontos), cor: "#dc2626", icon: "➖" },
          { label: "Líquido a pagar", value: real(totais.liquido), cor: "#16a34a", icon: "💵" },
          { label: "Encargos (empresa)", value: real(encargos), cor: "#f59e0b", icon: "🏛️" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${s.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{s.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</p>
            </div>
            <p style={{ color: s.cor, fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Detalhamento da folha</h3>
          <span style={{ background: status === "paga" ? "#dcfce7" : "#eef2ff", color: status === "paga" ? "#16a34a" : COR_TEXTO, fontSize: 11, padding: "4px 12px", borderRadius: 10, fontWeight: 700 }}>{status === "paga" ? "Paga" : "Calculada"}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Colaborador", "Base", "Proventos", "INSS", "IRRF", "Outros", "Líquido"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: h === "Colaborador" ? "left" : "right", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lista.map((it, i) => {
                const c = calc(it);
                return (
                  <tr key={it.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{it.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{it.cargo}</p>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#4b5563", fontSize: 12, whiteSpace: "nowrap" }}>{real(it.base)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#16a34a", fontSize: 12, whiteSpace: "nowrap" }}>{it.proventos ? "+" + real(it.proventos) : "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#dc2626", fontSize: 12, whiteSpace: "nowrap" }}>-{real(it.inss)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#dc2626", fontSize: 12, whiteSpace: "nowrap" }}>{it.irrf ? "-" + real(it.irrf) : "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#dc2626", fontSize: 12, whiteSpace: "nowrap" }}>-{real(it.outros)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#1f2937", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{real(c.liquido)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb" }}>
                <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 12, fontWeight: 800 }}>TOTAIS</td>
                <td colSpan={4}></td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "#dc2626", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>-{real(totais.descontos)}</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: COR_TEXTO, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{real(totais.liquido)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — INSS/IRRF/encargos são ilustrativos. Conecte ao Supabase e às regras de cálculo reais.</p>
    </div>
  );
}