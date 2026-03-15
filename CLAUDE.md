# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Duke is an Electron desktop app for exploring, testing, and visualizing API endpoints in projects. It detects APIs in Python (FastAPI, Flask, Django) and Next.js projects using AST parsing.

## Commands

```bash
npm run dev          # Start Next.js dev server + Electron concurrently
npm run dev:react    # Start only the Next.js dev server (port 3000)
npm run build        # Build Next.js static export + compile Electron TS
npm run dist         # Build + package as desktop app (electron-builder)
npm run start        # Launch built Electron app
npm run lint         # ESLint (next lint)
```

The `dev:electron` script waits for localhost:3000 before launching Electron. Electron TS files are compiled with `tsc` directly (not bundled), outputting to `dist/`.

## Architecture

### Two-process model (Electron)

- **Main process** (`electron/`): File system access, code analysis, IPC handlers. Compiled to `dist/` as CommonJS.
- **Renderer process** (`app/`): Next.js React app with static export (`output: 'export'`). Built to `out/`.

Communication between processes uses Electron IPC, bridged through `electron/preload.ts` which exposes `window.electron.*` APIs. Types for the bridge are declared in `global.d.ts`.

### IPC Handler Registration

IPC handlers are organized in `electron/ipc/`:
- `filesystem.ts` — file operations (read, list, watch, search, rename)
- `system.ts` — system operations (directory selection, editor detection)
- `analysis.ts` — code analysis (dependency graph, API endpoint detection, project detection)

All handlers are registered in `electron/main.ts` on app ready.

### Code Analysis Pipeline (`electron/tools/lib/`)

- `analyzers/` — Framework-specific API analyzers with a registry pattern (`registry.ts`). Supports:
  - `python/` — FastAPI/Flask/Django detection via Python AST (spawns `scanner/__main__.py`)
  - `nextjs/` — Next.js App Router route analysis
  - `openapi/` — OpenAPI/Swagger spec parsing
- `scanner.ts` — General file scanning utilities
- `project-detection.ts` — Detects project type from config files
- `analyze.ts` — Dependency graph analysis (imports/exports)

Python API scanning shells out to a Python script (`electron/tools/lib/analyzers/python/scanner/__main__.py`) that performs AST parsing. This script is bundled as an `extraResource` in production builds.

### Frontend (`app/`)

- `components/MainInterface.tsx` — Root workspace component, manages project open/close state
- `components/api/` — API explorer, endpoint cards, interactive console, dependency graph
- `components/visual/` — React Flow-based project visualization (structure, dependencies, API views)
- `components/file-browser/` — Project-scoped file explorer sidebar
- `components/settings/` — Settings dialog
- `components/ui/` — shadcn/ui primitives (New York style, Tailwind CSS variables)

### UI Framework

Uses shadcn/ui with the "new-york" style variant. Config in `components.json`. Path aliases: `@/components`, `@/lib/utils`, `@/components/ui`. Add new components via `npx shadcn@latest add <component>`.

### Path Aliases

TypeScript path alias `@/*` maps to the project root (configured in `tsconfig.json`).

## Key Patterns

- The app uses `electron-serve` for production static file serving and the Next.js dev server in development.
- `searchWorker.ts` runs file content search in a worker thread; it's unpacked from ASAR in production (`asarUnpack` in package.json).
- macOS-specific: hidden title bar with custom traffic light positioning.
- Theme support via `ThemeProvider.tsx` with localStorage persistence.
- API settings (base URL, headers) are managed through `ApiSettingsContext.tsx`.
