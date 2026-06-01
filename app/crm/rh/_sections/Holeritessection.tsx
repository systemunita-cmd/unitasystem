"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Holerites
// ───────────────────────────────────────────────────────────────────────
// Lista de holerites (contracheques) gerados por competência. Cada um abre
// um demonstrativo com proventos e descontos. MOCK em estado local.
// Em produção, gerar a partir da folha calculada e guardar em 'holerites'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Linha = { rotulo: string; valor: number; ref?: string };
type Holerite = {
  id: string; nome: string; cargo: string; competencia: string;
  emitido: boolean; pago: boolean;
  proventos: Linha[]; descontos: Linha[];
};

const MOCK: Holerite[] = [
  { id: "1", nome: "Ana Beatriz Souza", cargo: "Analista Comercial", competencia: "06/2026", emitido: true, pago: false,
    proventos: [{ rotulo: "Salário base", valor: 3800 }, { rotulo: "Horas extras", valor: 320, ref: "8h" }, { rotulo: "Comissão", valor: 130 }],
    descontos: [{ rotulo: "INSS", valor: 418, ref: "11%" }, { rotulo: "IRRF", valor: 142 }, { rotulo: "Vale transporte", valor: 190, ref: "6%" }] },
  { id: "2", nome: "Carlos Mendes", cargo: "Supervisor de Atendimento", competencia: "06/2026", emitido: true, pago: true,
    proventos: [{ rotulo: "Salário base", valor: 5200 }],
    descontos: [{ rotulo: "INSS", valor: 572, ref: "11%" }, { rotulo: "IRRF", valor: 287 }, { rotulo: "Plano de saúde", valor: 260 }] },
  { id: "3", nome: "Larissa Nunes", cargo: "Vendedora", competencia: "06/2026", emitido: true, pago: false,
    proventos: [{ rotulo: "Salário base", valor: 2600 }, { rotulo: "Comissão", valor: 680 }],
    descontos: [{ rotulo: "INSS", valor: 286, ref: "9%" }, { rotulo: "Vale transporte", valor: 130 }] },
  { id: "4", nome: "Rafael Lima", cargo: "Assistente Financeiro", competencia: "06/2026", emitido: false, pago: false,
    proventos: [{ rotulo: "Salário base", valor: 2900 }, { rotulo: "Adicional", valor: 200 }],
    descontos: [{ rotulo: "INSS", valor: 319, ref: "9%" }, { rotulo: "Vale refeição", valor: 145 }] },
];

const COMPETENCIAS = ["06/2026", "05/2026", "04/2026"];

export function HoleritesSection() {
  const [competencia, setCompetencia] = useState(COMPETENCIAS[0]);
  const [busca, setBusca] = useState("");
  const [verHolerite, setVerHolerite] = useState<Holerite | null>(null);

  const lista = useMemo(() => {
    let l = MOCK.filter(h => h.competencia === competencia);
    if (busca) { const b = busca.toLowerCase(); l = l.filter(h => h.nome.toLowerCase().includes(b) || h.cargo.toLowerCase().includes(b)); }
    return l;
  }, [competencia, busca]);

  const totalProv = (h: Holerite) => h.proventos.reduce((s, p) => s + p.valor, 0);
  const totalDesc = (h: Holerite) => h.descontos.reduce((s, d) => s + d.valor, 0);
  const liquido = (h: Holerite) => totalProv(h) - totalDesc(h);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🧾</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Holerites</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Contracheques da competência <b style={{ color: COR_TEXTO }}>{competencia}</b></p>
          </div>
        </div>
        <select value={competencia} onChange={e => setCompetencia(e.target.value)} style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1f2937", outline: "none", fontWeight: 600 }}>
          {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <input placeholder="🔍 Buscar por colaborador ou cargo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inputStyle, borderRadius: 20 }} />
      </div>

      {lista.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}><p style={{ fontSize: 36, margin: "0 0 8px" }}>🧾</p><p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum holerite nesta competência</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {lista.map(h => (
            <div key={h.id} style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{h.nome.charAt(0)}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.nome}</p>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{h.cargo}</p>
                </div>
                <span style={{ background: h.pago ? "#dcfce7" : h.emitido ? "#eef2ff" : "#f3f4f6", color: h.pago ? "#16a34a" : h.emitido ? COR_TEXTO : "#6b7280", fontSize: 10, padding: "3px 8px", borderRadius: 8, fontWeight: 700 }}>{h.pago ? "Pago" : h.emitido ? "Emitido" : "Pendente"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                <div><p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>Líquido</p><p style={{ color: COR_TEXTO, fontSize: 18, fontWeight: 800, margin: "2px 0 0" }}>{real(liquido(h))}</p></div>
                <button onClick={() => setVerHolerite(h)} style={{ alignSelf: "flex-end", background: "#eef2ff", color: COR_TEXTO, border: "1px solid #c7d2fe", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Ver holerite</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DEMONSTRATIVO */}
      {verHolerite && (
        <div onClick={() => setVerHolerite(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ color: "white", fontSize: 15, fontWeight: 800, margin: 0 }}>Demonstrativo de Pagamento</p>
                <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "2px 0 0" }}>{verHolerite.nome} · {verHolerite.competencia}</p>
              </div>
              <button onClick={() => setVerHolerite(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", fontSize: 16, cursor: "pointer", width: 30, height: 30, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, overflowY: "auto" }}>
              <p style={{ color: "#16a34a", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px" }}>Proventos</p>
              {verHolerite.proventos.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ color: "#374151", fontSize: 13 }}>{p.rotulo} {p.ref && <span style={{ color: "#9ca3af", fontSize: 11 }}>({p.ref})</span>}</span>
                  <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 700 }}>{real(p.valor)}</span>
                </div>
              ))}
              <p style={{ color: "#dc2626", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "18px 0 8px" }}>Descontos</p>
              {verHolerite.descontos.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ color: "#374151", fontSize: 13 }}>{d.rotulo} {d.ref && <span style={{ color: "#9ca3af", fontSize: 11 }}>({d.ref})</span>}</span>
                  <span style={{ color: "#dc2626", fontSize: 13, fontWeight: 700 }}>-{real(d.valor)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, padding: "14px 16px", background: "#eef2ff", borderRadius: 12 }}>
                <div><p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 600 }}>Proventos {real(totalProv(verHolerite))} · Descontos {real(totalDesc(verHolerite))}</p><p style={{ color: COR_TEXTO, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "4px 0 0" }}>Líquido a receber</p></div>
                <p style={{ color: COR_TEXTO, fontSize: 22, fontWeight: 800, margin: 0 }}>{real(liquido(verHolerite))}</p>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => alert("Geração de PDF entra quando conectarmos a folha real.")} style={{ background: "#ffffff", color: COR_TEXTO, border: "1px solid #c7d2fe", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>📄 Baixar PDF</button>
              <button onClick={() => setVerHolerite(null)} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>holerites</b> do Supabase.</p>
    </div>
  );
}