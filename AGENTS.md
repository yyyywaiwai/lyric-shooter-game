# Repository Guidelines

## Project Structure & Module Organization
- `index.html`, `index.tsx`, `App.tsx` – app entry and root component.
- `components/` – UI and game modules (e.g., `GameScreen.tsx`, `FileUploader.tsx`, `icons.tsx`).
- `services/` – pure logic (e.g., `lrcParser.ts`).
- `types.ts` – shared TypeScript interfaces and enums.
- `public/` – static assets; includes sample `test.m4a` and `test.lrc` for local QA.
- Config: `vite.config.ts`, `tsconfig.json`, `.github/workflows/deploy.yml`.
- Import alias: `@/*` → project root (see `tsconfig.json`, `vite.config.ts`). Example: `import { parseLRC } from '@/services/lrcParser'`.

## Build, Test, and Development Commands
- `npm run dev` – start Vite dev server.
- `npm run build` – production build (base path `/lyric-shooter-game/` for GitHub Pages).
- `npm run preview` – serve the built app locally.
- CI uses Node 18 and `npm ci` (see workflow). Build output goes to `dist/` (git‑ignored).

## Coding Style & Naming Conventions
- Language: TypeScript + React 19 (function components, hooks).
- Indentation: 2 spaces; use semicolons and single quotes.
- Files: components in `PascalCase.tsx`; services in `camelCase.ts`; shared types in `types.ts`.
- Constants: `SCREAMING_SNAKE_CASE` (see top of `GameScreen.tsx`).
- Styling: Tailwind via CDN; prefer utility classes over custom CSS.
- Imports: external → `@/…` → relative.

## Testing Guidelines
- No automated tests yet. Manual QA:
  - `npm run build && npm run preview`, open the served URL.
  - Use `public/test.m4a` + `public/test.lrc` in the uploader.
  - Verify audio sync, enemy spawn, controls, and end‑game stats.
- If adding tests: prefer Vitest + React Testing Library; name `*.test.ts(x)` under `tests/` or next to source.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`, `test:`).
- One focused change per PR; include summary, rationale, screenshots/GIFs for UI, and manual test steps.
- Ensure `npm run build` succeeds locally. Do not commit `dist/` or large media.
- Target `master`. Merges to `master` trigger Pages deploy (see workflow).

## Security & Configuration Tips
- Optional env: `GEMINI_API_KEY` (injected via `vite.define`). Set via environment or `.env*`; never commit secrets.
- Keep copyrighted media out of `public/` unless you own the rights.
