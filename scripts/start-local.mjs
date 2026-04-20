import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import http from "node:http";
import net from "node:net";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envLocal = join(root, ".env.local");
const envExample = join(root, ".env.example");
const nextBinary = join(root, "node_modules", ".bin", "next");
const npmBinary = "/opt/homebrew/bin/npm";
const pidFile = join(root, ".lattice-wealth.pid");
const fallbackPorts = ["3000", "3001", "3002"];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => resolve(false));
    socket.setTimeout(1200, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, attempts = 90) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await checkUrl(url)) {
      return true;
    }
    await wait(1000);
  }

  return false;
}

function openBrowser(url) {
  spawn("open", [url], {
    stdio: "ignore",
    detached: true,
  }).unref();
}

async function runBuild() {
  await new Promise((resolve, reject) => {
    const buildProcess = spawn(npmBinary, ["run", "build"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });

    buildProcess.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Build failed with code ${code}.`));
    });
  });
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function removePidFile() {
  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}

function getListeningPid(port) {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pid = Number.parseInt(output.split(/\s+/)[0] ?? "", 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function getProcessCommand(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function isSafeToStopProcess(pid) {
  const command = getProcessCommand(pid).toLowerCase();
  if (!command) {
    return false;
  }

  return (
    command.includes(root.toLowerCase()) ||
    ((command.includes("next") || command.includes("node")) && command.includes("tim") && command.includes("dash"))
  );
}

async function stopProcess(pid, reason) {
  console.log(`${reason} (${pid})...`);
  process.kill(pid, "SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await wait(250);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return false;
  }

  return !isProcessRunning(pid);
}

async function stopExistingServer() {
  if (!existsSync(pidFile)) {
    return;
  }

  const storedPid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
  if (!Number.isFinite(storedPid) || storedPid <= 0) {
    removePidFile();
    return;
  }

  if (!isProcessRunning(storedPid)) {
    removePidFile();
    return;
  }

  await stopProcess(storedPid, "Stopping previous Tim's Dash session");
  removePidFile();
}

async function choosePort(preferredPort) {
  const preferredPid = getListeningPid(preferredPort);
  if (!preferredPid) {
    return preferredPort;
  }

  if (isSafeToStopProcess(preferredPid)) {
    const stopped = await stopProcess(preferredPid, `Stopping old local Node/Next server on port ${preferredPort}`);
    if (stopped && !(await checkPort("127.0.0.1", preferredPort))) {
      return preferredPort;
    }
  }

  for (const candidate of fallbackPorts) {
    if (candidate === preferredPort) {
      continue;
    }

    if (!(await checkPort("127.0.0.1", candidate))) {
      console.log(`Port ${preferredPort} is busy, so Tim's Dash will use port ${candidate} instead.`);
      return candidate;
    }
  }

  throw new Error(`Ports ${fallbackPorts.join(", ")} are already busy. Please close one of those apps and try again.`);
}

if (!existsSync(envLocal) && existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
}

if (!existsSync(nextBinary)) {
  console.error("This app still needs its first setup. Please run the launch script again after npm install finishes.");
  process.exit(1);
}

const preferredPort = process.env.PORT ?? "3000";

await stopExistingServer();
const port = await choosePort(preferredPort);
const url = `http://127.0.0.1:${port}`;

console.log("");
console.log("Starting Tim's Dash...");
console.log("Building the app for a smoother local launch...");
console.log("Keep this window open while you use the app.");
console.log("");

await runBuild();

console.log("");
console.log("Opening Tim's Dash...");
console.log("A browser tab will open automatically once the app is ready.");
console.log("");

const devServer = spawn(nextBinary, ["start", "--hostname", "127.0.0.1", "--port", port], {
  cwd: root,
  env: {
    ...process.env,
    PORT: port,
  },
  stdio: "inherit",
});

writeFileSync(pidFile, `${devServer.pid ?? ""}\n`, "utf8");

const stopServer = () => {
  if (!devServer.killed) {
    devServer.kill("SIGTERM");
  }
  removePidFile();
};

process.on("SIGINT", stopServer);
process.on("SIGTERM", stopServer);

const ready = await waitForServer(url);

if (!ready) {
  console.error("");
  console.error("The app did not finish starting in time.");
  console.error("If the terminal shows an error, fix that first and then run the launcher again.");
  stopServer();
  process.exit(1);
}

openBrowser(url);
console.log("");
console.log(`Tim's Dash is ready at ${url}`);
console.log("Close this window when you want to stop the app.");
console.log("");

await new Promise((resolve, reject) => {
  devServer.on("exit", (code) => {
    removePidFile();
    if (code === 0 || code === null || code === 130) {
      resolve(undefined);
      return;
    }

    reject(new Error(`Local server exited with code ${code}.`));
  });
});
