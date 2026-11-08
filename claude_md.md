# Project Guidelines & Context

## Quick Setup & Commands
- **Install:** `bun install`
- **Dev Server:** `bun run dev`
- **Build:** `bun run build`
- **Database Migration:** `bun run db:push` (Drizzle ORM)
- **Lint/Check:** `bun run check`

## Core Tech Stack
- **Frontend:** React 19, Vite, TailwindCSS
- **Backend:** Hono (TypeScript), Zod, OpenAPI
- **Database:** PostgreSQL with Drizzle ORM
- **Runtime & Tooling:** Bun (Monorepo setup)

## Code Standards & Architecture
- **Type Safety:** Strict TypeScript everywhere. Derive types from Zod schemas or Drizzle models.
- **Components:** Modular React components using Tailwind for styling. Avoid inline styles.
- **API Flow:** Define route schemas in Hono/Zod first; consume via strongly-typed fetchers on the frontend.
- **Error Handling:** Standardized API error responses `{ error: string, code: number }`.

## File Exclusion & Context Rules
- **Ignore Directory Trees:** `node_modules/`, `.git/`, `.bun/`, `dist/`, `.next/`, `build/`, `coverage/`
- **Ignore File Types:** `*.lock`, `bun.lockb`, `package-lock.json`, `*.log`, `*.svg`, `*.min.*`
- **Ignore Secrets:** Never read or display `.env` or `.env.local` contents.

## Response Rules for Claude
- **Token Efficiency:** Keep explanations to 1-2 sentences max. Output concise, working code immediately.
- **No Boilerplate:** Do not re-write untouched imports or unchanged outer logic.
- **Edits Only:** When modifying existing files, focus strictly on the necessary changes/diffs.