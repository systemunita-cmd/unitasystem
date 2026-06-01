"use client";
import { useState, useMemo, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Funcionários
// ───────────────────────────────────────────────────────────────────────
// Cadastro de pessoas: lista/tabela com busca e filtros + modal de
// cadastro/edição. Base de todo o RH (folha, ponto, férias apontam aqui).
// Dados MOCK em estado local — salvar/excluir mexe só no array por enquanto.
// Pra produção, trocar pelas queries do Supabase (tabela 'funcionarios').
//
// 📋 Estrutura sugerida da tabela `funcionarios`:
//   id (uuid, pk) · nome (text) · cpf (text) · email (text) · telefone (text)
//   cargo (text) · departamento (text) · admissao (date) · salario (numeric)
//   status (text: ativo|ferias|afastado|desligado) · created_at (timestamptz)
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

const DEPARTAMENTOS = ["Comercial", "Atendimento", "Financeiro", "TI", "Administrativo"];

type Status = "ativo" | "ferias" | "afastado" | "desligado";
type Funcionario = {
  id: string; nome: string; cpf: string; email: string; telefone: string;
  cargo: string; departamento: string; admissao: string; salario: number; status: Status;
};

const MOCK: Funcionario[] = [
  { id: "1", nome: "Ana Beatriz Souza", cpf: "123.456.789-01", email: "ana.souza@grupounita.net.br", telefone: "(62) 99111-2233", cargo: "Analista Comercial", departamento: "Comercial", admissao: "2023-03-12", salario: 3800, status: "ativo" },
  { id: "2", nome: "Carlos Mendes", cpf: "234.567.890-12", email: "carlos.mendes@grupounita.net.br", telefone: "(62) 99222-3344", cargo: "Supervisor de Atendimento", departamento: "Atendimento", admissao: "2021-07-01", salario: 5200, status: "ativo" },
  { id: "3", nome: "Juliana Prado", cpf: "345.678.901-23", email: "juliana.prado@grupounita.net.br", telefone: "(62) 99333-4455", cargo: "Desenvolvedora", departamento: "TI", admissao: "2022-11-20", salario: 7100, status: "ferias" },
  { id: "4", nome: "Rafael Lima", cpf: "456.789.012-34", email: "rafael.lima@grupounita.net.br", telefone: "(62) 99444-5566", cargo: "Assistente Financeiro", departamento: "Financeiro", admissao: "2024-01-15", salario: 2900, status: "ativo" },
  { id: "5", nome: "Patrícia Gomes", cpf: "567.890.123-45", email: "patricia.gomes@grupounita.net.br", telefone: "(62) 99555-6677", cargo: "Gerente Administrativo", departamento: "Administrativo", admissao: "2020-02-10", salario: 8400, status: "ativo" },
  { id: "6", nome: "Bruno Tavares", cpf: "678.901.234-56", email: "bruno.tavares@grupounita.net.br", telefone: "(62) 99666-7788", cargo: "Atendente", departamento: "Atendimento", admissao: "2023-09-05", salario: 2400, status: "afastado" },
  { id: "7", nome: "Larissa Nunes", cpf: "789.012.345-67", email: "larissa.nunes@grupounita.net.br", telefone: "(62) 99777-8899", cargo: "Vendedora", departamento: "Comercial", admissao: "2024-05-02", salario: 2600, status: "ativo" },
];

const STATUS_INFO: Record<Status, { label: string; cor: string }> = {
  ativo: { label: "Ativo", cor: "#16a34a" },
  ferias: { label: "Em férias", cor: "#0ea5e9" },
  afastado: { label: "Afastado", cor: "#f59e0b" },
  desligado: { label: "Desligado", cor: "#6b7280" },
};

const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return iso; } };

const FORM_VAZIO: Funcionario = { id: "", nome: "", cpf: "", email: "", telefone: "", cargo: "", departamento: DEPARTAMENTOS[0], admissao: "", salario: 0, status: "ativo" };

