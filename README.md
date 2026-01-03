# cue-console

Cue Hub console (Next.js UI).

---

## The pitch (10 seconds)

A desktop and mobile UI for Claude Code, Cursor CLI and Codex.

Use it locally or remotely to view your active sessions and respond to collaboration requests from anywhere (desktop or mobile), with a consistent interface that works everywhere.

Think of it as an “all-in-one” collaboration console for your agents and CLIs.

---

## Quickstart (1 minute)

### Goal

Run the console and pair it with `cuemcp`.

### Step 1: Start `cuemcp`

Add and run the MCP server in your agent/runtime (see [`cue-mcp`](../cue-mcp) for client-specific MCP configuration).

### Step 2: Start `cue-console`

```bash
cue-console dev --port 3000
```

Open `http://localhost:3000`.

---

## Pairing with cuemcp

**Rule #1:** both sides must agree on the same DB location.

- `cuemcp` writes/polls: `~/.cue/cue.db`
- `cue-console` reads/writes: `~/.cue/cue.db`

## CLI

After installation, the `cue-console` command is available:

```bash
cue-console dev --port 3000
cue-console build
cue-console start --host 0.0.0.0 --port 3000
```

Supported commands:

- `dev`
- `build`
- `start`

Options:

- `--port <port>` (sets `PORT`)
- `--host <host>` (sets `HOSTNAME`)

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.
