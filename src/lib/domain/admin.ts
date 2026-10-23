import { z } from "zod";

export const REPORT_REASONS = ["spam", "abuso", "trampa", "contenido", "otro"] as const;
export const REPORT_LABEL: Record<(typeof REPORT_REASONS)[number], string> = {
  spam: "Spam o publicidad", abuso: "Acoso o abuso", trampa: "Trampas o manipulación de resultados", contenido: "Contenido inapropiado", otro: "Otro motivo",
};
export const reportInput = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().trim().max(300).default(""),
});
export const reasonText = z.string().trim().min(5, "Indica el motivo (mínimo 5 caracteres).").max(200);
export const badgeInput = z.object({
  name: z.string().trim().min(3).max(40),
  emoji: z.string().trim().min(1).max(8),
  desc: z.string().trim().min(3).max(120),
});
export const bonusInput = z.object({ amount: z.number().int().min(1).max(200), reason: reasonText });
export const moderationInput = z.object({
  clearBio: z.boolean().default(false), resetName: z.boolean().default(false), resetAvatar: z.boolean().default(false), reason: reasonText,
}).refine((m) => m.clearBio || m.resetName || m.resetAvatar, "Elige al menos un campo para moderar.");

export type ReportRecord = {
  id: string; reporterUid: string; targetUid: string; targetUsername: string; reason: (typeof REPORT_REASONS)[number]; detail: string;
  status: "open" | "dismissed" | "actioned"; createdAt: number; resolvedBy?: string; resolvedAt?: number; note?: string;
};
export type CustomBadge = { id: string; name: string; emoji: string; desc: string; createdAt: number };
