"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { usePermissao } from "../../../hooks/usePermissao";

// 🧑‍💼 RH · Benefícios (CONECTADO — tabela 'beneficios'; custoEmpresa↔custo_empresa)
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
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TIPOS: Record<string, { cor: string; icon: string }> = {
  Transporte: { cor: "#0ea5e9", icon: "🚌" },
  Alimentação: { cor: "#f59e0b", icon: "🍽️" },
  Saúde: { cor: "#16a34a", icon: "🏥" },
  "Bem-estar": { cor: "#ec4899", icon: "🧘" },
  Seguro: { cor: "#8b5cf6", icon: "🛡️" },
};
type Beneficio = { id: string; nome: string; tipo: string; custoEmpresa: number; aderentes: number };
const FORM_VAZIO: Beneficio = { id: "", nome: "", tipo: "Transporte", custoEmpresa: 0, aderentes: 0 };
type RegrasCalculo = { limite_dia_util_horas:number; limite_sabado_horas:number; descontar_vt_dia_util:boolean; descontar_va_dia_util:boolean; descontar_vt_sabado:boolean; descontar_va_sabado:boolean };
const REGRAS_PADRAO: RegrasCalculo = { limite_dia_util_horas:24, limite_sabado_horas:12, descontar_vt_dia_util:true, descontar_va_dia_util:true, descontar_vt_sabado:true, descontar_va_sabado:false };

