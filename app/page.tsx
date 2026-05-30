"use client";
import Link from "next/link";

export default function Home() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px",
      fontFamily: "Arial, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Brilho decorativo de fundo */}
      <div style={{
        position: "absolute",
        top: "-20%",
        right: "-10%",
        width: 600,
        height: 600,
        background: "radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-20%",
        left: "-10%",
        width: 500,
        height: 500,
        background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Conteúdo */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        {/* 🆕 Logo Unità Group — como já tem o nome embutido, substitui o título */}
        <img
          src="/logo-unita-group.png"
          alt="Unità Group"
          style={{
            width: "100%",
            maxWidth: 460,
            height: "auto",
            marginBottom: 28,
            objectFit: "contain",
            filter: "drop-shadow(0 8px 30px rgba(59,130,246,0.35))",
          }}
        />

        {/* Subtítulo */}
        <p style={{
          color: "#94a3b8",
          fontSize: 17,
          margin: "0 0 56px",
          fontWeight: 400,
          letterSpacing: 0.2,
        }}>
          Sistema de Atendimento e CRM
        </p>

        {/* Botão de entrada */}
        <Link
          href="/login"
          style={{
            background: "#2563eb",
            color: "white",
            padding: "16px 56px",
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 10px 30px rgba(37,99,235,0.45), 0 0 0 1px rgba(59,130,246,0.3)",
            display: "inline-block",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
        >
          Acessar Sistema →
        </Link>
      </div>

      {/* Footer discreto */}
      <p style={{
        color: "#475569",
        fontSize: 12,
        position: "absolute",
        bottom: 24,
        letterSpacing: 0.3,
      }}>
        © {new Date().getFullYear()} Unità Group · Sistema interno
      </p>
    </div>
  );
}