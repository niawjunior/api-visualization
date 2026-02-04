# Nami

A desktop application for exploring, testing, and visualizing API endpoints in your projects.

## Features

- **Project-Scoped File Explorer** - Open any project folder and navigate files within that scope
- **API Endpoint Detection** - Automatically scans Python (FastAPI, Flask, Django) projects for API routes
- **Interactive API Console** - Test endpoints directly with request builder and response viewer
- **Visual Project Map** - Three view modes:
  - **Structure** - File/folder hierarchy visualization
  - **Dependencies** - Import/export relationship graph
  - **API** - Grouped endpoint explorer with testing
- **Recent Projects** - Quick access to recently opened projects
- **Drag & Drop** - Drop a folder onto the entry screen to open it

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Desktop**: Electron
- **Visualization**: React Flow
- **UI Components**: shadcn/ui

## Architecture

### How It Works

Nami uses a multi-layer architecture where the Electron main process handles file system operations and code analysis, while the React frontend provides the visualization and user interface.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nami Desktop App                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    React Frontend (Renderer)              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Entry     │  │   File      │  │  Visual Project │   │  │
│  │  │   Screen    │  │   Explorer  │  │  Map (3 modes)  │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  │                          │                    │           │  │
│  │                          ▼                    ▼           │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │              API Explorer + Console                 │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │ IPC                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 Electron Main Process                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │  Filesystem │  │  Dependency │  │   API Scanner   │   │  │
│  │  │  Operations │  │  Analyzer   │  │   (AST Parser)  │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Description |
|-----------|-------------|
| **MainInterface** | Manages app state (project open/close), renders entry screen or workspace |
| **FileExplorer** | Project-scoped file browser with search and navigation |
| **VisualProjectMap** | React Flow-based visualization with Structure/Deps/API modes |
| **ApiExplorer** | Displays detected endpoints grouped by file/router |
| **ApiConsole** | Interactive request builder for testing endpoints |

### API Detection Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Open       │───▶│   Detect     │───▶│   Parse AST  │───▶│   Extract    │
│   Project    │    │   Framework  │    │   (Python)   │    │   Endpoints  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                          │                                        │
                          ▼                                        ▼
                    ┌──────────────┐                        ┌──────────────┐
                    │  FastAPI /   │                        │   Route,     │
                    │  Flask /     │                        │   Method,    │
                    │  Django      │                        │   Params     │
                    └──────────────┘                        └──────────────┘
```

1. **Project Detection**: Scans for `requirements.txt`, `pyproject.toml`, `package.json`
2. **Framework Detection**: Identifies FastAPI, Flask, Django based on imports
3. **AST Parsing**: Uses Python AST to find route decorators (`@app.get`, `@router.post`, etc.)
4. **Endpoint Extraction**: Extracts path, HTTP method, parameters, and docstrings

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

This starts both the Next.js dev server and Electron in development mode.

### Build

```bash
# Build for production
npm run build

# Package as desktop app
npm run dist
```

## Usage

1. **Open Project**: Click "Open Project" or drag a folder onto the entry screen
2. **Explore Files**: Use the sidebar to navigate your project
3. **Switch Views**: Use the Structure/Deps/API toggle in the top-right
4. **Test APIs**: In API view, click endpoints to test them with the interactive console
5. **Close Project**: Click "Close Project" to return to the entry screen

## Supported Frameworks

- FastAPI
- Flask
- Django REST Framework
- Express.js (coming soon)

## License

MIT
