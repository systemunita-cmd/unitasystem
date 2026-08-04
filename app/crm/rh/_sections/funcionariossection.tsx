"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Funcionários  (CONECTADO AO SUPABASE — tabela 'funcionarios')
// ───────────────────────────────────────────────────────────────────────
// select ao abrir · insert/update/delete nos botões. Os campos batem 1:1
// com as colunas da tabela. 'admissao' vazio vira null (coluna date).
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const inputStyle = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#1f2937",
  fontSize: 13,
  boxSizing: "border-box" as const,
  outline: "none",
};

type Status = "ativo" | "ferias" | "afastado" | "desligado";
type Funcionario = {
  id: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  cargo: string;
  departamento: string;
  equipe_id: string;
  admissao: string;
  data_nascimento: string;
  salario: number;
  status: Status;
  user_email: string; // login do sistema vinculado (tabela usuarios.email) — usado no ponto
  carga_horaria_mensal: number;
  jornada_inicio: string;
  intervalo_inicio: string;
  intervalo_fim: string;
  jornada_fim: string;
};
type BeneficiosForm = {
  vt_ativo: boolean; vt_periodicidade: "diario" | "mensal"; vt_valor: number; vt_dias: number; vt_linha: string;
  va_ativo: boolean; va_periodicidade: "diario" | "mensal"; va_valor: number; va_dias: number; va_modalidade: string;
};
const BENEFICIOS_VAZIO: BeneficiosForm = { vt_ativo: false, vt_periodicidade: "diario", vt_valor: 0, vt_dias: 22, vt_linha: "", va_ativo: false, va_periodicidade: "diario", va_valor: 0, va_dias: 22, va_modalidade: "Alimentação" };

const STATUS_INFO: Record<Status, { label: string; cor: string }> = {
  ativo: { label: "Ativo", cor: "#16a34a" },
  ferias: { label: "Em férias", cor: "#0ea5e9" },
  afastado: { label: "Afastado", cor: "#f59e0b" },
  desligado: { label: "Desligado", cor: "#6b7280" },
};

const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};

const FORM_VAZIO: Funcionario = {
  id: "",
  nome: "",
  cpf: "",
  email: "",
  telefone: "",
  cargo: "",
  departamento: "",
  equipe_id: "",
  admissao: "",
  data_nascimento: "",
  salario: 0,
  status: "ativo",
  user_email: "",
  carga_horaria_mensal: 220,
  jornada_inicio: "08:00",
  intervalo_inicio: "12:00",
  intervalo_fim: "13:00",
  jornada_fim: "17:00",
};

