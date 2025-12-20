# Claudelet

Remote self-hosted Claude Code from anywhere.

Claudelet provides a web-based terminal interface for running Claude Code in isolated environments, with Google OAuth authentication and session management.

## Features

- **Web Terminal**: Full xterm.js terminal in your browser with Claude Code
- **Google OAuth**: Secure authentication with PKCE
- **Session Management**: Create, resume, and manage multiple terminal sessions
- **Docker Isolation**: Each session runs in a secured container
- **Credential Proxy**: Optionally proxy Claude API requests with your own key
- **Real-time**: WebSocket-based terminal streaming

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web Browser                          │
│                     xterm.js                            │
└──────────────────────────┬──────────────────────────────┘
                           │ WebSocket (wss://)
                           ▼
┌─────────────────────────────────────────────────────────┐
│            Terminal Server (Node.js + Fastify)          │
│            - Session management (SQLite)                │
│            - WebSocket + node-pty                       │
│            - Google OAuth with PKCE                     │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│             Per-User PTY Process / Container            │
│             - Claude Code CLI                           │
│             - Persistent workspace                      │
│             - ~/.claude/ configuration                  │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Development

1. Clone the repository:
```bash
git clone https://github.com/gaarutyunov/claudelet.git
cd claudelet
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Start development servers:
```bash
npm run dev
```

5. Open http://localhost:5173

### Production with Docker

1. Build the workspace image:
```bash
docker build -f docker/Dockerfile.workspace -t claudelet-workspace:latest .
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your production values
```

3. Start with Docker Compose:
```bash
docker compose up -d
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SESSION_SECRET` | Secret for session encryption (min 32 chars) | Required |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Optional |
| `ANTHROPIC_API_KEY` | For credential proxy feature | Optional |
| `WORKSPACE_MEMORY_LIMIT` | Container memory limit | `2g` |
| `WORKSPACE_CPU_LIMIT` | Container CPU limit | `1` |
| `MAX_SESSIONS_PER_USER` | Maximum sessions per user | `5` |

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
4. Copy Client ID and Secret to `.env`

## Project Structure

```
claudelet/
├── server/                 # Backend (Node.js + Fastify)
│   └── src/
│       ├── routes/         # API routes
│       ├── services/       # Business logic
│       ├── middleware/     # Auth middleware
│       └── db/             # SQLite database
├── web/                    # Frontend (React + Vite)
│   └── src/
│       ├── pages/          # React pages
│       ├── stores/         # Zustand stores
│       └── lib/            # Utilities
└── docker/                 # Docker configurations
```

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Sessions
- `GET /api/sessions` - List user sessions
- `POST /api/sessions` - Create new session
- `DELETE /api/sessions/:id` - Delete session

### Terminal
- `GET /api/terminal/:sessionId/ws` - WebSocket terminal connection
- `POST /api/terminal/:sessionId/kill` - Kill terminal process

## Security Considerations

- All containers run as non-root user (uid 1000)
- Containers have dropped capabilities (`--cap-drop=ALL`)
- Memory and CPU limits enforced
- Sessions isolated per user
- OAuth state protected with PKCE

## Development

```bash
# Run backend only
npm run dev:server

# Run frontend only
npm run dev:web

# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT
