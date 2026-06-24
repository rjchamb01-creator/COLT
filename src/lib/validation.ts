import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Password is required." }),
});

export const SignupSchema = z.object({
  fullName: z.string().min(2, { error: "Name must be at least 2 characters." }).trim(),
  email: z.email({ error: "Enter a valid email." }).trim(),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { error: "Include at least one letter." })
    .regex(/[0-9]/, { error: "Include at least one number." }),
});

// Password reset — request a link, then set a new password. Email mirrors login;
// the new password reuses the signup strength rules.
export const ForgotPasswordSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim(),
});

export const ResetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { error: "Include at least one letter." })
    .regex(/[0-9]/, { error: "Include at least one number." }),
});

export const CreateClubSchema = z.object({
  name: z.string().min(2, { error: "Club name must be at least 2 characters." }).trim(),
});

export const JoinClubSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, { error: "Enter the club’s share code." })
    .max(12, { error: "That code looks too long." }),
});

export const CreateAthleteSchema = z.object({
  fullName: z
    .string()
    .min(2, { error: "Name must be at least 2 characters." })
    .trim(),
  sport: z.enum(["rugby_league", "basketball"], { error: "Pick a sport." }),
  ageGroup: z.enum(["u10", "u13", "u16"], { error: "Pick an age group." }),
});

// Squad Hub — club comms + training schedule (the free collective layer).
export const CreateAnnouncementSchema = z.object({
  title: z
    .string()
    .min(2, { error: "Give your post a title." })
    .max(120, { error: "Keep the title short and punchy." })
    .trim(),
  body: z
    .string()
    .min(2, { error: "Say something to the Squad." })
    .max(2000, { error: "That's a long one — trim it down." })
    .trim(),
});

// sport / age_group are optional cohort targeting; empty string from the
// <select> is coerced to undefined so it stores as NULL (= the whole Squad).
const optionalSport = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.enum(["rugby_league", "basketball"]).optional(),
);
const optionalAgeGroup = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.enum(["u10", "u13", "u16"]).optional(),
);

export const CreateEventSchema = z.object({
  title: z
    .string()
    .min(2, { error: "Name the session." })
    .max(120, { error: "Keep the title short and punchy." })
    .trim(),
  // <input type="datetime-local"> gives e.g. "2026-06-20T17:00" — accept any
  // string Date can parse, then hand it to Postgres as a timestamptz.
  startsAt: z
    .string()
    .min(1, { error: "Pick a date and time." })
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      error: "That date doesn't look right.",
    }),
  location: z
    .string()
    .max(160, { error: "Shorten the location." })
    .trim()
    .optional(),
  description: z
    .string()
    .max(2000, { error: "That's a lot of detail — trim it down." })
    .trim()
    .optional(),
  sport: optionalSport,
  ageGroup: optionalAgeGroup,
});

// Training Content Engine — authoring a drill (manual form or approving an AI
// draft). Used for both create and edit. video_url is optional (real clips are a
// sourcing workstream — null = clean, no dead link). skillIds tag the drill from
// the taxonomy; difficulty (1–3) is optional progression groundwork.
const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.url({ error: "Enter a valid URL (or leave it blank)." }).optional(),
);
const optionalDifficulty = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z
    .number()
    .int()
    .min(1, { error: "Difficulty is 1–3." })
    .max(3, { error: "Difficulty is 1–3." })
    .optional(),
);

// Drill sport: optional — empty = a cross-sport Strength & Conditioning drill
// (stored as sport null). All three sports stay valid here so the type lines up
// with the AI-draft pipeline; the authoring UI only OFFERS rugby league +
// basketball (soccer is hidden via the SPORTS list), so no new soccer is created.
const optionalDrillSport = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.enum(["rugby_league", "soccer", "basketball"]).optional(),
);

export const CreateDrillSchema = z.object({
  title: z
    .string()
    .min(2, { error: "Give the drill a title." })
    .max(120, { error: "Keep the title short and punchy." })
    .trim(),
  description: z
    .string()
    .min(10, { error: "Describe how to run the drill." })
    .max(2000, { error: "That's a lot of detail — trim it down." })
    .trim(),
  durationMin: z.coerce
    .number({ error: "Set a duration in minutes." })
    .int({ error: "Use whole minutes." })
    .min(1, { error: "Duration must be at least 1 minute." })
    .max(180, { error: "That's a long session — keep it under 180 minutes." }),
  sport: optionalDrillSport,
  ageGroup: z.enum(["u10", "u13", "u16"], { error: "Pick an age group." }),
  videoUrl: optionalUrl,
  difficulty: optionalDifficulty,
  // The <select multiple> / checkboxes give an array of skill UUIDs. Optional —
  // an untagged drill is allowed (tags can be added later).
  skillIds: z.array(z.uuid({ error: "Invalid skill." })).default([]),
});

export type CreateDrillInput = z.infer<typeof CreateDrillSchema>;

// AI Program Recommender (Tier 1) — the adult states a goal for one athlete and
// Claude sequences vetted library drills into a personalised program. Free-text
// goal, kept short (it's a focus, not an essay) and length-capped before it ever
// reaches the model.
export const ProgramGoalSchema = z.object({
  goal: z
    .string()
    .min(3, { error: "Tell us what to work on (e.g. “improve acceleration”)." })
    .max(200, { error: "Keep the goal short and focused." })
    .trim(),
});

export type ProgramGoalInput = z.infer<typeof ProgramGoalSchema>;

// Player account claim — a 13+ athlete signing up through an invite link. Same
// fields as signup, plus an explicit 13-or-older confirmation (the inviting
// adult is the real consent gate; under-13s stay on a parent account).
export const ClaimSignupSchema = z.object({
  fullName: z.string().min(2, { error: "Name must be at least 2 characters." }).trim(),
  email: z.email({ error: "Enter a valid email." }).trim(),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { error: "Include at least one letter." })
    .regex(/[0-9]/, { error: "Include at least one number." }),
  // Checkbox → "on" when ticked, null when not. Must be ticked.
  over13: z
    .literal("on", { error: "Players must be 13 or older to have their own account." }),
});

// Shared shape returned by form Server Actions to drive useActionState.
// `success` lets a form stay on the page and confirm (athlete creation) rather
// than redirect away (auth / onboarding).
export type AuthFormState =
  | {
      errors?: Record<string, string[]>;
      message?: string;
      success?: string;
    }
  | undefined;

// Flatten a ZodError into { field: messages[] } for form state.
export function flattenZodError(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
