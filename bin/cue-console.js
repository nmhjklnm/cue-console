#!/usr/bin/env node

let spawn;
let fs;
let path;

function printHelp() {
  process.stdout.write(
    `cue-console - Cue Hub console launcher\n\nUsage:\n  cue-console <dev|build|start> [--port <port>] [--host <host>]\n  cue-console -v|--version\n\nExamples:\n  cue-console -v\n  cue-console start --port 3000\n  cue-console start --host 0.0.0.0 --port 3000\n\nNotes:\n  - start will auto-build if needed (when .next is missing)\n`
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const out = {
    command: undefined,
    port: undefined,
    host: undefined,
    passthrough: [],
    showHelp: false,
    showVersion: false,
  };

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    out.showHelp = true;
    return out;
  }

  if (args[0] === "-v" || args[0] === "--version") {
    out.showVersion = true;
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
  if (!spawn || !fs || !path) {
    const childProcess = await import("node:child_process");
    spawn = childProcess.spawn;
    fs = await import("node:fs");
    path = await import("node:path");
  }

  const { command, port, host, passthrough, showHelp, showVersion } = parseArgs(process.argv.slice(2));

  if (showHelp) {
    printHelp();
    process.exit(0);
  }

  if (showVersion) {
    const pkgRoot = path.resolve(__dirname, "..");
    const pkgPath = path.join(pkgRoot, "package.json");
    try {
      const txt = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(txt);
      process.stdout.write(String(pkg?.version || "") + "\n");
      process.exit(0);
    } catch (err) {
      process.stderr.write(String(err?.stack || err) + "\n");
      process.exit(1);
    }
  }

  if (!command) {
    printHelp();
    process.exit(0);
  }

  if (!["dev", "build", "start"].includes(command)) {
    process.stderr.write(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  }

  const pkgRoot = path.resolve(__dirname, "..");
  const nextBin = path.join(pkgRoot, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    process.stderr.write(
      "Unable to resolve Next.js CLI. Please install dependencies first (e.g. npm install).\n"
    );
    process.exit(1);
  }

  const env = { ...process.env };
  if (port) env.PORT = String(port);
  if (host) env.HOSTNAME = String(host);

  const spawnNext = (subcmd) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [nextBin, subcmd, ...passthrough], {
        stdio: "inherit",
        env,
        cwd: pkgRoot,
      });
      child.on("exit", (code, signal) => {
        if (signal) return reject(Object.assign(new Error(`terminated: ${signal}`), { code, signal }));
        if (code && code !== 0) return reject(Object.assign(new Error(`exit ${code}`), { code }));
        resolve();
      });
    });

  if (command === "start") {
    const buildIdPath = path.join(pkgRoot, ".next", "BUILD_ID");
    if (!fs.existsSync(buildIdPath)) {
      await spawnNext("build");
    }
    await spawnNext("start");
    return;
  }

  await spawnNext(command);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
