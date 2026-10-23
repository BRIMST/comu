import Link from "next/link";

export const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "[correo de contacto: configúralo en NEXT_PUBLIC_CONTACT_EMAIL]";
export const LEGAL_VERSION = "2026-10";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="card" style={{ maxWidth: 820, margin: "24px auto", lineHeight: 1.6 }}>
      <span className="eyebrow">DOCUMENTO LEGAL · VERSIÓN {LEGAL_VERSION}</span>
      <h1 className="title">{title}</h1>
      <div className="notice" role="note" style={{ margin: "14px 0" }}>
        <strong>Borrador pendiente de revisión legal.</strong> Este texto describe cómo funciona la plataforma, pero no sustituye el asesoramiento de un abogado. Antes de publicar el sitio, revísalo con un profesional (protección de datos personales, comercio electrónico y, si aplica, normativa de juegos y sorteos en Colombia).
      </div>
      {children}
      <p className="muted" style={{ fontSize: 12, marginTop: 22 }}>Ver también: <Link href="/terminos" style={{ textDecoration: "underline" }}>Términos de uso</Link> · <Link href="/privacidad" style={{ textDecoration: "underline" }}>Política de privacidad</Link></p>
    </article>
  );
}
export const H = ({ children }: { children: React.ReactNode }) => <h2 style={{ fontSize: 19, margin: "22px 0 6px" }}>{children}</h2>;
