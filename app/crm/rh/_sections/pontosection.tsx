"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useTemPermissao } from "../../../hooks/useTemPermissao";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Ponto / Frequência  (CONECTADO — lê 'ponto_registros')
// ───────────────────────────────────────────────────────────────────────
// Folha de ponto do mês: batidas reais por funcionário e dia, com horário,
// tipo e link 📍 pro mapa de onde a pessoa bateu. Calcula horas por dia.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

const TIPO_COR: Record<string, string> = {
  Entrada: "#16a34a",
  "Saída p/ almoço": "#f59e0b",
  "Retorno do almoço": "#0ea5e9",
  Saída: "#dc2626",
  Marcação: "#6b7280",
};

type Registro = {
  id: string;
  funcionario: string;
  cargo: string;
  tipo: string;
  data_hora: string;
  latitude: number | null;
  longitude: number | null;
  selfie_url: string | null;
  ajuste_manual?: boolean | null;
  ajuste_por?: string | null;
};

// Tipos de batida (mesma ordem do app de bater ponto)
const TIPOS_BATIDA = ["Entrada", "Saída p/ almoço", "Retorno do almoço", "Saída", "Marcação"];

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const horaFmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
};
const diaChave = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const fmtHoras = (h: number) => {
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return `${horas}h${String(min).padStart(2, "0")}`;
};

// soma os intervalos (entrada→saída em pares) de um dia
function horasDoDia(batidas: Registro[]): number {
  const ord = [...batidas].sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  let ms = 0;
  for (let i = 0; i + 1 < ord.length; i += 2) {
    ms += new Date(ord[i + 1].data_hora).getTime() - new Date(ord[i].data_hora).getTime();
  }
  return ms / 3600000;
}

// ── Jornada esperada (regra CLT 44h): seg-sex 8h, sábado 4h, domingo 0 ──
//    getDay(): 0=domingo, 1=seg ... 6=sábado.
function jornadaEsperadaDoDia(diaSemana: number): number {
  if (diaSemana === 0) return 0;   // domingo
  if (diaSemana === 6) return 4;   // sábado
  return 8;                         // seg-sex
}
// parse "dd/mm/aaaa" (formato pt-BR usado em diaChave) → Date local
function parseDiaBR(s: string): Date {
  const [d, m, a] = s.split("/").map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}
