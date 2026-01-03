# cue-console

Cue Hub console launcher (Next.js UI).

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
