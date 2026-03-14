# Duke

A desktop application for exploring, testing, and visualizing API endpoints in your projects.

## Features

- **Project-Scoped File Explorer** - Open any project folder and navigate files within that scope
- **API Endpoint Detection** - Automatically scans Python and Node.js projects for API routes
- **Interactive API Console** - Test endpoints directly with request builder, response viewer, and timing metrics
- **Visual Project Map** - Three view modes:
  - **Structure** - File/folder hierarchy visualization with interactive navigation
  - **Dependencies** - Import/export relationship graph
  - **API** - Grouped endpoint explorer with inline testing
- **File Preview** - Preview images (PNG, JPG, GIF, WebP, SVG) and text files directly in the app
- **Content Search** - Search across file contents within your project
- **Settings** - Configure theme (Light/Dark/System), default view mode, and preferred editor (VS Code, Cursor, Antigravity)
- **Collapsible Sidebar** - Toggle the sidebar to maximize workspace area
- **API Settings** - Configure base URL and bearer token for endpoint testing
- **Recent Projects** - Quick access to recently opened projects
- **Drag & Drop** - Drop a folder onto the entry screen to open it
- **Virtual Scrolling** - Smooth performance for large project file trees
- **Keyboard Shortcuts**:
  - `Cmd/Ctrl+B` - Toggle sidebar
  - `Cmd/Ctrl+P` - Focus search bar

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Desktop**: Electron
- **Visualization**: React Flow, Recharts
- **UI Components**: shadcn/ui, Radix UI
- **Animations**: Framer Motion
- **Performance**: React Virtuoso (virtual scrolling)
- **Icons**: Lucide React, Radix Icons
- **Desktop Utilities**: Electron Store, Chokidar (file watching)

## Architecture

### How It Works

Duke uses a multi-layer architecture where the Electron main process handles file system operations and code analysis, while the React frontend provides the visualization and user interface.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Duke Desktop App                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    React Frontend (Renderer)              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Entry     │  │   File      │  │  Visual Project │   │  │
│  │  │   Screen    │  │   Explorer  │  │  Map (3 modes)  │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  │         │                │                    │           │  │
│  │         ▼                ▼                    ▼           │  │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────────────┐  │  │
│  │  │  Settings  │  │   File      │  │  API Explorer +   │  │  │
│  │  │  Dialog    │  │   Preview   │  │  Console          │  │  │
│  │  └────────────┘  └─────────────┘  └───────────────────┘  │  │
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
| **FileExplorer** | Project-scoped file browser with search, content search, and virtual scrolling |
| **VisualProjectMap** | React Flow-based visualization with Structure/Deps/API modes |
| **ApiExplorer** | Displays detected endpoints grouped by file/router with search filtering |
| **ApiConsole** | Interactive request builder for testing endpoints with timing metrics |
| **SettingsDialog** | Theme, default view mode, and editor configuration |
| **FilePreview** | Image and text file preview panel |
| **Sidebar** | Collapsible navigation panel with file explorer and recent projects |

### API Detection Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Open       │───▶│   Detect     │───▶│   Parse AST  │───▶│   Extract    │
│   Project    │    │   Framework  │    │              │    │   Endpoints  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                          │                                        │
                          ▼                                        ▼
                    ┌──────────────┐                        ┌──────────────┐
                    │  Python:     │                        │   Route,     │
                    │  FastAPI /   │                        │   Method,    │
                    │  Flask /     │                        │   Params,    │
                    │  Django      │                        │   Body,      │
                    │              │                        │   Response   │
                    │  Node.js:    │                        │              │
                    │  Next.js /   │                        │              │
                    │  Express /   │                        │              │
                    │  Nest.js /   │                        │              │
                    │  Fastify     │                        │              │
                    └──────────────┘                        └──────────────┘
```

1. **Project Detection**: Scans for `requirements.txt`, `pyproject.toml`, `package.json`, `Pipfile`, `uv.lock`
2. **Framework Detection**: Identifies the framework based on imports and configuration files
3. **AST Parsing**: Parses source code to find route decorators and handler definitions
4. **Endpoint Extraction**: Extracts path, HTTP method, parameters, request body, and response info

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Development

```bash
# Install dependencies
npm install

# Run in development mode (Next.js + Electron)
npm run dev

# Run only the Next.js dev server
npm run dev:react

# Run only Electron in dev mode
npm run dev:electron
```

### Build

```bash
# Build for production
npm run build

# Package as desktop app (macOS DMG)
npm run dist

# Run the built app
npm run start

# Lint
npm run lint
```

## Usage

1. **Open Project** - Click "Open Project" or drag a folder onto the entry screen
2. **Explore Files** - Use the sidebar to browse and search your project files
3. **Preview Files** - Click a file to preview images or text content
4. **Search Content** - Use content search to find text across project files
5. **Switch Views** - Toggle between Structure, Dependencies, and API views
6. **Test APIs** - In API view, click endpoints to test them with the interactive console
7. **Configure API Settings** - Set base URL and authentication token for API testing
8. **Customize Settings** - Open settings to change theme, default view, or preferred editor
9. **Toggle Sidebar** - Press `Cmd/Ctrl+B` or click the toggle button to collapse/expand the sidebar

## Supported Frameworks

### Python
- FastAPI
- Flask
- Django REST Framework

### Node.js
- Next.js (API routes + App Router)
- Express.js
- Nest.js
- Fastify

## License

MIT
