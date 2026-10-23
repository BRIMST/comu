import { z } from "zod";

export const CATEGORIES = ["challenges", "results", "levels", "badges", "polls", "events", "missions", "admin"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  challenges: "Invitaciones a retos", results: "Resultados de partidas", levels: "Subidas de nivel", badges: "Insignias",
  polls: "Nuevas encuestas", events: "Eventos de la comunidad", missions: "Misiones y logros", admin: "Avisos administrativos",
};

/** Envía una notificación personal. `key` evita duplicados (misma clave = una sola notificación). */
export type Notifier = (uid: string, key: string, category: Category, title: string, body: string, link?: string) => Promise<void>;

const httpsUrl = z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "El enlace debe empezar por https://");
const link = z.object({ label: z.string().trim().min(1).max(40), url: httpsUrl });

export const eventInput = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(400).default(""),
  kind: z.enum(["live", "evento"]),
  startsAt: z.number().int().positive(),
  endsAt: z.number().int().positive().optional(),
  links: z.array(link).max(4).default([]),
}).refine((e) => e.endsAt === undefined || e.endsAt > e.startsAt, "El fin debe ser posterior al inicio");

export const pollInput = z.object({
  question: z.string().trim().min(5).max(140),
  kind: z.enum(["general", "playlist", "juego"]),
  options: z.array(z.string().trim().min(1).max(60)).min(2).max(6),
  closesAt: z.number().int().positive(),
});
export const missionInput = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).default(""),
  target: z.number().int().min(1).max(1_000_000),
  unit: z.string().trim().min(1).max(20).default("pasos"),
});
export const announcementInput = z.object({ title: z.string().trim().min(3).max(80), body: z.string().trim().min(3).max(400) });
export const channelsInput = z.object({ links: z.array(link).max(6) });
export const proposalText = z.string().trim().min(10).max(200);

export type PollRecord = {
  id: string; question: string; kind: "general" | "playlist" | "juego"; options: { id: string; text: string }[];
  createdAt: number; closesAt: number; status: "open" | "closed"; createdBy: string;
  counts?: Record<string, number>; voters?: Record<string, string>;
};
export type EventRecord = {
  id: string; title: string; description: string; kind: "live" | "evento"; startsAt: number; endsAt?: number;
  links: { label: string; url: string }[]; status: "scheduled" | "cancelled"; createdAt: number; createdBy: string;
};
export type MissionRecord = {
  id: string; title: string; description: string; target: number; progress: number; unit: string;
  status: "open" | "completed" | "closed"; createdAt: number; createdBy: string;
};
