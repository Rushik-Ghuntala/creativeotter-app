# Claude / agent instructions

This project follows five strict conventions. Full versions live in `.cursor/rules/` and apply to
both Claude Code and Cursor.

## 1. Arrow functions (strict)

**Always use arrow function syntax** in TypeScript and React code. Do not introduce `function`
declarations for components, helpers, hooks, or utilities. See
[`.cursor/rules/arrow-functions.mdc`](.cursor/rules/arrow-functions.mdc).

| Use                                | Avoid                           |
| ---------------------------------- | ------------------------------- |
| `export const Foo = () => { ... }` | `export function Foo() { ... }` |
| `const Bar = (x: T) => ...`        | `function Bar(x: T) { ... }`    |

Exceptions are rare: only when arrow syntax is invalid (e.g. generators) or a minimal patch must
match existing `function` style in the same file.

## 2. Folder structure (strict)

Organize `src/` by responsibility (`app/`, `components/{ui,common,<feature>}`, `sections/`, `hooks/`,
`lib/`, `utils/`, `store/`, `providers/`, `constants/`, `data/`, `styles/`) and import via the `@/*`
alias. See [`.cursor/rules/folder-structure.mdc`](.cursor/rules/folder-structure.mdc).

## 3. Code optimization (strict)

Reuse existing utils/hooks/components before adding new ones, keep functions small, remove dead code,
and let Prettier own formatting (no semicolons, double quotes, single JSX attribute per line). See
[`.cursor/rules/code-optimization.mdc`](.cursor/rules/code-optimization.mdc).

## 4. One component per file (strict)

**Every `.tsx` file contains exactly one React component.** Never define multiple components in the
same file. If a component needs sub-components (cards, rows, illustrations, etc.), extract each into
its own file and import it. Group a section's sub-components in a subfolder next to it (e.g.
`sections/landing/features/`). Non-component code (types, constants, data, hooks, utility functions,
CVA/`cva` variant definitions) may live in its own non-`.tsx` file or co-located. See
[`.cursor/rules/folder-structure.mdc`](.cursor/rules/folder-structure.mdc).

| Use                                           | Avoid                                         |
| --------------------------------------------- | --------------------------------------------- |
| `Features.tsx` + `features/DashboardCard.tsx` | `Features.tsx` defining 14 components in-file |

## 5. Database migrations (strict)

Supabase Postgres, accessed through the Supabase JS client (`@supabase/supabase-js`) — the
server-only admin client lives in [`src/lib/supabase.ts`](src/lib/supabase.ts) and
authorization is handled in app code via Clerk (not Supabase RLS). **Every schema change ships as a
forward-only SQL migration** under `supabase/migrations/`, and **an already-applied migration is
never edited or deleted** — to change it, add a new migration that moves the state forward. Keep the
hand-maintained types in [`src/lib/database.types.ts`](src/lib/database.types.ts) in sync. See
[`.cursor/rules/database-migrations.mdc`](.cursor/rules/database-migrations.mdc).

| Use                                          | Avoid                                       |
| -------------------------------------------- | ------------------------------------------- |
| New `supabase/migrations/NNNN_add_field.sql` | Editing an applied migration `.sql` by hand |
| New forward migration to undo a change       | Deleting an applied migration to redo it    |
