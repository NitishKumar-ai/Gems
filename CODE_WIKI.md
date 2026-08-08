# Gems Code Wiki

## 1) What this repository is

Gems is a hybrid project with two major parts:

- **Web app (Next.js 16)**: receives and renders published builder-journey artifacts.
- **Claude Code plugin**: captures session transcripts locally, extracts metrics, computes trends/achievements/rubric signals, and can publish the derived artifact to the web app.

Core principle: **raw transcripts stay local**; only derived metrics are published.

---

## 2) High-level architecture

### A. Plugin data pipeline

1. Claude Code fires `SessionEnd`.
2. `plugin/hooks/capture-session.mjs` reads stdin payload (`session_id`, `cwd`), finds transcript, extracts metrics, and appends to `~/.gems/sessions.jsonl`.
3. `/gems` (`plugin/commands/gems.mjs`) reads the local store via `plugin/lib/journey.mjs` and prints totals/trends/achievements.
4. `/gems publish` sends the computed journey JSON to `POST /api/publish`.

### B. Web app data pipeline

1. User signs in on `/dashboard` with GitHub via NextAuth.
2. User receives API key (stored on `User.apiKey`) and uses it in plugin publish calls.
3. `POST /api/publish` authenticates by API key, binds publish target to `User.githubLogin`, and upserts `Journey`.
4. Public profile route `/:username/:repo` loads `Journey.metrics` and renders totals, trends, achievements, and rubric cards.

---

## 3) Repository map

### Root

- `/home/runner/work/Gems/Gems/src` — Next.js app.
- `/home/runner/work/Gems/Gems/plugin` — Claude Code plugin implementation.
- `/home/runner/work/Gems/Gems/prisma` — Prisma schema + migrations.
- `/home/runner/work/Gems/Gems/tests/e2e` — Playwright E2E tests.
- `/home/runner/work/Gems/Gems/shared` — shared calibration artifacts (rubric bands).

### App (`src`)

- `src/app/page.tsx` — landing/import UX.
- `src/app/dashboard/page.tsx` — auth-gated dashboard, API key view, published journeys list.
- `src/app/[username]/[repo]/page.tsx` — public profile page.
- `src/app/api/import/route.ts` — validates GitHub URL and returns owner/repo.
- `src/app/api/publish/route.ts` — authenticated journey publish endpoint.
- `src/app/api/webhook/route.ts` — roast worker webhook (currently fail-closed without signing key).
- `src/auth.ts` — NextAuth config, Prisma adapter, GitHub handle binding.
- `src/components/Achievements.tsx` — achievements UI.
- `src/components/RubricCard.tsx` — rubric scoring/locked-state UI.
- `src/lib/prisma.ts` — Prisma client singleton.
- `src/lib/rubric.ts` — rubric signal types + score interpolation wrappers.
- `src/services/llm.ts` — roast service (mock-oriented).

### Plugin (`plugin`)

- `plugin/hooks/capture-session.mjs` — capture + extraction entrypoint.
- `plugin/lib/extract.mjs` — transcript → session metrics.
- `plugin/lib/metrics.mjs` — aggregation/windowing math primitives.
- `plugin/lib/journey.mjs` — store → totals, trend, achievements, rubric signal object.
- `plugin/lib/achievements.mjs` — badge evaluation logic.
- `plugin/lib/rubric.mjs` — rubric raw signal evaluation logic.
- `plugin/commands/gems.mjs` — CLI (`/gems`, `/gems publish`).
- `plugin/README.md` — plugin-specific behavior and invariants.

---

## 4) Data model (Prisma)

`prisma/schema.prisma` defines:

- **User**
  - identity (`id`, `email`, etc.)
  - `apiKey` (for plugin publishing)
  - `githubLogin` (canonical publish username)
- **Account / Session / VerificationToken**
  - NextAuth support tables.
- **Journey**
  - `userId`, `username`, `repo`, `metrics`, timestamps
  - unique key: `(username, repo)`

`Journey.metrics` stores serialized JSON artifact produced by plugin aggregation.

---

## 5) Key route and security behavior

### `POST /api/publish`

- Requires `Authorization: ******
- Rejects empty/missing/invalid key.
- Uses API-key owner’s `githubLogin` as authoritative profile username.
- Optional body `username` is compatibility-only and must match canonical username.
- Prevents cross-account overwrite on existing `(username, repo)`.
- Upserts journey artifact.

### `src/auth.ts` sign-in event

- On GitHub sign-in, updates `User.githubLogin` from OAuth profile login.
- Failures are logged but do not block sign-in.

### Plugin local safety

- Session ID validation via strict regex.
- Home/store/log permissions are owner-only (`0700` directory, `0600` files).
- Failure paths degrade gracefully and log diagnostics without breaking session end flow.
- Store dedupe guards against repeated `SessionEnd` duplicates.

---

## 6) Journey artifact shape (conceptual)

Produced by `buildJourney()` in `plugin/lib/journey.mjs`:

- schema/version metadata
- first/last session timestamps
- `totals` (sessions, edits, model usage, tool usage, rates, etc.)
- `trend` (windowed deltas when enough extracted sessions exist)
- `trend_unavailable_reason`
- `achievements` (earned/locked/progress metadata)
- `rubric` (raw per-dimension signals for app-side scoring)

Rates and deltas intentionally support `null` when denominator evidence is missing.

---

## 7) Frontend rendering logic

Profile page (`src/app/[username]/[repo]/page.tsx`) does:

- parse stored metrics JSON
- render top-level totals and rates with safe number guards
- render trend deltas only when present
- render achievements and rubric sections only when data exists
- revalidate every 60 seconds

Rubric scoring bands come from shared calibration (`shared/rubric-bands.mjs`) and are applied at render time.

---

## 8) Development and validation commands

From `package.json`:

- `bun run dev` — start app.
- `bun run build` — production build.
- `bun run lint` — ESLint.
- `bun run test:e2e` — Playwright E2E.
- `bun run test:plugin` — plugin unit tests.
- `bun run typecheck:plugin` — plugin TypeScript check.

---

## 9) Known feature state

- Profile, publish flow, achievements, and rubric are implemented.
- Roast/webhook flow exists but is intentionally constrained/fail-closed until full signature verification and activation path are complete.
- Plugin supports continuous local capture and derived-session aggregation.

---

## 10) Where to extend safely

- New journey metrics: plugin `extract.mjs` + aggregation in `metrics.mjs`/`journey.mjs`.
- New badge logic: `plugin/lib/achievements.mjs` and matching UI expectations in `src/components/Achievements.tsx`.
- New rubric dimension/scoring: plugin raw signal evaluation + shared band calibration + app rendering in `RubricCard.tsx`.
- New profile sections: add to profile page using artifact fields, preserving null-safe rendering.
