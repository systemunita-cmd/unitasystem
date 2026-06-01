"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Cargos & Salários  (CONECTADO — tabela 'cargos')
// ───────────────────────────────────────────────────────────────────────
// Colunas do banco: sal_min, sal_med, sal_max (mapeadas p/ salMin/Med/Max).
// ocupantes = contagem real em 'funcionarios' por cargo (campo cargo = nome).
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };

const DEPARTAMENTOS = ["Comercial", "Atendimento", "Financeiro", "TI", "Administrativo"];
const NIVEIS = ["Júnior", "Pleno", "Sênior", "Especialista", "Gestão"];
const NIVEL_COR: Record<string, string> = { "Júnior": "#0ea5e9", "Pleno": "#6366f1", "Sênior": "#8b5cf6", "Especialista": "#ec4899", "Gestão": "#f59e0b" };

type Cargo = { id: string; nome: string; departamento: string; nivel: string; salMin: number; salMed: number; salMax: number; ocupantes: number };
const FORM_VAZIO: Cargo = { id: "", nome: "", departamento: DEPARTAMENTOS[0], nivel: NIVEIS[0], salMin: 0, salMed: 0, salMax: 0, ocupantes: 0 };
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function CargosSection() {
  const [lista, setLista] = useState<Cargo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<Cargo>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const editando = !!form.id;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 🔌 Carrega cargos + contagem de ocupantes por cargo
  const carregar = async () => {
    setCarregando(true);
    const [cargosResp, funcsResp] = await Promise.all([
      supabase.from("cargos").select("*").order("created_at", { ascending: false }),
      supabase.from("funcionarios").select("cargo"),
    ]);
    if (cargosResp.error) { console.error(cargosResp.error); alert("Erro ao carregar cargos: " + cargosResp.error.message); setCarregando(false); return; }
    const contagem: Record<string, number> = {};
    (funcsResp.data || []).forEach((f: any) => { if (f.cargo) contagem[f.cargo] = (contagem[f.cargo] || 0) + 1; });
    const mapeada: Cargo[] = (cargosResp.data || []).map((c: any) => ({
      id: c.id, nome: c.nome, departamento: c.departamento || "", nivel: c.nivel || NIVEIS[0],
      salMin: Number(c.sal_min) || 0, salMed: Number(c.sal_med) || 0, salMax: Number(c.sal_max) || 0,
      ocupantes: contagem[c.nome] || 0,
    }));
    setLista(mapeada);
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    let l = lista;
    if (busca) { const b = busca.toLowerCase(); l = l.filter(c => c.nome.toLowerCase().includes(b) || c.departamento.toLowerCase().includes(b)); }
    if (filtroNivel !== "todos") l = l.filter(c => c.nivel === filtroNivel);
    return l;
  }, [lista, busca, filtroNivel]);

  const faixaMediaGeral = useMemo(() => lista.length ? Math.round(lista.reduce((s, c) => s + c.salMed, 0) / lista.length) : 0, [lista]);
  const totalOcupantes = useMemo(() => lista.reduce((s, c) => s + c.ocupantes, 0), [lista]);

  const abrirNovo = () => { setForm(FORM_VAZIO); setModalAberto(true); };
  const abrirEditar = (c: Cargo) => { setForm({ ...c }); setModalAberto(true); };
  const fechar = () => { setModalAberto(false); setForm(FORM_VAZIO); };

  // 🔌 insert / update (salMin/Med/Max -> sal_min/med/max)
  const salvar = async () => {
    if (!form.nome.trim()) { alert("Informe o nome do cargo."); return; }
    setSalvando(true);
    const payload = { nome: form.nome, departamento: form.departamento, nivel: form.nivel, sal_min: form.salMin || 0, sal_med: form.salMed || 0, sal_max: form.salMax || 0 };
    const resp = editando
      ? await supabase.from("cargos").update(payload).eq("id", form.id)
      : await supabase.from("cargos").insert(payload);
    setSalvando(false);
    if (resp.error) { alert("Erro ao salvar: " + resp.error.message); return; }
    fechar();
    carregar();
  };

  // 🔌 delete
  const excluir = async (c: Cargo) => {
    if (!confirm(`Remover o cargo "${c.nome}"?`)) return;
    const { error } = await supabase.from("cargos").delete().eq("id", c.id);
    if (error) { alert("Erro ao excluir: " + error.message); return; }
    carregar();
  };

  const set = (k: keyof Cargo, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>💼</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Cargos & Salários</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: COR_TEXTO }}>{lista.length}</b> cargo(s) · {totalOcupantes} ocupantes</p>
          </div>
        </div>
        <button onClick={abrirNovo} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Novo Cargo</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {[
          { label: "Cargos", value: String(lista.length), cor: "#6366f1", icon: "💼" },
          { label: "Ocupantes", value: String(totalOcupantes), cor: "#16a34a", icon: "👥" },
          { label: "Faixa média", value: real(faixaMediaGeral), cor: "#f59e0b", icon: "💰" },
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

      <div style={{ ...card, padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar por cargo ou departamento..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 460, borderRadius: 20 }} />
        <select value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
          <option value="todos">Nível: Todos</option>
          {NIVEIS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}><p style={{ color: "#6b7280", fontSize: 13 }}>Carregando cargos...</p></div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}><p style={{ fontSize: 36, margin: "0 0 8px" }}>{lista.length === 0 ? "📭" : "🔍"}</p><p style={{ color: "#6b7280", fontSize: 13 }}>{lista.length === 0 ? "Nenhum cargo cadastrado ainda." : "Nenhum cargo encontrado"}</p></div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f9fafb" }}>
                {["Cargo", "Departamento", "Nível", "Mínimo", "Médio", "Máximo", "Ocupantes", ""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtrados.map((c, i) => {
                  const nc = NIVEL_COR[c.nivel] || COR;
                  return (
                    <tr key={c.id} onClick={() => abrirEditar(c)} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}>
                      <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{c.nome}</td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{c.departamento}</td>
                      <td style={{ padding: "12px 16px" }}><span style={{ background: `${nc}15`, color: nc, border: `1px solid ${nc}40`, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{c.nivel}</span></td>
                      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{real(c.salMin)}</td>
                      <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{real(c.salMed)}</td>
                      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{real(c.salMax)}</td>
                      <td style={{ padding: "12px 16px" }}><span style={{ background: "#eef2ff", color: COR_TEXTO, border: "1px solid #c7d2fe", fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{c.ocupantes}</span></td>
                      <td style={{ padding: "12px 16px" }}><button onClick={(e) => { e.stopPropagation(); excluir(c); }} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalAberto && (
        <div onClick={fechar} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 540, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>{editando ? "Editar Cargo" : "Novo Cargo"}</h3>
              <button onClick={fechar} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Nome do cargo"><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Ex: Analista Comercial" /></Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Departamento"><select value={form.departamento} onChange={e => set("departamento", e.target.value)} style={inputStyle}>{DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}</select></Campo>
                <Campo label="Nível"><select value={form.nivel} onChange={e => set("nivel", e.target.value)} style={inputStyle}>{NIVEIS.map(n => <option key={n} value={n}>{n}</option>)}</select></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <Campo label="Salário mín."><input type="number" value={form.salMin || ""} onChange={e => set("salMin", Number(e.target.value))} style={inputStyle} /></Campo>
                <Campo label="Salário médio"><input type="number" value={form.salMed || ""} onChange={e => set("salMed", Number(e.target.value))} style={inputStyle} /></Campo>
                <Campo label="Salário máx."><input type="number" value={form.salMax || ""} onChange={e => set("salMax", Number(e.target.value))} style={inputStyle} /></Campo>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={fechar} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: salvando ? "wait" : "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, opacity: salvando ? 0.7 : 1 }}>{salvando ? "Salvando..." : editando ? "💾 Salvar" : "+ Cadastrar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}