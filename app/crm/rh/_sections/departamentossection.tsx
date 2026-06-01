"use client";
import { useState, useMemo, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Departamentos
// ───────────────────────────────────────────────────────────────────────
// Estrutura organizacional: lista de departamentos com gestor responsável,
// nº de pessoas alocadas e centro de custo. Alimenta o cadastro de
// funcionários (campo departamento) e o rateio do financeiro.
// Dados MOCK em estado local. Pra produção, ligar na tabela 'departamentos'.
//
// 📋 Estrutura sugerida da tabela `departamentos`:
//   id (uuid, pk) · nome (text) · gestor (text) · centro_custo (text)
//   descricao (text) · created_at (timestamptz)
//   (a contagem de pessoas vem de um count em 'funcionarios' por departamento)
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";

const card = {
  background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const inputStyle = {
  width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10,
  padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none",
};

const PALETA = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];

type Departamento = {
  id: string; nome: string; gestor: string; centroCusto: string; descricao: string; qtdFuncionarios: number;
};

const MOCK: Departamento[] = [
  { id: "1", nome: "Comercial", gestor: "Patrícia Gomes", centroCusto: "CC-001", descricao: "Vendas, prospecção e relacionamento com clientes.", qtdFuncionarios: 28 },
  { id: "2", nome: "Atendimento", gestor: "Carlos Mendes", centroCusto: "CC-002", descricao: "Suporte e atendimento ao cliente via WhatsApp e telefone.", qtdFuncionarios: 34 },
  { id: "3", nome: "Financeiro", gestor: "Rafael Lima", centroCusto: "CC-003", descricao: "Contas a pagar/receber, faturamento e cobrança.", qtdFuncionarios: 9 },
  { id: "4", nome: "TI", gestor: "Juliana Prado", centroCusto: "CC-004", descricao: "Desenvolvimento, infraestrutura e suporte técnico.", qtdFuncionarios: 12 },
  { id: "5", nome: "Administrativo", gestor: "Patrícia Gomes", centroCusto: "CC-005", descricao: "RH, compras e rotinas administrativas.", qtdFuncionarios: 7 },
];

const FORM_VAZIO: Departamento = { id: "", nome: "", gestor: "", centroCusto: "", descricao: "", qtdFuncionarios: 0 };

export function DepartamentosSection() {
  const [lista, setLista] = useState<Departamento[]>(MOCK);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<Departamento>(FORM_VAZIO);
  const editando = !!form.id;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const filtrados = useMemo(() => {
    if (!busca) return lista;
    const b = busca.toLowerCase();
    return lista.filter(d => d.nome.toLowerCase().includes(b) || d.gestor.toLowerCase().includes(b) || d.centroCusto.toLowerCase().includes(b));
  }, [lista, busca]);

  const totalPessoas = useMemo(() => lista.reduce((s, d) => s + d.qtdFuncionarios, 0), [lista]);
  const maior = useMemo(() => lista.reduce((a, b) => b.qtdFuncionarios > a.qtdFuncionarios ? b : a, lista[0] || FORM_VAZIO), [lista]);

  const abrirNovo = () => { setForm(FORM_VAZIO); setModalAberto(true); };
  const abrirEditar = (d: Departamento) => { setForm({ ...d }); setModalAberto(true); };
  const fechar = () => { setModalAberto(false); setForm(FORM_VAZIO); };

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o nome do departamento."); return; }
    if (editando) setLista(l => l.map(d => d.id === form.id ? form : d));
    else setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    // 🔌 Supabase: insert/update na tabela 'departamentos'
    fechar();
  };

  const excluir = (d: Departamento) => {
    if (!confirm(`Remover o departamento "${d.nome}"?`)) return;
    setLista(l => l.filter(x => x.id !== d.id));
    // 🔌 Supabase: delete na tabela 'departamentos'
  };

  const set = (campo: keyof Departamento, valor: any) => setForm(f => ({ ...f, [campo]: valor }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🏢</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Departamentos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: COR_TEXTO }}>{lista.length}</b> departamento(s) · {totalPessoas} pessoas</p>
          </div>
        </div>
        <button onClick={abrirNovo}
          style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>
          + Novo Departamento
        </button>
      </div>

      {/* MINI STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {[
          { label: "Departamentos", value: String(lista.length), cor: "#6366f1", icon: "🏢" },
          { label: "Pessoas alocadas", value: String(totalPessoas), cor: "#16a34a", icon: "👥" },
          { label: "Maior área", value: maior.nome || "—", cor: "#f59e0b", icon: "🏆" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${s.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{s.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</p>
            </div>
            <p style={{ color: s.cor, fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* BUSCA */}
      <div style={{ ...card, padding: 14 }}>
        <input placeholder="🔍 Buscar por nome, gestor ou centro de custo..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...inputStyle, borderRadius: 20 }} />
      </div>

      {/* GRID DE DEPARTAMENTOS */}
      {filtrados.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>🔍</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum departamento encontrado</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {filtrados.map((d, i) => {
            const cor = PALETA[i % PALETA.length];
            const pct = totalPessoas ? Math.round((d.qtdFuncionarios / totalPessoas) * 100) : 0;
            return (
              <div key={d.id} style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, borderTop: `3px solid ${cor}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏢</div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{d.centroCusto}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => abrirEditar(d)} style={{ background: "#eef2ff", color: COR_TEXTO, border: "1px solid #c7d2fe", borderRadius: 8, padding: "4px 9px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✏️</button>
                    <button onClick={() => excluir(d)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "4px 9px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button>
                  </div>
                </div>

                {d.descricao && <p style={{ color: "#6b7280", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{d.descricao}</p>}

                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: `linear-gradient(135deg, ${cor} 0%, ${cor}cc 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{(d.gestor || "?").charAt(0)}</div>
                  <span style={{ color: "#374151", fontSize: 12, fontWeight: 600 }}>{d.gestor || "Sem gestor"}</span>
                  <span style={{ color: "#9ca3af", fontSize: 11 }}>· gestor</span>
                </div>

                <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600 }}>{d.qtdFuncionarios} pessoas</span>
                    <span style={{ color: cor, fontSize: 11, fontWeight: 700 }}>{pct}% do total</span>
                  </div>
                  <div style={{ height: 7, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 5 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {modalAberto && (
        <div onClick={fechar} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>{editando ? "Editar Departamento" : "Novo Departamento"}</h3>
              <button onClick={fechar} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Nome do departamento"><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Ex: Comercial" /></Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Gestor responsável"><input value={form.gestor} onChange={e => set("gestor", e.target.value)} style={inputStyle} placeholder="Nome do gestor" /></Campo>
                <Campo label="Centro de custo"><input value={form.centroCusto} onChange={e => set("centroCusto", e.target.value)} style={inputStyle} placeholder="CC-000" /></Campo>
              </div>
              <Campo label="Descrição">
                <textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="O que esse departamento faz..." />
              </Campo>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={fechar} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40` }}>{editando ? "💾 Salvar" : "+ Cadastrar"}</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>
        Dados de exemplo — conecte à tabela <b>departamentos</b> do Supabase pra persistir de verdade.
      </p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}