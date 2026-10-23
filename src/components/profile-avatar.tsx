import { CATALOG, DEFAULTS } from "@/lib/domain/progress";

/** Avatar con el marco equipado. Los estilos vienen del catálogo del servidor (no de texto del usuario). */
export function ProfileAvatar({ avatar, frame, size = 64 }: { avatar: string; frame?: string; size?: number }) {
  const css = CATALOG.find((i) => i.id === (frame ?? DEFAULTS.frame))?.css;
  return <div className="avatar big" aria-hidden style={{ width: size, height: size, fontSize: size * 0.5, boxShadow: css ?? undefined }}>{avatar}</div>;
}
export const themeCss = (id?: string) => CATALOG.find((i) => i.id === (id ?? DEFAULTS.theme))?.css;
export const titleOf = (id?: string) => CATALOG.find((i) => i.id === (id ?? DEFAULTS.title));