export function BeneficiosSection() {
  const [lista, setLista] = useState<Beneficio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Beneficio>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [impactos, setImpactos] = useState<any[]>([]);
  const [regras, setRegras] = useState<RegrasCalculo>(REGRAS_PADRAO);
  const [modalRegras, setModalRegras] = useState(false);
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  const { isSuperAdmin } = usePermissao();
  const editando = !!form.id;
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth < 768);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("beneficios")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      alert("Erro ao carregar: " + error.message);
    } else
      setLista(
        (data || []).map((b: any) => ({
          id: b.id,
          nome: b.nome,
          tipo: b.tipo || "Transporte",
          custoEmpresa: Number(b.custo_empresa) || 0,
          aderentes: b.aderentes || 0,
        }))
      );
    setCarregando(false);
  };
  const carregarImpactos = async () => {
    const agora=new Date(), competencia=`${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,"0")}`;
    const [{data:funcs},{data:vt},{data:va},{data:banco},{data:dias},{data:config}]=await Promise.all([
      supabase.from("funcionarios").select("id,nome,salario,carga_horaria_mensal").neq("status","desligado"),
      supabase.from("vale_transporte").select("funcionario_id,nome,periodicidade,valor_diario,valor_mensal,dias_uteis"),
      supabase.from("vale_refeicao").select("funcionario_id,nome,periodicidade,valor_diario,valor_mensal,dias"),
      supabase.rpc("calcular_banco_horas",{p_competencia:competencia,p_funcionario_id:null,p_ate:agora.toISOString()}),
      supabase.rpc("calcular_dias_desconto_beneficio",{p_competencia:competencia,p_funcionario_id:null,p_ate:agora.toISOString()}),
      supabase.from("rh_regras_calculo").select("*").eq("id",1).maybeSingle(),
    ]);
    const cfg={...REGRAS_PADRAO,...(config||{})}; setRegras(cfg);
    setImpactos((funcs||[]).map((f:any)=>{
      const bh=(banco||[]).find((x:any)=>x.funcionario_id===f.id)||{}, dg=(dias||[]).find((x:any)=>x.funcionario_id===f.id)||{};
      const vtFunc=(vt||[]).filter((x:any)=>x.funcionario_id===f.id||(!x.funcionario_id&&x.nome===f.nome));
      const vaFunc=(va||[]).filter((x:any)=>x.funcionario_id===f.id||(!x.funcionario_id&&x.nome===f.nome));
      const du=Number(dg.dias_desconto_dia_util||0), ds=Number(dg.dias_desconto_sabado||0);
      const nominalVt=vtFunc.reduce((n:number,x:any)=>n+Number(x.periodicidade==="mensal"?x.valor_mensal:Number(x.valor_diario)*Number(x.dias_uteis||22)),0);
      const nominalVa=vaFunc.reduce((n:number,x:any)=>n+Number(x.periodicidade==="mensal"?x.valor_mensal:Number(x.valor_diario)*Number(x.dias||22)),0);
      const descontoVt=vtFunc.reduce((n:number,x:any)=>{const dia=Number(x.periodicidade==="mensal"?Number(x.valor_mensal)/Math.max(Number(x.dias_uteis||22),1):x.valor_diario);return n+dia*((cfg.descontar_vt_dia_util?du:0)+(cfg.descontar_vt_sabado?ds:0));},0);
      const descontoVa=vaFunc.reduce((n:number,x:any)=>{const dia=Number(x.periodicidade==="mensal"?Number(x.valor_mensal)/Math.max(Number(x.dias||22),1):x.valor_diario);return n+dia*((cfg.descontar_va_dia_util?du:0)+(cfg.descontar_va_sabado?ds:0));},0);
      const debito=Math.max(0,-Number(bh.saldo_min||0));
      return {nome:f.nome,previsto:Number(bh.horas_previstas_min||0),trabalhado:Number(bh.horas_trabalhadas_min||0),saldo:Number(bh.saldo_min||0),descontoSalario:debito*(Number(f.salario)||0)/(Math.max(Number(f.carga_horaria_mensal)||220,1)*60),beneficioNominal:nominalVt+nominalVa,descontoVt,descontoVa,faltasUtil:Number(dg.faltas_integrais_dia_util||0),faltasSabado:Number(dg.faltas_integrais_sabado||0),diasUtil:du,diasSabado:ds};
    }));
  };
  useEffect(() => { carregar(); carregarImpactos(); }, []);

  const salvarRegras = async () => {
    setSalvandoRegras(true);
    const { error } = await supabase.rpc("salvar_regras_calculo_rh",{
      p_limite_dia_util_horas:regras.limite_dia_util_horas,p_limite_sabado_horas:regras.limite_sabado_horas,
      p_descontar_vt_dia_util:regras.descontar_vt_dia_util,p_descontar_va_dia_util:regras.descontar_va_dia_util,
      p_descontar_vt_sabado:regras.descontar_vt_sabado,p_descontar_va_sabado:regras.descontar_va_sabado,
    });
    setSalvandoRegras(false);
    if(error){alert("Erro ao salvar regras: "+error.message);return;} setModalRegras(false); await carregarImpactos(); alert("Regras de cálculo atualizadas.");
  };

  const custoMensal = useMemo(() => lista.reduce((s, b) => s + b.custoEmpresa * b.aderentes, 0), [lista]);
  const totalAdesoes = useMemo(() => lista.reduce((s, b) => s + b.aderentes, 0), [lista]);

  const salvar = async () => {
    if (!form.nome.trim()) {
      alert("Informe o nome do benefício.");
      return;
    }
    setSalvando(true);
    const payload = {
      nome: form.nome,
      tipo: form.tipo,
      custo_empresa: form.custoEmpresa || 0,
      aderentes: form.aderentes || 0,
    };
    const resp = editando
      ? await supabase.from("beneficios").update(payload).eq("id", form.id)
      : await supabase.from("beneficios").insert(payload);
    setSalvando(false);
    if (resp.error) {
      alert("Erro ao salvar: " + resp.error.message);
      return;
    }
    setModal(false);
    setForm(FORM_VAZIO);
    carregar();
  };
  const excluir = async (b: Beneficio) => {
    if (!confirm(`Remover "${b.nome}"?`)) return;
    const { error } = await supabase.from("beneficios").delete().eq("id", b.id);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar();
  };
  const set = (k: keyof Beneficio, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>🎁</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Benefícios
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              <b style={{ color: COR_TEXTO }}>{lista.length}</b> benefício(s) ativos
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setForm(FORM_VAZIO);
            setModal(true);
          }}
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
          + Novo Benefício
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Benefícios", value: String(lista.length), cor: "#6366f1", icon: "🎁" },
          { label: "Adesões totais", value: String(totalAdesoes), cor: "#16a34a", icon: "👥" },
          { label: "Custo mensal", value: real(custoMensal), cor: "#f59e0b", icon: "💰" },
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
            <p style={{ color: s.cor, fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: 18 }}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}><div><h3 style={{margin:0,fontSize:15,color:"#1f2937"}}>Banco de horas e impacto nos benefícios</h3><p style={{margin:"3px 0 0",fontSize:11,color:"#64748b"}}>Salário desconta horas. VT e VA/VR só perdem dias completos conforme as regras abaixo.</p></div><div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:11,fontWeight:800,color:"#4338ca",background:"#eef2ff",padding:"6px 10px",borderRadius:12}}>DIA ÚTIL {regras.limite_dia_util_horas}H</span><span style={{fontSize:11,fontWeight:800,color:"#0369a1",background:"#e0f2fe",padding:"6px 10px",borderRadius:12}}>SÁBADO {regras.limite_sabado_horas}H · VT {regras.descontar_vt_sabado?"SIM":"NÃO"} · VA {regras.descontar_va_sabado?"SIM":"NÃO"}</span>{isSuperAdmin&&<button onClick={()=>setModalRegras(true)} style={{background:"#4f46e5",color:"white",border:0,borderRadius:9,padding:"7px 11px",fontSize:11,fontWeight:800,cursor:"pointer"}}>⚙️ Editar regras</button>}</div></div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:"#f8fafc"}}>{["Colaborador","Trabalhado / vencido","Saldo","Faltas integrais","VT por dia","VA/VR por dia","Salário por horas"].map(h=><th key={h} style={{padding:"9px 10px",textAlign:h==="Colaborador"?"left":"right",color:"#64748b"}}>{h}</th>)}</tr></thead><tbody>{impactos.map(x=><tr key={x.nome} style={{borderTop:"1px solid #e5e7eb"}}><td style={{padding:"9px 10px",fontWeight:700}}>{x.nome}</td><td style={{padding:"9px 10px",textAlign:"right"}}>{(x.trabalhado/60).toFixed(1)}h / {(x.previsto/60).toFixed(1)}h</td><td style={{padding:"9px 10px",textAlign:"right",fontWeight:800,color:x.saldo<0?"#dc2626":"#16a34a"}}>{x.saldo>=0?"+":""}{(x.saldo/60).toFixed(1)}h</td><td style={{padding:"9px 10px",textAlign:"right"}}>{x.faltasUtil} útil · {x.faltasSabado} sáb.</td><td style={{padding:"9px 10px",textAlign:"right",color:"#dc2626"}}>{real(x.descontoVt)}</td><td style={{padding:"9px 10px",textAlign:"right",color:"#dc2626"}}>{real(x.descontoVa)}</td><td style={{padding:"9px 10px",textAlign:"right",color:"#dc2626"}}>{real(x.descontoSalario)}</td></tr>)}</tbody></table></div>
      </div>
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : lista.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum benefício cadastrado.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {lista.map((b) => {
            const t = TIPOS[b.tipo] || { cor: COR, icon: "🎁" };
            return (
              <div
                key={b.id}
                style={{
                  ...card,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  borderTop: `3px solid ${t.cor}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 11,
                        background: `${t.cor}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      {t.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          color: "#1f2937",
                          fontSize: 14,
                          fontWeight: 800,
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.nome}
                      </p>
                      <span style={{ color: t.cor, fontSize: 11, fontWeight: 600 }}>{b.tipo}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        setForm(b);
                        setModal(true);
                      }}
                      style={{
                        background: "#eef2ff",
                        color: COR_TEXTO,
                        border: "1px solid #c7d2fe",
                        borderRadius: 8,
                        padding: "4px 9px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => excluir(b)}
                      style={{
                        background: "#fef2f2",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        padding: "4px 9px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    borderTop: "1px solid #f3f4f6",
                    paddingTop: 12,
                  }}
                >
                  <div>
                    <p
                      style={{
                        color: "#9ca3af",
                        fontSize: 10,
                        margin: 0,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      Custo/pessoa
                    </p>
                    <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 800, margin: "2px 0 0" }}>
                      {real(b.custoEmpresa)}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p
                      style={{
                        color: "#9ca3af",
                        fontSize: 10,
                        margin: 0,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      Aderentes
                    </p>
                    <p style={{ color: t.cor, fontSize: 15, fontWeight: 800, margin: "2px 0 0" }}>
                      {b.aderentes}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modalRegras && isSuperAdmin && (
        <div onClick={()=>setModalRegras(false)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:2100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div onClick={e=>e.stopPropagation()} style={{...card,width:"100%",maxWidth:620,overflow:"hidden"}}>
          <div style={{padding:"18px 22px",borderBottom:"1px solid #e5e7eb"}}><h3 style={{margin:0,fontSize:17,color:"#1f2937"}}>Editor das regras de cálculo</h3><p style={{margin:"4px 0 0",fontSize:12,color:"#64748b"}}>Exclusivo do super administrador. Alterações valem no próximo cálculo/reprocessamento da folha.</p></div>
          <div style={{padding:22,display:"grid",gap:16}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Campo label="Limite de falta — dia útil (h)"><input type="number" min="1" value={regras.limite_dia_util_horas} onChange={e=>setRegras(v=>({...v,limite_dia_util_horas:Number(e.target.value)}))} style={inputStyle}/></Campo><Campo label="Limite de falta — sábado (h)"><input type="number" min="1" value={regras.limite_sabado_horas} onChange={e=>setRegras(v=>({...v,limite_sabado_horas:Number(e.target.value)}))} style={inputStyle}/></Campo></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{[["VT em dia útil","descontar_vt_dia_util"],["VA/VR em dia útil","descontar_va_dia_util"],["VT no sábado","descontar_vt_sabado"],["VA/VR no sábado","descontar_va_sabado"]].map(([label,key])=><label key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"11px 13px",border:"1px solid #e5e7eb",borderRadius:10,fontSize:12,fontWeight:700,color:"#334155"}}>{label}<input type="checkbox" checked={!!(regras as any)[key]} onChange={e=>setRegras(v=>({...v,[key]:e.target.checked}))}/></label>)}</div>
          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:11,fontSize:11,color:"#166534"}}>Atrasos e saídas antecipadas afetam somente o salário. Benefícios só são reduzidos quando houver falta integral já encerrada.</div></div>
          <div style={{padding:"14px 22px",borderTop:"1px solid #e5e7eb",display:"flex",justifyContent:"flex-end",gap:9}}><button onClick={()=>setModalRegras(false)} style={{background:"white",border:"1px solid #e5e7eb",borderRadius:9,padding:"9px 15px",fontWeight:700,cursor:"pointer"}}>Cancelar</button><button onClick={salvarRegras} disabled={salvandoRegras} style={{background:"#4f46e5",color:"white",border:0,borderRadius:9,padding:"9px 16px",fontWeight:800,cursor:"pointer"}}>{salvandoRegras?"Salvando...":"Salvar regras"}</button></div>
        </div></div>
      )}
      {modal && (
        <div
          onClick={() => setModal(false)}
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
            style={{ ...card, width: "100%", maxWidth: 480, overflow: "hidden" }}
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
                {editando ? "Editar Benefício" : "Novo Benefício"}
              </h3>
              <button
                onClick={() => setModal(false)}
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
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Nome do benefício">
                <input
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  style={inputStyle}
                  placeholder="Ex: Vale Refeição"
                />
              </Campo>
              <Campo label="Tipo">
                <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} style={inputStyle}>
                  {Object.keys(TIPOS).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Custo por pessoa (R$)">
                  <input
                    type="number"
                    value={form.custoEmpresa || ""}
                    onChange={(e) => set("custoEmpresa", Number(e.target.value))}
                    style={inputStyle}
                  />
                </Campo>
                <Campo label="Aderentes">
                  <input
                    type="number"
                    value={form.aderentes || ""}
                    onChange={(e) => set("aderentes", Number(e.target.value))}
                    style={inputStyle}
                  />
                </Campo>
              </div>
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
                onClick={() => setModal(false)}
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
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
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
        {label}
      </label>
      {children}
    </div>
  );
}