// h decimal → "+1h30" / "-0h45" (com sinal)
function fmtSaldo(h: number): string {
  const sinal = h < 0 ? "-" : "+";
  const abs = Math.abs(h);
  const horas = Math.floor(abs);
  const min = Math.round((abs - horas) * 60);
  return `${sinal}${horas}h${String(min).padStart(2, "0")}`;
}
const escapeHtml = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function PontoSection() {
  const perm = useTemPermissao();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mes, setMes] = useState(mesAtual());
  // 🔐 Mapa nome-do-funcionário → fila_id (via funcionarios.user_email → usuarios.fila_id).
  //    Usado pra recortar a folha por fila pro supervisor.
  const [filaPorNome, setFilaPorNome] = useState<Record<string, number | null>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<{ url: string; mapsUrl: string | null } | null>(null);

  // ✏️ EDIÇÃO DE PONTO (admin com permissão rh_ponto_editar)
  const podeEditar = perm.superAdmin || perm.escopo("rh_ponto.editar" as any) !== "none";
  const [meuEmail, setMeuEmail] = useState("");
  // modal de edição/criação: { modo, registro?, funcionario, cargo, dia(YYYY-MM-DD), tipo, hora(HH:MM) }
  const [editModal, setEditModal] = useState<null | {
    modo: "editar" | "novo";
    registroId?: string;
    funcionario: string;
    cargo: string;
    data: string;   // YYYY-MM-DD
    hora: string;    // HH:MM
    tipo: string;
  }>(null);
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeuEmail(data?.user?.email || ""));
  }, []);

  const carregar = async (m: string) => {
    setCarregando(true);
    const [ano, mm] = m.split("-").map(Number);
    const inicio = new Date(ano, mm - 1, 1, 0, 0, 0);
    const fim = new Date(ano, mm, 1, 0, 0, 0); // 1º dia do mês seguinte
    const { data, error } = await supabase
      .from("ponto_registros")
      .select("id, funcionario, cargo, tipo, data_hora, latitude, longitude, selfie_url, ajuste_manual, ajuste_por")
      .gte("data_hora", inicio.toISOString())
      .lt("data_hora", fim.toISOString())
      .order("data_hora", { ascending: true });
    if (error) {
      console.error(error);
      alert("Erro ao carregar o ponto: " + error.message);
    } else {
      setRegistros((data || []) as Registro[]);
    }
    setCarregando(false);
  };
  useEffect(() => {
    carregar(mes);
  }, [mes]);

  // Monta o mapa nome → fila_id: funcionarios (nome, user_email) cruzado com
  // usuarios (email, fila_id). Funcionário sem usuário/fila → null (liderança).
  useEffect(() => {
    (async () => {
      try {
        const [{ data: funcs }, { data: usrs }] = await Promise.all([
          supabase.from("funcionarios").select("nome, user_email"),
          supabase.from("usuarios").select("email, fila_id"),
        ]);
        const filaPorEmail: Record<string, number | null> = {};
        (usrs || []).forEach((u: any) => {
          if (u.email) filaPorEmail[String(u.email).toLowerCase()] = u.fila_id ?? null;
        });
        const mapa: Record<string, number | null> = {};
        (funcs || []).forEach((f: any) => {
          const email = (f.user_email || "").toLowerCase();
          mapa[String(f.nome || "").trim().toLowerCase()] = email ? (filaPorEmail[email] ?? null) : null;
        });
        setFilaPorNome(mapa);
      } catch (e) {
        console.error("[ponto] erro ao montar mapa de filas:", e);
      }
    })();
  }, []);

  // agrupa: funcionário → dia → batidas
  const porFunc = useMemo(() => {
    const m: Record<string, { cargo: string; dias: Record<string, Registro[]> }> = {};
    registros.forEach((r) => {
      if (!m[r.funcionario]) m[r.funcionario] = { cargo: r.cargo, dias: {} };
      const dia = diaChave(r.data_hora);
      if (!m[r.funcionario].dias[dia]) m[r.funcionario].dias[dia] = [];
      m[r.funcionario].dias[dia].push(r);
    });
    const lista = Object.entries(m).map(([funcionario, info]) => {
      const dias = Object.entries(info.dias)
        .map(([dia, batidas]) => ({ dia, batidas, horas: horasDoDia(batidas) }))
        .sort((a, b) => b.dia.localeCompare(a.dia));
      const totalHoras = dias.reduce((s, d) => s + d.horas, 0);
      return { funcionario, cargo: info.cargo, dias, totalHoras };
    });

    // 🔐 Recorte por FILA:
    //   • escopo "all" (admin / RH geral / super) → vê TODOS, inclusive liderança (sem fila).
    //   • escopo "team" (supervisor) com fila definida → vê só funcionários da MESMA fila.
    //     Liderança (sem fila) NÃO aparece pro supervisor.
    //   • Sem escopo / sem fila → não recorta (deixa o gate da tela cuidar do acesso).
    if (perm.carregando) return lista;
    const escopoPonto = perm.superAdmin ? "all" : perm.escopo("rh_ponto.acessar" as any);
    if (escopoPonto === "all") return lista;
    if (escopoPonto === "team" && perm.filaId != null) {
      return lista.filter((f) => {
        const filaFunc = filaPorNome[String(f.funcionario).trim().toLowerCase()];
        return filaFunc != null && Number(filaFunc) === Number(perm.filaId);
      });
    }
    return lista;
  }, [registros, perm.carregando, perm.superAdmin, perm.filaId, filaPorNome]);

  // ── converte "YYYY-MM-DD" + "HH:MM" → ISO local
  const montarISO = (data: string, hora: string): string | null => {
    if (!data || !hora) return null;
    const [a, m, d] = data.split("-").map(Number);
    const [h, min] = hora.split(":").map(Number);
    if (!a || !m || !d || isNaN(h) || isNaN(min)) return null;
    return new Date(a, m - 1, d, h, min, 0).toISOString();
  };
  // ── abre o modal pra EDITAR uma batida existente
  const abrirEditar = (b: Registro) => {
    const dt = new Date(b.data_hora);
    const data = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const hora = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    setEditModal({ modo: "editar", registroId: b.id, funcionario: b.funcionario, cargo: b.cargo || "", data, hora, tipo: b.tipo });
  };
  // ── abre o modal pra ADICIONAR uma batida num dia (dia em pt-BR dd/mm/aaaa)
  const abrirNovo = (funcionario: string, cargo: string, diaBR: string) => {
    const dt = parseDiaBR(diaBR);
    const data = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    setEditModal({ modo: "novo", funcionario, cargo, data, hora: "08:00", tipo: "Entrada" });
  };
  // ── salva (insert no modo novo, update no modo editar) — marca como ajuste manual
  const salvarEdit = async () => {
    if (!editModal) return;
    const iso = montarISO(editModal.data, editModal.hora);
    if (!iso) { alert("Informe data e hora válidas."); return; }
    setSalvandoEdit(true);
    try {
      if (editModal.modo === "editar" && editModal.registroId) {
        const { error } = await supabase.from("ponto_registros").update({
          data_hora: iso, tipo: editModal.tipo,
          ajuste_manual: true, ajuste_por: meuEmail,
        }).eq("id", editModal.registroId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ponto_registros").insert({
          funcionario: editModal.funcionario, cargo: editModal.cargo || "",
          tipo: editModal.tipo, data_hora: iso,
          latitude: null, longitude: null, precisao: null, selfie_url: null,
          ajuste_manual: true, ajuste_por: meuEmail,
        });
        if (error) throw error;
      }
      setEditModal(null);
      await carregar(mes);
    } catch (e: any) {
      console.error("[ponto] salvar edição", e);
      alert("Erro ao salvar: " + (e?.message || "tente de novo"));
    } finally {
      setSalvandoEdit(false);
    }
  };
  // ── exclui uma batida
  const excluirBatida = async (b: Registro) => {
    if (!confirm(`Excluir a batida de ${horaFmt(b.data_hora)} (${b.tipo}) de ${b.funcionario}?`)) return;
    try {
      const { error } = await supabase.from("ponto_registros").delete().eq("id", b.id);
      if (error) throw error;
      await carregar(mes);
    } catch (e: any) {
      console.error("[ponto] excluir", e);
      alert("Erro ao excluir: " + (e?.message || "tente de novo"));
    }
  };

  // 🖨️ Gera a folha de ponto do funcionário (mês selecionado) e abre impressão→PDF.
  //    Regras: jornada 8h seg-sex, 4h sáb, 0 dom. Mostra entrada/saída do dia,
  //    horas trabalhadas, jornada esperada, saldo (extra/débito) e totais.
  const gerarFolhaPonto = (f: { funcionario: string; cargo: string; dias: { dia: string; batidas: Registro[]; horas: number }[]; totalHoras: number }) => {
    const [ano, mm] = mes.split("-").map(Number);
    const nomeMes = new Date(ano, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    // Mapa dia(pt-BR) → batidas, pra montar TODOS os dias do mês (inclusive faltas)
    const porDia: Record<string, Registro[]> = {};
    f.dias.forEach((d) => { porDia[d.dia] = d.batidas; });

    const diasNoMes = new Date(ano, mm, 0).getDate();
    let totalTrab = 0, totalPrev = 0, totalExtra = 0, totalDebito = 0, faltas = 0;
    const linhas: string[] = [];

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dt = new Date(ano, mm - 1, dia);
      const dow = dt.getDay();
      const chave = dt.toLocaleDateString("pt-BR");
      const nomeDow = dt.toLocaleDateString("pt-BR", { weekday: "short" });
      const esperada = jornadaEsperadaDoDia(dow);
      const batidas = (porDia[chave] || []).slice().sort((a, b) => a.data_hora.localeCompare(b.data_hora));
      const trabalhada = batidas.length ? horasDoDia(batidas) : 0;

      // entrada = 1ª batida, saída = última (pra exibição)
      const entrada = batidas.length ? horaFmt(batidas[0].data_hora) : "—";
      const saida = batidas.length >= 2 ? horaFmt(batidas[batidas.length - 1].data_hora) : "—";
      // todas as marcações do dia (pra detalhar almoço)
      const marcacoes = batidas.map((b) => horaFmt(b.data_hora)).join(" · ") || "—";

      const saldo = trabalhada - esperada;
      totalTrab += trabalhada;
      totalPrev += esperada;
      if (saldo > 0) totalExtra += saldo;
      if (saldo < 0 && esperada > 0) totalDebito += Math.abs(saldo);
      const ehFalta = esperada > 0 && trabalhada === 0;
      if (ehFalta) faltas++;

      const corLinha = dow === 0 ? "background:#f9fafb;color:#9ca3af;"
        : ehFalta ? "background:#fef2f2;" : "";
      const saldoTxt = esperada === 0 && trabalhada === 0 ? "—"
        : ehFalta ? "FALTA" : fmtSaldo(saldo);
      const saldoCor = ehFalta ? "color:#dc2626;font-weight:700;"
        : saldo < 0 ? "color:#dc2626;" : saldo > 0 ? "color:#16a34a;" : "color:#6b7280;";

      linhas.push(`<tr style="${corLinha}">
        <td style="padding:5px 8px;border:1px solid #e5e7eb;white-space:nowrap;">${dia}/${String(mm).padStart(2,"0")} <span style="color:#9ca3af;text-transform:capitalize;">${escapeHtml(nomeDow.replace(".",""))}</span></td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;">${entrada}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;">${saida}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;font-size:10px;color:#6b7280;">${escapeHtml(marcacoes)}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;">${esperada === 0 ? "—" : fmtHoras(esperada)}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;">${trabalhada === 0 ? "—" : fmtHoras(trabalhada)}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;${saldoCor}">${saldoTxt}</td>
      </tr>`);
    }

    const saldoFinal = totalTrab - totalPrev;
    const win = window.open("", "_blank", "width=820,height=1000");
    if (!win) { alert("Permita pop-ups pra gerar a folha de ponto."); return; }
    win.document.write(`<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
      <title>Folha de Ponto — ${escapeHtml(f.funcionario)} — ${escapeHtml(nomeMes)}</title>
      <style>
        * { font-family: Arial, Helvetica, sans-serif; }
        body { margin: 24px; color: #1f2937; }
        h1 { font-size: 18px; margin: 0; }
        .sub { color: #6b7280; font-size: 12px; margin: 2px 0 0; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; margin-top: 14px; }
        th { background: #4f46e5; color: #fff; padding: 6px 8px; border: 1px solid #4f46e5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
        .resumo { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
        .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; min-width: 120px; }
        .box .v { font-size: 18px; font-weight: 800; }
        .box .l { font-size: 10px; color: #6b7280; text-transform: uppercase; }
        .assin { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px; }
        .assin div { flex: 1; border-top: 1px solid #1f2937; padding-top: 6px; text-align: center; font-size: 11px; color: #374151; }
        @media print { body { margin: 12mm; } .noprint { display: none; } }
      </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4f46e5;padding-bottom:10px;">
        <div>
          <h1>Folha de Ponto</h1>
          <p class="sub">Grupo Unita · UnitaSystem</p>
        </div>
        <div style="text-align:right;">
          <p class="sub" style="font-size:13px;color:#1f2937;font-weight:700;">${escapeHtml(f.funcionario)}</p>
          <p class="sub">${escapeHtml(f.cargo || "—")}</p>
          <p class="sub" style="text-transform:capitalize;">${escapeHtml(nomeMes)}</p>
        </div>
      </div>
      <table>
        <thead><tr>
          <th style="text-align:left;">Dia</th>
          <th>Entrada</th>
          <th>Saída</th>
          <th>Marcações</th>
          <th>Previsto</th>
          <th>Trabalhado</th>
          <th>Saldo</th>
        </tr></thead>
        <tbody>${linhas.join("")}</tbody>
      </table>
      <div class="resumo">
        <div class="box"><div class="v">${fmtHoras(totalTrab)}</div><div class="l">Total trabalhado</div></div>
        <div class="box"><div class="v">${fmtHoras(totalPrev)}</div><div class="l">Total previsto</div></div>
        <div class="box"><div class="v" style="color:#16a34a;">${fmtHoras(totalExtra)}</div><div class="l">Horas extras</div></div>
        <div class="box"><div class="v" style="color:#dc2626;">${fmtHoras(totalDebito)}</div><div class="l">Débito de horas</div></div>
        <div class="box"><div class="v" style="color:#dc2626;">${faltas}</div><div class="l">Faltas</div></div>
        <div class="box"><div class="v" style="${saldoFinal < 0 ? "color:#dc2626;" : "color:#16a34a;"}">${fmtSaldo(saldoFinal)}</div><div class="l">Saldo do mês</div></div>
      </div>
      <div class="assin">
        <div>Assinatura do funcionário</div>
        <div>Responsável / RH</div>
      </div>
      <p class="sub" style="margin-top:20px;font-size:9px;color:#9ca3af;">Documento gerado em ${new Date().toLocaleString("pt-BR")} · Jornada base: 8h seg–sex, 4h sáb (44h/semana). Conferir antes de assinar.</p>
      <div class="noprint" style="margin-top:24px;text-align:center;">
        <button onclick="window.print()" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
      </div>
    </body></html>`);
    win.document.close();
  };

  const stats = useMemo(
    () => ({
      pessoas: porFunc.length,
      batidas: registros.length,
      horas: porFunc.reduce((s, f) => s + f.totalHoras, 0),
    }),
    [porFunc, registros]
  );

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
            <span style={{ filter: "saturate(0) brightness(2)" }}>⏰</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Ponto / Frequência
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Folha de ponto do mês com horários e localização
            </p>
          </div>
        </div>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "9px 14px",
            fontSize: 13,
            fontWeight: 600,
            color: "#1f2937",
            outline: "none",
          }}
        />
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Funcionários", value: String(stats.pessoas), cor: "#6366f1", icon: "👥" },
          { label: "Batidas no mês", value: String(stats.batidas), cor: "#0ea5e9", icon: "🕐" },
          { label: "Horas trabalhadas", value: fmtHoras(stats.horas), cor: "#16a34a", icon: "⏱️" },
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

      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando folha de ponto...</p>
        </div>
      ) : porFunc.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>🕐</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhuma batida de ponto neste mês.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {porFunc.map((f) => {
            const exp = aberto === f.funcionario;
            return (
              <div key={f.funcionario} style={{ ...card, overflow: "hidden" }}>
                {/* cabeçalho do funcionário */}
                <div
                  onClick={() => setAberto(exp ? null : f.funcionario)}
                  style={{
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {f.funcionario.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>
                        {f.funcionario}
                      </p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>
                        {f.cargo} · {f.dias.length} dia(s) com registro
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#16a34a", fontSize: 16, fontWeight: 800 }}>
                      {fmtHoras(f.totalHoras)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); gerarFolhaPonto(f); }}
                      title="Gerar folha de ponto pra assinatura (PDF)"
                      style={{
                        background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe",
                        borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      🖨️ Folha
                    </button>
                    <span style={{ color: "#9ca3af", fontSize: 14 }}>{exp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* dias do funcionário */}
                {exp && (
                  <div style={{ borderTop: "1px solid #f3f4f6", background: "#fafbfc" }}>
                    {f.dias.map((d) => (
                      <div key={d.dia} style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ color: "#374151", fontSize: 13, fontWeight: 700 }}>📅 {d.dia}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ color: "#16a34a", fontSize: 12, fontWeight: 700 }}>
                              {fmtHoras(d.horas)} trabalhadas
                            </span>
                            {podeEditar && (
                              <button onClick={() => abrirNovo(f.funcionario, f.cargo, d.dia)}
                                title="Adicionar batida neste dia"
                                style={{ background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                + batida
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {[...d.batidas]
                            .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
                            .map((b) => {
                              const cor = TIPO_COR[b.tipo] || "#6b7280";
                              const temGps = b.latitude != null && b.longitude != null;
                              const mapsUrl = temGps
                                ? `https://www.google.com/maps?q=${b.latitude},${b.longitude}`
                                : null;
                              return (
                                <div
                                  key={b.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    background: "#ffffff",
                                    border: `1px solid ${cor}30`,
                                    borderRadius: 10,
                                    padding: "6px 10px",
                                  }}
                                >
                                  <span
                                    style={{ width: 8, height: 8, borderRadius: "50%", background: cor }}
                                  />
                                  <div>
                                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                                      {horaFmt(b.data_hora)}
                                    </p>
                                    <p style={{ color: "#9ca3af", fontSize: 10, margin: 0 }}>{b.tipo}</p>
                                  </div>
                                  {mapsUrl ? (
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Ver no mapa onde bateu"
                                      style={{ textDecoration: "none", fontSize: 15, marginLeft: 2 }}
                                    >
                                      📍
                                    </a>
                                  ) : (
                                    <span title="Sem localização" style={{ fontSize: 13, opacity: 0.4 }}>
                                      🚫
                                    </span>
                                  )}
                                  {b.selfie_url ? (
                                    <img
                                      src={b.selfie_url}
                                      alt="selfie"
                                      onClick={() => setFotoModal({ url: b.selfie_url!, mapsUrl })}
                                      title="Ver a selfie da batida"
                                      style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 8,
                                        objectFit: "cover",
                                        cursor: "pointer",
                                        border: "2px solid #fff",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                                        marginLeft: 2,
                                      }}
                                    />
                                  ) : (
                                    <span title="Sem selfie" style={{ fontSize: 13, opacity: 0.4 }}>
                                      📷
                                    </span>
                                  )}
                                  {b.ajuste_manual && (
                                    <span title={`Ajuste manual${b.ajuste_por ? " por " + b.ajuste_por : ""}`}
                                      style={{ fontSize: 12, marginLeft: 2 }}>✏️</span>
                                  )}
                                  {podeEditar && (
                                    <>
                                      <button onClick={() => abrirEditar(b)} title="Editar horário/tipo"
                                        style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", marginLeft: 2 }}>✏️</button>
                                      <button onClick={() => excluirBatida(b)} title="Excluir batida"
                                        style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", color: "#dc2626" }}>🗑️</button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* LIGHTBOX DA SELFIE */}
      {/* ✏️ MODAL DE EDIÇÃO / NOVA BATIDA */}
      {editModal && (
        <div onClick={() => !salvandoEdit && setEditModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(3px)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...card, width: "100%", maxWidth: 420, padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#1f2937" }}>
              {editModal.modo === "editar" ? "✏️ Editar batida" : "➕ Adicionar batida"}
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: 12, color: "#6b7280" }}>
              {editModal.funcionario}{editModal.cargo ? ` · ${editModal.cargo}` : ""}
            </p>

            <label style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Tipo</label>
            <select value={editModal.tipo} onChange={(e) => setEditModal({ ...editModal, tipo: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 14, marginTop: 4 }}>
              {TIPOS_BATIDA.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Data</label>
                <input type="date" value={editModal.data} onChange={(e) => setEditModal({ ...editModal, data: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginTop: 4 }} />
              </div>
              <div style={{ width: 120 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Hora</label>
                <input type="time" value={editModal.hora} onChange={(e) => setEditModal({ ...editModal, hora: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginTop: 4 }} />
              </div>
            </div>

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 12px", marginBottom: 18 }}>
              <p style={{ margin: 0, fontSize: 11, color: "#92400e" }}>
                ⚠️ Esta batida será marcada como <b>ajuste manual</b> (registrado: {meuEmail || "você"}).
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEditModal(null)} disabled={salvandoEdit}
                style={{ background: "#fff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={salvarEdit} disabled={salvandoEdit}
                style={{ background: salvandoEdit ? "#a5b4fc" : COR, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 800, cursor: salvandoEdit ? "wait" : "pointer" }}>
                {salvandoEdit ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fotoModal && (
        <div
          onClick={() => setFotoModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.8)",
            backdropFilter: "blur(4px)",
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, maxWidth: 380, width: "100%", overflow: "hidden" }}
          >
            <img src={fotoModal.url} alt="selfie do ponto" style={{ width: "100%", display: "block" }} />
            <div
              style={{
                padding: 14,
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {fotoModal.mapsUrl ? (
                <a
                  href={fotoModal.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: COR_TEXTO, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
                >
                  📍 Ver no mapa onde bateu
                </a>
              ) : (
                <span style={{ color: "#9ca3af", fontSize: 13 }}>Sem localização</span>
              )}
              <button
                onClick={() => setFotoModal(null)}
                style={{
                  background: "#f3f4f6",
                  border: "none",
                  color: "#374151",
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}