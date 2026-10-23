import { z } from "zod";

export const MIN_DONATION_COP = 5_000;
export const MAX_DONATION_COP = 5_000_000;
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{10,40}$/);

export const donationInput = z.object({
  amountCOP: z.number().int().min(MIN_DONATION_COP, "El aporte mínimo es de $5.000 COP.").max(MAX_DONATION_COP, "El aporte máximo por transacción es de $5.000.000 COP."),
  goalId: idSchema.optional(),
  thanks: z.object({
    show: z.boolean(),
    name: z.string().trim().min(2).max(30).optional(),
    message: z.string().trim().max(140).optional(),
  }).default({ show: false }),
});
export const goalInput = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).default(""),
  targetCOP: z.number().int().min(10_000).max(1_000_000_000),
});
export const donationInfoInput = z.object({
  destination: z.string().trim().max(600),
  manualInstructions: z.string().trim().max(600).default(""),
});
export const manualDonationInput = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/).optional(),
  amountCOP: z.number().int().min(MIN_DONATION_COP).max(MAX_DONATION_COP),
  goalId: idSchema.optional(),
  reference: z.string().trim().min(3).max(60),
  note: z.string().trim().max(200).default(""),
  thanksName: z.string().trim().min(2).max(30).optional(),
});

export type DonationStatus = "pending" | "confirmed" | "failed" | "refunded";
export type Donation = {
  id: string; uid: string | null; amountCOP: number; status: DonationStatus; provider: "wompi" | "manual";
  reference: string; providerRef?: string; goalId?: string | null;
  thanks?: { show: boolean; name?: string; message?: string };
  createdAt: number; confirmedAt?: number; applied?: boolean; note?: string; recordedBy?: string; failReason?: string;
};
export type GoalRecord = { id: string; title: string; description: string; targetCOP: number; status: "open" | "closed"; createdAt: number; createdBy: string };
export type GoalView = Omit<GoalRecord, "createdBy" | "status"> & { status: "open" | "reached" | "closed"; raisedCOP: number; percent: number };

export const formatCOP = (n: number) => `$${n.toLocaleString("es-CO")} COP`;
