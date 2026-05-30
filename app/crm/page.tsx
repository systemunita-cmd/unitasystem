"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════
// /crm — redirect pro dashboard (mesmo comportamento do Wolf)
// ═══════════════════════════════════════════════════════════════════════

export default function CRMPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/crm/dashboard"); }, [router]);
  return null;
}