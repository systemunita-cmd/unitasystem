"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

const BUCKET = "financeiro-anexos";
const LIMITE_BYTES = 10 * 1024 * 1024;
const TIPOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
]);

type Anexo = {
  id: string;
  nome: string;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  storage_path: string;
  created_at: string;
  link?: string;
};

const tamanho = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const nomeSeguro = (nome: string) =>
  nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");

export function FinanceiroAnexos({ tituloId }: { tituloId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    const { data, error } = await supabase
      .from("fin_titulo_anexos")
      .select("id, nome, tipo_mime, tamanho_bytes, storage_path, created_at")
      .eq("titulo_id", tituloId)
      .order("created_at", { ascending: false });
    if (error) {
      setErro("Não foi possível carregar os anexos.");
      setCarregando(false);
      return;
    }
    const completos = await Promise.all(
      ((data || []) as Anexo[]).map(async (anexo) => {
        const { data: assinatura } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(anexo.storage_path, 60 * 10);
        return { ...anexo, link: assinatura?.signedUrl || "" };
      })
    );
    setAnexos(completos);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, [tituloId]);

  const enviar = async (arquivo?: File) => {
    if (!arquivo) return;
    setErro("");
    if (!TIPOS.has(arquivo.type)) {
      setErro("Formato não permitido. Use PDF, JPG, PNG, WEBP ou CSV.");
      return;
    }
    if (arquivo.size > LIMITE_BYTES) {
      setErro("O arquivo deve ter no máximo 10 MB.");
      return;
    }
    setEnviando(true);
    const caminho = `${tituloId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (uploadError) {
      setErro("Não foi possível enviar o documento.");
      setEnviando(false);
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const { error: metadataError } = await supabase.from("fin_titulo_anexos").insert({
      titulo_id: tituloId,
      nome: arquivo.name,
      tipo_mime: arquivo.type,
      tamanho_bytes: arquivo.size,
      storage_path: caminho,
      enviado_por: auth?.user?.email || null,
    });
    if (metadataError) {
      await supabase.storage.from(BUCKET).remove([caminho]);
      setErro("O arquivo foi enviado, mas não foi possível vinculá-lo ao lançamento.");
      setEnviando(false);
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
    setEnviando(false);
    carregar();
  };

  const remover = async (anexo: Anexo) => {
    if (!confirm(`Remover o anexo "${anexo.nome}"?`)) return;
    setErro("");
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([anexo.storage_path]);
    if (storageError) {
      setErro("Não foi possível remover o arquivo.");
      return;
    }
    const { error: metadataError } = await supabase.from("fin_titulo_anexos").delete().eq("id", anexo.id);
    if (metadataError) {
      setErro("O arquivo foi removido, mas o vínculo não pôde ser atualizado.");
      return;
    }
    carregar();
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, background: "linear-gradient(180deg,#ffffff,#f8fafc)", boxShadow: "0 6px 18px rgba(15,23,42,.045)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <p style={{ margin: 0, color: "#374151", fontSize: 12, fontWeight: 800 }}>Documentos anexados</p>
          <p style={{ margin: "2px 0 0", color: "#9ca3af", fontSize: 10 }}>Notas, boletos e comprovantes · até 10 MB</p>
        </div>
        <label style={{ background: "linear-gradient(180deg,#7fb095,#5b8f74)", color: "#fff", border: "1px solid #365f4b", borderRadius: 10, padding: "9px 13px", boxShadow: "0 2px 0 #294c3b,0 6px 12px rgba(91,143,116,.16)", fontSize: 11, fontWeight: 800, cursor: enviando ? "wait" : "pointer" }}>
          {enviando ? "Enviando..." : "＋ Anexar"}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.csv"
            disabled={enviando}
            onChange={(e) => enviar(e.target.files?.[0])}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {erro && <p style={{ color: "#dc2626", fontSize: 11, margin: "10px 0 0" }}>{erro}</p>}
      {carregando ? (
        <p style={{ color: "#9ca3af", fontSize: 11, margin: "10px 0 0" }}>Carregando documentos...</p>
      ) : anexos.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 11, margin: "10px 0 0" }}>Nenhum documento anexado.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {anexos.map((anexo) => (
            <div key={anexo.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 9px" }}>
              <div style={{ minWidth: 0 }}>
                <a href={anexo.link || "#"} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 11, fontWeight: 700, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                  📎 {anexo.nome}
                </a>
                <span style={{ color: "#9ca3af", fontSize: 9 }}>{tamanho(anexo.tamanho_bytes)}</span>
              </div>
              <button type="button" onClick={() => remover(anexo)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 7, padding: "4px 7px", fontSize: 10, cursor: "pointer" }}>
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
