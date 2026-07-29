"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

const dinheiro=(v:number)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const atual=()=>new Date().toISOString().slice(0,7);
const campo={border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:12} as const;
const card={background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:14} as const;

export function IntegracaoFinanceiraSection(){
 const [comp,setComp]=useState(atual()),[itens,setItens]=useState<any[]>([]),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 const [funcionarios,setFuncionarios]=useState<any[]>([]),[beneficios,setBeneficios]=useState<any[]>([]),[vinculos,setVinculos]=useState<any[]>([]);
 const [funcionarioId,setFuncionarioId]=useState(""),[beneficioId,setBeneficioId]=useState(""),[valor,setValor]=useState(0);
 const carregar=async()=>{const [f,fn,b,v]=await Promise.all([
  supabase.from("folha_itens").select("*").eq("competencia",comp).order("nome"),
  supabase.from("funcionarios").select("id,nome,cargo,status").neq("status","desligado").order("nome"),
  supabase.from("beneficios").select("id,nome,tipo,custo_empresa").order("nome"),
  supabase.from("rh_beneficio_funcionarios").select("id,funcionario_id,beneficio_id,valor_empresa,ativo").eq("ativo",true)
 ]);setItens(f.data||[]);setFuncionarios(fn.data||[]);setBeneficios(b.data||[]);setVinculos(v.data||[]);if(f.error||fn.error||b.error||v.error)setMsg((f.error||fn.error||b.error||v.error)?.message||"")};
 useEffect(()=>{carregar()},[comp]);
 const sincronizar=async()=>{setBusy(true);const {data,error}=await supabase.rpc("sincronizar_financeiro_rh",{p_competencia:comp});setMsg(error?error.message:`Sincronizado: ${JSON.stringify(data)}`);setBusy(false);carregar()};
 const vincular=async()=>{if(!funcionarioId||!beneficioId)return setMsg("Selecione funcionário e benefício.");setBusy(true);const custo=valor||Number(beneficios.find(x=>x.id===beneficioId)?.custo_empresa||0);const {error}=await supabase.from("rh_beneficio_funcionarios").upsert({funcionario_id:funcionarioId,beneficio_id:beneficioId,valor_empresa:custo,ativo:true},{onConflict:"funcionario_id,beneficio_id"});setMsg(error?error.message:"Benefício vinculado e folha atualizada automaticamente.");setBusy(false);carregar()};
 const remover=async(id:string)=>{const {error}=await supabase.from("rh_beneficio_funcionarios").update({ativo:false}).eq("id",id);setMsg(error?error.message:"Benefício desvinculado.");carregar()};
 const totais=itens.reduce((a,x)=>({sal:a.sal+Number(x.base||0),vt:a.vt+Number(x.vale_transporte||0),va:a.va+Number(x.vale_alimentacao||0),ben:a.ben+Number(x.beneficios||0),enc:a.enc+Number(x.encargos_empresa||0),com:a.com+Number(x.comissao||0)}),{sal:0,vt:0,va:0,ben:0,enc:0,com:0});
 const nomes=useMemo(()=>({func:Object.fromEntries(funcionarios.map(x=>[x.id,x.nome])),ben:Object.fromEntries(beneficios.map(x=>[x.id,x.nome]))}),[funcionarios,beneficios]);
 return <div style={{display:"grid",gap:16}}>
  <div><h1 style={{margin:0,fontSize:24}}>RH → Financeiro</h1><p style={{fontSize:12,color:"#64748b"}}>Folha integrada com salário, benefícios, ajudas de custo, encargos e comissões auditadas.</p></div>
  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><input type="month" value={comp} onChange={e=>setComp(e.target.value)} style={campo}/><button onClick={sincronizar} disabled={busy}>Sincronizar competência</button>{msg&&<span style={{fontSize:11}}>{msg}</span>}</div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>{[["Salários",totais.sal],["VT",totais.vt],["Alimentação",totais.va],["Benefícios",totais.ben],["Encargos",totais.enc],["Comissões",totais.com]].map(([l,v])=><div key={String(l)} style={card}><small>{l}</small><b style={{display:"block",marginTop:5}}>{dinheiro(Number(v))}</b></div>)}</div>
  <div style={card}><h3 style={{marginTop:0}}>Benefícios por funcionário</h3><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><select value={funcionarioId} onChange={e=>setFuncionarioId(e.target.value)} style={campo}><option value="">Funcionário</option>{funcionarios.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select><select value={beneficioId} onChange={e=>{setBeneficioId(e.target.value);setValor(Number(beneficios.find(x=>x.id===e.target.value)?.custo_empresa||0))}} style={campo}><option value="">Benefício</option>{beneficios.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select><input type="number" step=".01" value={valor} onChange={e=>setValor(Number(e.target.value))} style={campo}/><button onClick={vincular} disabled={busy}>Vincular</button></div>{vinculos.map(x=><div key={x.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 120px 80px",padding:"7px 0",borderBottom:"1px solid #eee",fontSize:12}}><span>{nomes.func[x.funcionario_id]||x.funcionario_id}</span><span>{nomes.ben[x.beneficio_id]||x.beneficio_id}</span><b>{dinheiro(x.valor_empresa)}</b><button onClick={()=>remover(x.id)}>Remover</button></div>)}</div>
  <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{["Funcionário","Salário","VT","VA","Benefícios","Encargos","Comissão","Meta"].map(h=><th key={h} style={{padding:9,textAlign:"left"}}>{h}</th>)}</tr></thead><tbody>{itens.map(x=><tr key={x.id} style={{borderTop:"1px solid #eee"}}><td style={{padding:9}}><b>{x.nome}</b><br/>{x.cargo}</td><td>{dinheiro(x.base)}</td><td>{dinheiro(x.vale_transporte)}</td><td>{dinheiro(x.vale_alimentacao)}</td><td>{dinheiro(x.beneficios)}</td><td>{dinheiro(x.encargos_empresa)}</td><td>{dinheiro(x.comissao)}</td><td>{x.comissao_detalhes?.quantidade||0}/20 {x.comissao_detalhes?.liberada?"✓":""}</td></tr>)}</tbody></table></div>
 </div>
}