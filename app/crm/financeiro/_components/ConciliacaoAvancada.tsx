"use client";

import { useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Extrato = { id:string; data:string; descricao:string; valor:number; tipo:string; conciliado:boolean; titulo_id?:string; status_conciliacao?:string; valor_alocado?:number };
type Titulo = { id:string; tipo:string; descricao:string; valor:number; status:string; competencia:string; vencimento:string; categoria:string; centro_custo?:string; valor_conciliado?:number };
type Alocacao = { titulo_id:string; valor:number };

const brl=(v:number)=>(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const btn={border:"1px solid #365f4b",borderRadius:9,padding:"9px 12px",fontWeight:800,cursor:"pointer",background:"#5b8f74",color:"#fff"} as const;
const inp={border:"1px solid #cbd5e1",borderRadius:9,padding:"9px 10px",background:"#fff"} as const;

export function ConciliacaoAvancada({extratos,titulos,fechado,onAtualizar}:{extratos:Extrato[];titulos:Titulo[];fechado:boolean;onAtualizar:()=>void}) {
  const [aberto,setAberto]=useState<string|null>(null);
  const [alocacoes,setAlocacoes]=useState<Alocacao[]>([]);
  const [tarifa,setTarifa]=useState(0);
  const [ajuste,setAjuste]=useState(0);
  const [observacao,setObservacao]=useState("");
  const [ocupado,setOcupado]=useState(false);
  const [automatico,setAutomatico]=useState(false);
  const [tolerancia,setTolerancia]=useState(3);
  const [msg,setMsg]=useState("");
  const pendentes=extratos.filter(e=>!e.conciliado);
  const competencia=extratos.find(e=>e.data)?.data?.slice(0,7)||titulos.find(t=>t.competencia)?.competencia||"";

  const abrir=(e:Extrato)=>{
    setAberto(e.id);setTarifa(0);setAjuste(0);setObservacao("");setMsg("");
    const tipo=e.tipo==="credito"?"receber":"pagar";
    const restante=Math.max(0,e.valor-Number(e.valor_alocado||0));
    const candidatos=titulos.filter(t=>t.tipo===tipo&&Math.max(0,t.valor-Number(t.valor_conciliado||0))>0.009)
      .sort((a,b)=>Math.abs((a.valor-Number(a.valor_conciliado||0))-restante)-Math.abs((b.valor-Number(b.valor_conciliado||0))-restante));
    const exato=candidatos.find(t=>Math.abs((t.valor-Number(t.valor_conciliado||0))-restante)<0.01);
    setAlocacoes(exato?[{titulo_id:exato.id,valor:restante}]:[]);
  };

  const candidatos=(e:Extrato)=> {
    const tipo=e.tipo==="credito"?"receber":"pagar";
    return titulos.filter(t=>t.tipo===tipo&&Math.max(0,t.valor-Number(t.valor_conciliado||0))>0.009)
      .sort((a,b)=>{
        const da=Math.abs(new Date(a.vencimento||a.competencia+"-01").getTime()-new Date(e.data).getTime());
        const db=Math.abs(new Date(b.vencimento||b.competencia+"-01").getTime()-new Date(e.data).getTime());
        return da-db;
      }).slice(0,80);
  };
  const titulo=(id:string)=>titulos.find(t=>t.id===id);
  const adicionar=(id:string)=>{
    if(!id||alocacoes.some(a=>a.titulo_id===id))return;
    const t=titulo(id);if(!t)return;
    const saldoTitulo=Math.max(0,t.valor-Number(t.valor_conciliado||0));
    const e=extratos.find(x=>x.id===aberto)!;
    const restante=Math.max(0,e.valor-Number(e.valor_alocado||0)-alocacoes.reduce((s,a)=>s+a.valor,0)-tarifa-ajuste);
    setAlocacoes([...alocacoes,{titulo_id:id,valor:Math.min(saldoTitulo,restante)}]);
  };
  const salvar=async(e:Extrato)=>{
    if(fechado)return setMsg("A competência está fechada. Reabra antes de conciliar.");
    const itens:any[]=[
      ...alocacoes.filter(a=>a.valor>0).map(a=>({...a,tipo:"titulo"})),
      ...(tarifa>0?[{tipo:"tarifa",descricao:"Tarifa bancária",valor:tarifa}]:[]),
      ...(ajuste>0?[{tipo:"ajuste",descricao:"Ajuste de conciliação",valor:ajuste}]:[]),
    ];
    if(!itens.length)return setMsg("Adicione ao menos uma alocação.");
    setOcupado(true);
    const {data,error}=await supabase.rpc("conciliar_extrato_avancado",{p_extrato_id:e.id,p_itens:itens,p_observacao:observacao||null});
    setOcupado(false);
    if(error)return setMsg(error.message);
    setMsg(`Conciliação salva: ${data.status}. Diferença ${brl(Number(data.diferenca||0))}.`);
    setAberto(null);onAtualizar();
  };
  const conciliarAutomaticamente=async()=>{
    if(fechado)return setMsg("A competencia esta fechada. Reabra antes de conciliar.");
    if(!competencia)return setMsg("Nao ha competencia disponivel para processar.");
    setAutomatico(true);setMsg("Analisando correspondencias seguras...");
    const simulacao=await supabase.rpc("conciliar_extratos_automaticamente",{p_competencia:competencia,p_tolerancia_dias:tolerancia,p_aplicar:false});
    if(simulacao.error){setAutomatico(false);return setMsg(simulacao.error.message)}
    const qtd=Number(simulacao.data?.sugeridos||0);
    if(!qtd){setAutomatico(false);return setMsg("Nenhuma correspondencia automatica segura. Os casos ambiguos continuam disponiveis para conciliacao manual.")}
    if(!window.confirm(`${qtd} movimento(s) possuem titulo unico, valor exato e data compativel. Aplicar essas conciliacoes agora?`)){setAutomatico(false);return setMsg(`Simulacao concluida: ${qtd} correspondencia(s) segura(s), nenhuma alteracao aplicada.`)}
    const aplicacao=await supabase.rpc("conciliar_extratos_automaticamente",{p_competencia:competencia,p_tolerancia_dias:tolerancia,p_aplicar:true});
    setAutomatico(false);
    if(aplicacao.error)return setMsg(aplicacao.error.message);
    setMsg(`Conciliacao automatica concluida: ${aplicacao.data?.conciliados||0} conciliado(s), ${aplicacao.data?.ignorados||0} mantido(s) para analise manual e ${aplicacao.data?.erros||0} erro(s).`);
    onAtualizar();
  };

  const totais=useMemo(()=>({
    conciliados:extratos.filter(e=>e.conciliado).length,
    parciais:extratos.filter(e=>e.status_conciliacao==="parcial").length,
    pendentes:pendentes.filter(e=>e.status_conciliacao!=="parcial").length,
  }),[extratos,pendentes]);

  return <div style={{display:"grid",gap:12}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(140px,1fr))",gap:9}}>
      {([["Conciliados",totais.conciliados,"#166534"],["Parciais",totais.parciais,"#b45309"],["Pendentes",totais.pendentes,"#475569"]] as const).map(x=><div key={x[0]} style={{background:"#fff",border:"1px solid #dcebe2",borderRadius:13,padding:14}}><small style={{color:"#64748b"}}>{x[0]}</small><b style={{display:"block",fontSize:23,color:x[2]}}>{x[1]}</b></div>)}
    </div>
    <div style={{background:"#f3f8f5",border:"1px solid #bfd9ca",borderRadius:13,padding:13,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div><b style={{color:"#365314"}}>Conciliacao automatica segura</b><small style={{display:"block",color:"#64748b",marginTop:3}}>Aplica apenas valor exato, tipo compativel, titulo unico e vencimento dentro da tolerancia. Ambiguidades nao sao alteradas.</small></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}><label style={{fontSize:10,color:"#64748b"}}>Tolerancia em dias <input type="number" min="0" max="31" value={tolerancia} onChange={e=>setTolerancia(Math.max(0,Math.min(31,Number(e.target.value)||0)))} style={{...inp,width:72,marginLeft:5}}/></label><button disabled={fechado||automatico||!pendentes.length} onClick={conciliarAutomaticamente} style={{...btn,opacity:(fechado||automatico||!pendentes.length) ? .55 : 1}}>{automatico?"Processando...":"Conciliar seguros em lote"}</button></div>
    </div>
    {fechado&&<div style={{background:"#fff7ed",border:"1px solid #fdba74",padding:12,borderRadius:12,color:"#9a3412",fontSize:12,fontWeight:700}}>Competência fechada: consulta liberada, alterações bloqueadas.</div>}
    {msg&&<div style={{background:"#f8fafc",border:"1px solid #e2e8f0",padding:10,borderRadius:10,fontSize:11}}>{msg}</div>}
    {pendentes.slice(0,100).map(e=>{
      const abertoAqui=aberto===e.id;
      const ja=Number(e.valor_alocado||0),restante=Math.max(0,e.valor-ja);
      const total=alocacoes.reduce((s,a)=>s+a.valor,0)+tarifa+ajuste;
      return <div key={e.id} style={{background:"#fff",border:`1px solid ${e.status_conciliacao==="parcial"?"#fdba74":"#dcebe2"}`,borderRadius:15,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"100px minmax(220px,1fr) 135px 110px 110px",gap:10,alignItems:"center",padding:14,fontSize:11}}>
          <span>{new Date(`${e.data}T00:00:00`).toLocaleDateString("pt-BR")}</span><div><b>{e.descricao}</b><small style={{display:"block",color:"#64748b",marginTop:3}}>{e.tipo==="credito"?"Entrada":"Saída"}</small></div><b>{brl(e.valor)}</b><span style={{color:e.status_conciliacao==="parcial"?"#b45309":"#64748b",fontWeight:800}}>{e.status_conciliacao==="parcial"?`Parcial ${brl(ja)}`:"Pendente"}</span><button disabled={fechado} style={{...btn,opacity:fechado ? .55 : 1}} onClick={()=>abertoAqui?setAberto(null):abrir(e)}>{abertoAqui?"Fechar":"Conciliar"}</button>
        </div>
        {abertoAqui&&<div style={{borderTop:"1px solid #e6f1eb",background:"#f8fbf9",padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:12}}><div><b>Distribuir {brl(restante)}</b><p style={{margin:"3px 0",fontSize:10,color:"#64748b"}}>Aceita um ou vários títulos, pagamento parcial, tarifa e ajuste.</p></div><b style={{color:total>restante+.01?"#dc2626":"#294c3b"}}>Alocado agora: {brl(total)} · sobra {brl(restante-total)}</b></div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}><select defaultValue="" onChange={ev=>{adicionar(ev.target.value);ev.target.value=""}} style={{...inp,minWidth:340}}><option value="">+ Adicionar título sugerido</option>{candidatos(e).map(t=><option key={t.id} value={t.id}>{t.vencimento} · {t.descricao} · saldo {brl(t.valor-Number(t.valor_conciliado||0))}</option>)}</select></div>
          {alocacoes.map((a,i)=>{const t=titulo(a.titulo_id)!;return <div key={a.titulo_id} style={{display:"grid",gridTemplateColumns:"1fr 150px 90px",gap:8,alignItems:"center",padding:"8px 0",borderTop:"1px solid #e5e7eb"}}><span><b>{t?.descricao}</b><small style={{display:"block",color:"#64748b"}}>Venc. {t?.vencimento} · título {brl(t?.valor||0)}</small></span><input type="number" min="0" step=".01" value={a.valor} onChange={ev=>setAlocacoes(alocacoes.map((x,j)=>j===i?{...x,valor:Number(ev.target.value)}:x))} style={inp}/><button onClick={()=>setAlocacoes(alocacoes.filter((_,j)=>j!==i))} style={{...btn,background:"#fff",color:"#dc2626",borderColor:"#fecaca"}}>Remover</button></div>})}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginTop:12}}><label style={{fontSize:10,color:"#64748b"}}>Tarifa bancária<input type="number" min="0" step=".01" value={tarifa} onChange={ev=>setTarifa(Number(ev.target.value))} style={{...inp,width:"100%",display:"block",marginTop:4}}/></label><label style={{fontSize:10,color:"#64748b"}}>Ajuste<input type="number" min="0" step=".01" value={ajuste} onChange={ev=>setAjuste(Number(ev.target.value))} style={{...inp,width:"100%",display:"block",marginTop:4}}/></label><label style={{fontSize:10,color:"#64748b"}}>Observação<input value={observacao} onChange={ev=>setObservacao(ev.target.value)} style={{...inp,width:"100%",display:"block",marginTop:4}}/></label></div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}><button disabled={ocupado||total<=0||total>restante+.01} onClick={()=>salvar(e)} style={{...btn,opacity:(ocupado||total<=0||total>restante+.01) ? .5 : 1}}>{ocupado?"Salvando...":"Confirmar conciliação"}</button></div>
        </div>}
      </div>;
    })}
    {!pendentes.length&&<div style={{padding:30,textAlign:"center",color:"#64748b"}}>Todos os movimentos estão conciliados.</div>}
  </div>;
}