export function FuncionariosSection() {
  const [lista, setLista] = useState<Funcionario[]>(MOCK);
  const [busca, setBusca] = useState("");
  const [filtroDepto, setFiltroDepto] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<Funcionario>(FORM_VAZIO);
  const editando = !!form.id;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const filtrados = useMemo(() => {
    let l = lista;
    if (busca) {
      const b = busca.toLowerCase();
      l = l.filter(f => f.nome.toLowerCase().includes(b) || f.cpf.includes(busca) || f.cargo.toLowerCase().includes(b) || f.email.toLowerCase().includes(b));
    }
    if (filtroDepto !== "todos") l = l.filter(f => f.departamento === filtroDepto);
    if (filtroStatus !== "todos") l = l.filter(f => f.status === filtroStatus);
    return l;
  }, [lista, busca, filtroDepto, filtroStatus]);

  const stats = useMemo(() => ({
    total: lista.length,
    ativos: lista.filter(f => f.status === "ativo").length,
    ferias: lista.filter(f => f.status === "ferias").length,
    folha: lista.filter(f => f.status !== "desligado").reduce((s, f) => s + f.salario, 0),
  }), [lista]);

  const abrirNovo = () => { setForm(FORM_VAZIO); setModalAberto(true); };
  const abrirEditar = (f: Funcionario) => { setForm({ ...f }); setModalAberto(true); };
  const fechar = () => { setModalAberto(false); setForm(FORM_VAZIO); };

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o nome do funcionário."); return; }
    if (editando) {
      setLista(l => l.map(f => f.id === form.id ? form : f));
    } else {
      setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    }
    // 🔌 Supabase: substituir por insert/update na tabela 'funcionarios'
    fechar();
  };

  const excluir = (f: Funcionario) => {
    if (!confirm(`Remover ${f.nome} do quadro?`)) return;
    setLista(l => l.filter(x => x.id !== f.id));
    // 🔌 Supabase: substituir por delete na tabela 'funcionarios'
  };

  const set = (campo: keyof Funcionario, valor: any) => setForm(f => ({ ...f, [campo]: valor }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>👥</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Funcionários</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: COR_TEXTO }}>{lista.length}</b> pessoa(s) no quadro</p>
          </div>
        </div>
        <button onClick={abrirNovo}
          style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>
          + Novo Funcionário
        </button>
      </div>

      {/* MINI STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {[
          { label: "Total", value: String(stats.total), cor: "#6366f1", icon: "👥" },
          { label: "Ativos", value: String(stats.ativos), cor: "#16a34a", icon: "✅" },
          { label: "Em férias", value: String(stats.ferias), cor: "#0ea5e9", icon: "🌴" },
          { label: "Custo da folha", value: real(stats.folha), cor: "#f59e0b", icon: "💰" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${s.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{s.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</p>
            </div>
            <p style={{ color: s.cor, fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ ...card, padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar por nome, CPF, cargo ou e-mail..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 460, borderRadius: 20 }} />
        <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
          <option value="todos">Departamento: Todos</option>
          {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inputStyle, maxWidth: 180 }}>
          <option value="todos">Status: Todos</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* LISTA */}
      {filtrados.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>🔍</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum funcionário com esses filtros</p>
        </div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtrados.map(f => {
            const st = STATUS_INFO[f.status];
            return (
              <div key={f.id} onClick={() => abrirEditar(f)} style={{ ...card, padding: 14, cursor: "pointer", borderLeft: `4px solid ${st.cor}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar nome={f.nome} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome}</p>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>{f.cargo}</p>
                  </div>
                  <span style={{ background: `${st.cor}15`, color: st.cor, border: `1px solid ${st.cor}40`, fontSize: 10, padding: "3px 8px", borderRadius: 8, fontWeight: 700 }}>{st.label}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
                  <span>{f.departamento}</span>
                  <span>{real(f.salario)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Funcionário", "Cargo", "Departamento", "Admissão", "Salário", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((f, i) => {
                  const st = STATUS_INFO[f.status];
                  return (
                    <tr key={f.id} onClick={() => abrirEditar(f)}
                      style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar nome={f.nome} />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{f.nome}</p>
                            <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{f.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{f.cargo}</td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{f.departamento}</td>
                      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{dataBR(f.admissao)}</td>
                      <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{real(f.salario)}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: `${st.cor}15`, color: st.cor, border: `1px solid ${st.cor}40`, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button onClick={(e) => { e.stopPropagation(); excluir(f); }}
                          style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL CADASTRO/EDIÇÃO */}
      {modalAberto && (
        <div onClick={fechar} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 600, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>{editando ? "Editar Funcionário" : "Novo Funcionário"}</h3>
              <button onClick={fechar} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Campo label="Nome completo" full><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Nome do funcionário" /></Campo>
              <Campo label="CPF"><input value={form.cpf} onChange={e => set("cpf", e.target.value)} style={inputStyle} placeholder="000.000.000-00" /></Campo>
              <Campo label="Telefone"><input value={form.telefone} onChange={e => set("telefone", e.target.value)} style={inputStyle} placeholder="(00) 00000-0000" /></Campo>
              <Campo label="E-mail" full><input value={form.email} onChange={e => set("email", e.target.value)} style={inputStyle} placeholder="email@grupounita.net.br" /></Campo>
              <Campo label="Cargo"><input value={form.cargo} onChange={e => set("cargo", e.target.value)} style={inputStyle} placeholder="Ex: Analista" /></Campo>
              <Campo label="Departamento">
                <select value={form.departamento} onChange={e => set("departamento", e.target.value)} style={inputStyle}>
                  {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Campo>
              <Campo label="Data de admissão"><input type="date" value={form.admissao} onChange={e => set("admissao", e.target.value)} style={inputStyle} /></Campo>
              <Campo label="Salário (R$)"><input type="number" value={form.salario || ""} onChange={e => set("salario", Number(e.target.value))} style={inputStyle} placeholder="0,00" /></Campo>
              <Campo label="Status" full>
                <select value={form.status} onChange={e => set("status", e.target.value as Status)} style={inputStyle}>
                  {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
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
        Dados de exemplo — conecte à tabela <b>funcionarios</b> do Supabase pra persistir de verdade.
      </p>
    </div>
  );
}

function Avatar({ nome }: { nome: string }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
      {(nome || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}