#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

function printHelp() {
  process.stdout.write(`cue-console - Cue Hub console launcher\n\nUsage:\n  cue-console <dev|build|start> [--port <port>] [--host <host>]\n\nExamples:\n  cue-console dev --port 3000\n  cue-console start --host 0.0.0.0 --port 3000\n`);
}

function parseArgs(argv) {
  const args = [...argv];
  const out = {
    command: undefined,
    port: undefined,
    host: undefined,
    passthrough: [],
    showHelp: false,
  };

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    out.showHelp = true;
    return out;
  }

  out.command = args.shift();

  while (args.length > 0) {
    const a = args.shift();
    if (a === "--port" || a === "-p") {
      out.port = args.shift();
      continue;
    }
    if (a === "--host" || a === "-H") {
      out.host = args.shift();
      continue;
    }
    out.passthrough.push(a);
  }

  return out;
}

async function main() {
  const { command, port, host, passthrough } = parseArgs(process.argv.slice(2));

  if (!command) {
    printHelp();
    process.exit(0);
  }

  if (!["dev", "build", "start"].includes(command)) {
    process.stderr.write(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  }

  let nextBin;
  try {
    nextBin = require.resolve("next/dist/bin/next");
  } catch (e) {
    process.stderr.write(
      "Unable to resolve Next.js CLI. Please install dependencies first (e.g. pnpm install).\n"
    );
    process.exit(1);
  }

  const env = { ...process.env };
  if (port) env.PORT = String(port);
  if (host) env.HOSTNAME = String(host);

  const pkgRoot = path.resolve(__dirname, "..");

  const child = spawn(process.execPath, [nextBin, command, ...passthrough], {
    stdio: "inherit",
    env,
    cwd: pkgRoot,
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
