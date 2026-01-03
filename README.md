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

Add and run the MCP server in your agent/runtime (see [`cue-mcp`](https://github.com/nmhjklnm/cue-mcp) for client-specific MCP configuration).

### Step 2: Start `cue-console`

```bash
cue-console dev --port 3000
```

Open `http://localhost:3000`.

---

## Notes

- The current version can occasionally disconnect (for example, the agent replies directly without calling `cue()` at the end).
- If you get disconnected, type `cue` in the affected runtime to trigger auto-reconnect.

<details>
<summary>Human Agent Protocol (HAP) rules (required)</summary>

```text
Human Agent Protocol (HAP)

Hard rule: the agent must call the `cue` tool at the end of every response, no exceptions.
Always use the cue MCP to provide a final summary, ask a question, or request input.

Convention: when the user types `cue`, the user is accepting the HAP rules (supports disconnect + reconnect).

- First-time connection / no agent_id: call join() to obtain an agent_id, then call cue().
- Reconnect / existing agent_id (e.g. the cue call timed out but the chat continued):
  when the user types cue again, prefer calling cue() with the existing agent_id;
  only call join() again if you cannot determine the agent_id.

When to call

- On first message in a new chat (no history): call join().
- After completing any task: call cue().
- Before ending any response: call cue().

Forbidden behavior

- Using a self-chosen name without calling join() first.
- Ending a reply without calling cue().
- Replacing cue() with "let me know if you need anything else".
- Assuming there are no follow-ups.

Notes

If you are not sure whether to call it, call it.

Not calling cue() means the user cannot continue the interaction.
```

</details>

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
