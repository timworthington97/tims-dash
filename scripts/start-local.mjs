import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envLocal = join(root, ".env.local");
const envExample = join(root, ".env.example");
const nextBinary = join(root, "node_modules", ".bin", "next");
const npmBinary = "/opt/homebrew/bin/npm";
const pidFile = join(root, ".lattice-wealth.pid");

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

  console.log(`Stopping previous Tim's Dash session (${storedPid})...`);
  process.kill(storedPid, "SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isProcessRunning(storedPid)) {
      removePidFile();
      return;
    }
    await wait(250);
  }

  process.kill(storedPid, "SIGKILL");
  removePidFile();
}

if (!existsSync(envLocal) && existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
}

if (!existsSync(nextBinary)) {
  console.error("This app still needs its first setup. Please run the launch script again after npm install finishes.");
  process.exit(1);
}

const port = process.env.PORT ?? "3000";
const url = `http://127.0.0.1:${port}`;

await stopExistingServer();

if (await checkPort("127.0.0.1", port)) {
  console.error("");
  console.error(`Port ${port} is already in use by another app.`);
  console.error("Please close that app first, then run Tim's Dash again.");
  process.exit(1);
}

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
  env: process.env,
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
    if (code === 0 || code === null) {
      resolve(undefined);
      return;
    }

    reject(new Error(`Local server exited with code ${code}.`));
  });
});