export function FuncionariosSection() {
  const [lista, setLista] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroDepto, setFiltroDepto] = useState("todos");
  const [filtroEquipe, setFiltroEquipe] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<Funcionario>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [beneficiosForm, setBeneficiosForm] = useState<BeneficiosForm>(BENEFICIOS_VAZIO);
  const editando = !!form.id;

  // logins do sistema (tabela usuarios) — pro select de vínculo do funcionário
  const [usuariosSistema, setUsuariosSistema] = useState<{ email: string; nome: string }[]>([]);
  const [departamentos, setDepartamentos] = useState<{ id: string; nome: string }[]>([]);
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 🔌 Carrega da tabela
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("funcionarios")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      alert("Erro ao carregar funcionários: " + error.message);
    } else setLista((data || []) as Funcionario[]);
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);

  // 🔌 carrega os logins do sistema (tabela usuarios) pro select de vínculo
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("usuarios")
        .select("nome, email")
        .order("nome", { ascending: true });
      if (data) setUsuariosSistema(data as { email: string; nome: string }[]);
    })();
  }, []);

  // 🔌 departamentos e equipes (pros selects do cadastro de funcionário)
  useEffect(() => {
    (async () => {
      const [dep, eq] = await Promise.all([
        supabase.from("departamentos").select("id, nome").order("nome", { ascending: true }),
        supabase.from("equipes").select("id, nome").eq("ativo", true).order("nome", { ascending: true }),
      ]);
      if (dep.data) setDepartamentos(dep.data as { id: string; nome: string }[]);
      if (eq.data) setEquipes(eq.data as { id: string; nome: string }[]);
    })();
  }, []);

  const equipeNome = (id?: string) => equipes.find((e) => String(e.id) === String(id))?.nome || "";

  const filtrados = useMemo(() => {
    let l = lista;
    if (busca) {
      const b = busca.toLowerCase();
      l = l.filter(
        (f) =>
          (f.nome || "").toLowerCase().includes(b) ||
          (f.cpf || "").includes(busca) ||
          (f.cargo || "").toLowerCase().includes(b) ||
          (f.email || "").toLowerCase().includes(b)
      );
    }
    if (filtroDepto !== "todos") l = l.filter((f) => f.departamento === filtroDepto);
    if (filtroEquipe !== "todos") l = l.filter((f) => String(f.equipe_id) === filtroEquipe);
    if (filtroStatus !== "todos") l = l.filter((f) => f.status === filtroStatus);
    return l;
  }, [lista, busca, filtroDepto, filtroEquipe, filtroStatus]);

  const stats = useMemo(
    () => ({
      total: lista.length,
      ativos: lista.filter((f) => f.status === "ativo").length,
      ferias: lista.filter((f) => f.status === "ferias").length,
      folha: lista.filter((f) => f.status !== "desligado").reduce((s, f) => s + (f.salario || 0), 0),
    }),
    [lista]
  );

  const abrirNovo = () => {
    setForm(FORM_VAZIO);
    setBeneficiosForm(BENEFICIOS_VAZIO);
    setModalAberto(true);
  };
  const abrirEditar = async (f: Funcionario) => {
    setForm({ ...FORM_VAZIO, ...f, admissao: f.admissao || "", data_nascimento: f.data_nascimento || "" });
    const [{ data: vt }, { data: va }] = await Promise.all([
      supabase.from("vale_transporte").select("*").or(`funcionario_id.eq.${f.id},nome.ilike.${f.nome}`).limit(1).maybeSingle(),
      supabase.from("vale_refeicao").select("*").or(`funcionario_id.eq.${f.id},nome.ilike.${f.nome}`).limit(1).maybeSingle(),
    ]);
    setBeneficiosForm({
      vt_ativo: !!vt, vt_periodicidade: vt?.periodicidade === "mensal" ? "mensal" : "diario",
      vt_valor: Number(vt?.periodicidade === "mensal" ? vt?.valor_mensal : vt?.valor_diario) || 0,
      vt_dias: Number(vt?.dias_uteis) || 22, vt_linha: vt?.linha || "",
      va_ativo: !!va, va_periodicidade: va?.periodicidade === "mensal" ? "mensal" : "diario",
      va_valor: Number(va?.periodicidade === "mensal" ? va?.valor_mensal : va?.valor_diario) || 0,
      va_dias: Number(va?.dias) || 22, va_modalidade: va?.modalidade || "Alimentação",
    });
    setModalAberto(true);
  };
  const fechar = () => {
    setModalAberto(false);
    setForm(FORM_VAZIO);
    setBeneficiosForm(BENEFICIOS_VAZIO);
  };

  // 🔌 insert / update
  const salvar = async () => {
    const obrigatorios: [string, unknown][] = [["nome",form.nome],["CPF",form.cpf],["telefone",form.telefone],["e-mail",form.email],["cargo",form.cargo],["departamento",form.departamento],["equipe/empresa",form.equipe_id],["data de admissão",form.admissao],["data de nascimento",form.data_nascimento],["salário",form.salario],["login do sistema",form.user_email],["carga horária mensal",form.carga_horaria_mensal]];
    const faltando = obrigatorios.find(([,valor]) => !String(valor ?? "").trim() || (typeof valor === "number" && valor <= 0));
    if (faltando) { alert(`Preencha o campo obrigatório: ${faltando[0]}.`); return; }
    if ((beneficiosForm.vt_ativo && beneficiosForm.vt_valor <= 0) || (beneficiosForm.va_ativo && beneficiosForm.va_valor <= 0)) {
      alert("Informe um valor válido para cada benefício ativado."); return;
    }
    setSalvando(true);
    const payload = {
      nome: form.nome,
      cpf: form.cpf,
      email: form.email,
      telefone: form.telefone,
      cargo: form.cargo,
      departamento: form.departamento,
      equipe_id: form.equipe_id || null,
      admissao: form.admissao || null,
      data_nascimento: form.data_nascimento || null,
      salario: form.salario || 0,
      status: form.status,
      user_email: form.user_email || null,
      carga_horaria_mensal: form.carga_horaria_mensal,
      jornada_inicio: form.jornada_inicio,
      intervalo_inicio: form.intervalo_inicio,
      intervalo_fim: form.intervalo_fim,
      jornada_fim: form.jornada_fim,
    };
    const resp = editando
      ? await supabase.from("funcionarios").update(payload).eq("id", form.id).select("id").single()
      : await supabase.from("funcionarios").insert(payload).select("id").single();
    if (resp.error) {
      setSalvando(false);
      alert("Erro ao salvar: " + resp.error.message);
      return;
    }
    const funcionarioId = editando ? form.id : resp.data?.id;
    const { error: beneficioErro } = await supabase.rpc("salvar_beneficios_funcionario", {
      p_funcionario_id: funcionarioId, p_vt_ativo: beneficiosForm.vt_ativo,
      p_vt_periodicidade: beneficiosForm.vt_periodicidade, p_vt_valor: beneficiosForm.vt_valor,
      p_vt_dias: beneficiosForm.vt_dias, p_vt_linha: beneficiosForm.vt_linha,
      p_va_ativo: beneficiosForm.va_ativo, p_va_periodicidade: beneficiosForm.va_periodicidade,
      p_va_valor: beneficiosForm.va_valor, p_va_dias: beneficiosForm.va_dias,
      p_va_modalidade: beneficiosForm.va_modalidade,
    });
    setSalvando(false);
    if (beneficioErro) { alert("Funcionário salvo, mas houve erro nos benefícios: " + beneficioErro.message); return; }
    fechar();
    carregar();
  };

  // 🔌 delete
  const excluir = async (f: Funcionario) => {
    if (!confirm(`Remover ${f.nome} do quadro?`)) return;
    const { error } = await supabase.from("funcionarios").delete().eq("id", f.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    carregar();
  };

  const set = (campo: keyof Funcionario, valor: any) => setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: `0 8px 20px ${COR}30`,
            }}
          >
            <span style={{ filter: "saturate(0) brightness(2)" }}>👥</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Funcionários
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              <b style={{ color: COR_TEXTO }}>{lista.length}</b> pessoa(s) no quadro
            </p>
          </div>
        </div>
        <button
          onClick={abrirNovo}
          style={{
            background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "11px 20px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: `0 4px 12px ${COR}40`,
            whiteSpace: "nowrap",
          }}
        >
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
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${s.cor}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                {s.icon}
              </div>
              <p
                style={{
                  color: "#6b7280",
                  fontSize: 11,
                  margin: 0,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {s.label}
              </p>
            </div>
            <p style={{ color: s.cor, fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ ...card, padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="🔍 Buscar por nome, CPF, cargo ou e-mail..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 460, borderRadius: 20 }}
        />
        <select
          value={filtroDepto}
          onChange={(e) => setFiltroDepto(e.target.value)}
          style={{ ...inputStyle, maxWidth: 200 }}
        >
          <option value="todos">Departamento: Todos</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.nome}>
              {d.nome}
            </option>
          ))}
        </select>
        {equipes.length > 0 && (
          <select
            value={filtroEquipe}
            onChange={(e) => setFiltroEquipe(e.target.value)}
            style={{ ...inputStyle, maxWidth: 200 }}
          >
            <option value="todos">Equipe: Todas</option>
            {equipes.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.nome}
              </option>
            ))}
          </select>
        )}
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          style={{ ...inputStyle, maxWidth: 180 }}
        >
          <option value="todos">Status: Todos</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* LISTA */}
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando funcionários...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>{lista.length === 0 ? "📭" : "🔍"}</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {lista.length === 0
              ? "Nenhum funcionário cadastrado ainda. Clique em “+ Novo Funcionário”."
              : "Nenhum funcionário com esses filtros"}
          </p>
        </div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtrados.map((f) => {
            const st = STATUS_INFO[f.status] || STATUS_INFO.ativo;
            return (
              <div
                key={f.id}
                onClick={() => abrirEditar(f)}
                style={{
                  ...card,
                  padding: 14,
                  cursor: "pointer",
                  borderLeft: `4px solid ${st.cor}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar nome={f.nome} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        color: "#1f2937",
                        fontSize: 14,
                        fontWeight: 700,
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.nome}
                    </p>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>{f.cargo}</p>
                  </div>
                  <span
                    style={{
                      background: `${st.cor}15`,
                      color: st.cor,
                      border: `1px solid ${st.cor}40`,
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 8,
                      fontWeight: 700,
                    }}
                  >
                    {st.label}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}
                >
                  <span>{f.departamento}{f.equipe_id && equipeNome(f.equipe_id) ? " · " + equipeNome(f.equipe_id) : ""}</span>
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
                  {["Funcionário", "Cargo", "Departamento", "Admissão", "Salário", "Status", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        color: "#6b7280",
                        fontSize: 11,
                        textAlign: "left",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((f, i) => {
                  const st = STATUS_INFO[f.status] || STATUS_INFO.ativo;
                  return (
                    <tr
                      key={f.id}
                      onClick={() => abrirEditar(f)}
                      style={{
                        borderTop: "1px solid #f3f4f6",
                        background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc")
                      }
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar nome={f.nome} />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                              {f.nome}
                            </p>
                            <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{f.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{f.cargo}</td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>
                        {f.departamento || "—"}
                        {f.equipe_id && equipeNome(f.equipe_id) ? (
                          <span style={{ display: "block", color: "#2563eb", fontSize: 11, fontWeight: 600 }}>👥 {equipeNome(f.equipe_id)}</span>
                        ) : null}
                      </td>
                      <td
                        style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}
                      >
                        {dataBR(f.admissao)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "#1f2937",
                          fontSize: 12,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {real(f.salario)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            background: `${st.cor}15`,
                            color: st.cor,
                            border: `1px solid ${st.cor}40`,
                            fontSize: 11,
                            padding: "3px 10px",
                            borderRadius: 10,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            excluir(f);
                          }}
                          style={{
                            background: "#fef2f2",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            borderRadius: 8,
                            padding: "5px 11px",
                            fontSize: 11,
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          🗑️
                        </button>
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
        <div
          onClick={fechar}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...card,
              width: "100%",
              maxWidth: 600,
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
                {editando ? "Editar Funcionário" : "Novo Funcionário"}
              </h3>
              <button
                onClick={fechar}
                style={{
                  background: "#f3f4f6",
                  border: "none",
                  color: "#6b7280",
                  fontSize: 16,
                  cursor: "pointer",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: 24,
                overflowY: "auto",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <Campo label="Nome completo" full obrigatorio>
                <input
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  style={inputStyle}
                  placeholder="Nome do funcionário"
                />
              </Campo>
              <Campo label="CPF" obrigatorio>
                <input
                  value={form.cpf}
                  onChange={(e) => set("cpf", e.target.value)}
                  style={inputStyle}
                  placeholder="000.000.000-00"
                />
              </Campo>
              <Campo label="Telefone" obrigatorio>
                <input
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                  style={inputStyle}
                  placeholder="(00) 00000-0000"
                />
              </Campo>
              <Campo label="E-mail" full obrigatorio>
                <input
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  style={inputStyle}
                  placeholder="email@grupounita.net.br"
                />
              </Campo>
              <Campo label="Cargo" obrigatorio>
                <input
                  value={form.cargo}
                  onChange={(e) => set("cargo", e.target.value)}
                  style={inputStyle}
                  placeholder="Ex: Analista"
                />
              </Campo>
              <Campo label="Departamento" obrigatorio>
                <select
                  value={form.departamento}
                  onChange={(e) => set("departamento", e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Selecione —</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.nome}>
                      {d.nome}
                    </option>
                  ))}
                </select>
                {departamentos.length === 0 && (
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "6px 0 0" }}>
                    Nenhum departamento cadastrado. Crie na aba <b>Departamentos</b>.
                  </p>
                )}
              </Campo>
              <Campo label="Equipe / Empresa" obrigatorio>
                <select
                  value={form.equipe_id}
                  onChange={(e) => set("equipe_id", e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Sem equipe —</option>
                  {equipes.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nome}
                    </option>
                  ))}
                </select>
                {equipes.length === 0 && (
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "6px 0 0" }}>
                    Nenhuma equipe ativa. Crie em <b>Configurações → Equipes</b>.
                  </p>
                )}
              </Campo>
              <Campo label="Data de admissão" obrigatorio>
                <input
                  type="date"
                  value={form.admissao}
                  onChange={(e) => set("admissao", e.target.value)}
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Data de nascimento" obrigatorio>
                <input
                  type="date"
                  value={form.data_nascimento}
                  onChange={(e) => set("data_nascimento", e.target.value)}
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Salário (R$)" obrigatorio>
                <input
                  type="number"
                  value={form.salario || ""}
                  onChange={(e) => set("salario", Number(e.target.value))}
                  style={inputStyle}
                  placeholder="0,00"
                />
              </Campo>
              <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 800, color: "#1f2937" }}>Jornada e banco de horas</p>
                <p style={{ margin: "0 0 12px", fontSize: 11, color: "#6b7280" }}>Usados no cálculo automático da folha. O dia atual é calculado somente até o horário transcorrido.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                  <Campo label="Carga mensal" obrigatorio><input type="number" value={form.carga_horaria_mensal || ""} onChange={(e)=>set("carga_horaria_mensal",Number(e.target.value))} style={inputStyle}/></Campo>
                  <Campo label="Entrada"><input type="time" value={form.jornada_inicio} onChange={(e)=>set("jornada_inicio",e.target.value)} style={inputStyle}/></Campo>
                  <Campo label="Intervalo"><input type="time" value={form.intervalo_inicio} onChange={(e)=>set("intervalo_inicio",e.target.value)} style={inputStyle}/></Campo>
                  <Campo label="Retorno"><input type="time" value={form.intervalo_fim} onChange={(e)=>set("intervalo_fim",e.target.value)} style={inputStyle}/></Campo>
                  <Campo label="Saída"><input type="time" value={form.jornada_fim} onChange={(e)=>set("jornada_fim",e.target.value)} style={inputStyle}/></Campo>
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, color: "#1f2937" }}>Benefícios lançados automaticamente</p>
                {[{tipo:"VT",ativo:"vt_ativo",periodicidade:"vt_periodicidade",valor:"vt_valor",dias:"vt_dias"},{tipo:"VA / VR",ativo:"va_ativo",periodicidade:"va_periodicidade",valor:"va_valor",dias:"va_dias"}].map((b:any)=>(
                  <div key={b.tipo} style={{ display:"grid", gridTemplateColumns:"110px 1fr 1fr 1fr", gap:10, alignItems:"end", background:"#f8fafc", padding:12, borderRadius:10, marginBottom:10 }}>
                    <label style={{display:"flex",gap:7,alignItems:"center",fontSize:12,fontWeight:800}}><input type="checkbox" checked={(beneficiosForm as any)[b.ativo]} onChange={(e)=>setBeneficiosForm(v=>({...v,[b.ativo]:e.target.checked}))}/>{b.tipo}</label>
                    <Campo label="Periodicidade"><select disabled={!(beneficiosForm as any)[b.ativo]} value={(beneficiosForm as any)[b.periodicidade]} onChange={(e)=>setBeneficiosForm(v=>({...v,[b.periodicidade]:e.target.value}))} style={inputStyle}><option value="diario">Valor diário</option><option value="mensal">Valor mensal</option></select></Campo>
                    <Campo label="Valor (R$)"><input disabled={!(beneficiosForm as any)[b.ativo]} type="number" min="0" step="0.01" value={(beneficiosForm as any)[b.valor] || ""} onChange={(e)=>setBeneficiosForm(v=>({...v,[b.valor]:Number(e.target.value)}))} style={inputStyle}/></Campo>
                    <Campo label="Dias úteis"><input disabled={!(beneficiosForm as any)[b.ativo] || (beneficiosForm as any)[b.periodicidade]==="mensal"} type="number" min="1" value={(beneficiosForm as any)[b.dias]} onChange={(e)=>setBeneficiosForm(v=>({...v,[b.dias]:Number(e.target.value)}))} style={inputStyle}/></Campo>
                  </div>
                ))}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Campo label="Linha / trajeto do VT"><input disabled={!beneficiosForm.vt_ativo} value={beneficiosForm.vt_linha} onChange={(e)=>setBeneficiosForm(v=>({...v,vt_linha:e.target.value}))} style={inputStyle}/></Campo>
                  <Campo label="Tipo do benefício alimentar"><select disabled={!beneficiosForm.va_ativo} value={beneficiosForm.va_modalidade} onChange={(e)=>setBeneficiosForm(v=>({...v,va_modalidade:e.target.value}))} style={inputStyle}><option>Alimentação</option><option>Refeição</option></select></Campo>
                </div>
              </div>
              <Campo label="Status" full>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as Status)}
                  style={inputStyle}
                >
                  {Object.entries(STATUS_INFO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Usuário do sistema (login para bater ponto)" full obrigatorio>
                <select
                  value={form.user_email}
                  onChange={(e) => set("user_email", e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Sem login vinculado —</option>
                  {usuariosSistema.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.nome ? `${u.nome} (${u.email})` : u.email}
                    </option>
                  ))}
                </select>
                <p style={{ color: "#9ca3af", fontSize: 11, margin: "6px 0 0", lineHeight: 1.4 }}>
                  Vincule o login criado em Configurações. É por ele que o funcionário bate o próprio ponto.
                </p>
              </Campo>
            </div>
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                background: "#f9fafb",
              }}
            >
              <button
                onClick={fechar}
                style={{
                  background: "#ffffff",
                  color: "#374151",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "9px 18px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 22px",
                  fontSize: 13,
                  cursor: salvando ? "wait" : "pointer",
                  fontWeight: 700,
                  boxShadow: `0 4px 12px ${COR}40`,
                  opacity: salvando ? 0.7 : 1,
                }}
              >
                {salvando ? "Salvando..." : editando ? "💾 Salvar" : "+ Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ nome }: { nome: string }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: 14,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {(nome || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function Campo({ label, full, obrigatorio, children }: { label: string; full?: boolean; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <label
        style={{
          color: "#6b7280",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}{obrigatorio && <span style={{ color: "#dc2626" }}> *</span>}
      </label>
      {children}
    </div>
  );
}