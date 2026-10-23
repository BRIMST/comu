"use client";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { formatCOP } from "@/lib/domain/donations";

type State = { status: "pending" | "confirmed" | "failed" | "refunded"; amountCOP: number };

export default function Gracias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const txn = useSearchParams().get("id");
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [tries, setTries] = useState(0);

  // El servidor consulta la transacción al proveedor; aquí solo mostramos lo que confirme.
  useEffect(() => {
    let alive = true;
    api<State & { id: string }>(`/api/donations/${id}${txn ? `?txn=${encodeURIComponent(txn)}` : ""}`).then((d) => { if (alive) setState(d); }).catch((e: Error) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [id, txn, tries]);
  useEffect(() => {
    if (state?.status !== "pending" || tries >= 8) return;
    const t = setTimeout(() => setTries((n) => n + 1), 4000);
    return () => clearTimeout(t);
  }, [state, tries]);

  return (
    <div className="card" style={{ maxWidth: 620, margin: "30px auto", textAlign: "center" }} aria-live="polite">
      {err ? <><h1 className="title">No encontramos este aporte</h1><p>{err}</p></>
        : !state ? <p className="muted">Verificando tu aporte…</p>
        : state.status === "confirmed" ? <><div className="iconbox" style={{ margin: "0 auto 12px" }}>💜</div><h1 className="title">¡Gracias por tu apoyo!</h1><p>Confirmamos tu aporte de <strong>{formatCOP(state.amountCOP)}</strong>. Recuerda que donar no cambia nada en los juegos: gracias por ayudar a que el Refugio crezca.</p></>
        : state.status === "failed" ? <><h1 className="title">El pago no se completó</h1><p>No se hizo ningún cobro a este aporte. Puedes intentarlo de nuevo cuando quieras.</p></>
        : state.status === "refunded" ? <><h1 className="title">Aporte reembolsado</h1><p>Este aporte fue marcado como reembolsado.</p></>
        : <><h1 className="title">Estamos verificando tu pago</h1><p>Todavía no recibimos la confirmación del proveedor. Puede tardar unos minutos; esta página se actualiza sola. {tries >= 8 && "Si ya pagaste, tu aporte aparecerá en «Mis aportes» cuando se confirme."}</p></>}
      <div className="row" style={{ justifyContent: "center", marginTop: 16 }}><Link className="button primary" href="/apoyar">Volver a Apoyar</Link><Link className="button" href="/comunidad">Ir a la comunidad</Link></div>
    </div>
  );
}
