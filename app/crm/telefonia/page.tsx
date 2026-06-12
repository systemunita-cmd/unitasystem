"use client";
import { useState } from "react";
import { useSoftphone } from "../../hooks/useSoftphone";

// ═══ 📞 TELEFONIA — discador (UnitaSystem) ═══
export default function Telefonia() {
  const { iniciarChamada, chamada, setAberto } = useSoftphone();
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const masc = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  };
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  const ligar = () => {
    const d = numero.replace(/\D/g, "");
    if (d.length < 10) { alert("Digite o número com DDD."); return; }
    iniciarChamada(numero, nome || undefined);
    setAberto(true);
  };
  const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14 } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 460 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 8px 20px rgba(13,148,136,0.25)" }}><span style={{ filter: "saturate(0) brightness(2)" }}>📞</span></div>
        <div><h1 style={{ margin: 0, color: "#1f2937", fontSize: 22, fontWeight: 800 }}>Telefonia</h1>
          <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}>Discador — a chamada abre no softphone flutuante</p></div>
      </div>
      <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <input placeholder="Nome (opcional)" value={nome} onChange={e => setNome(e.target.value)}
          style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
        <input placeholder="(62) 9 0000-0000" value={numero} onChange={e => setNumero(masc(e.target.value))}
          style={{ width: "100%", border: "1px solid #99f6e4", borderRadius: 12, padding: "14px 16px", fontSize: 20, fontWeight: 800, color: "#0d9488", textAlign: "center", boxSizing: "border-box", outline: "none", letterSpacing: 1 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {teclas.map(t => (
            <button key={t} onClick={() => setNumero(n => masc(n + t))}
              style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 0", fontSize: 18, fontWeight: 800, color: "#1f2937", cursor: "pointer" }}>{t}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setNumero(n => masc(n.replace(/\D/g, "").slice(0, -1)))}
            style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 0", fontSize: 14, fontWeight: 700, color: "#6b7280", cursor: "pointer" }}>⌫ Apagar</button>
          <button onClick={ligar} disabled={!!chamada}
            style={{ flex: 2, background: chamada ? "#9ca3af" : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", border: "none", borderRadius: 12, padding: "12px 0", fontSize: 15, fontWeight: 800, color: "#fff", cursor: chamada ? "not-allowed" : "pointer", boxShadow: "0 4px 14px rgba(22,163,74,0.35)" }}>
            {chamada ? "📞 Em chamada..." : "📞 Ligar"}
          </button>
        </div>
      </div>
    </div>
  );
}