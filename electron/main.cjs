const { app, BrowserWindow, utilityProcess, Menu, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");
const fs = require("fs");

let mainWindow;
let nextProcess;

const isDev = !app.isPackaged;
const PORT = 3000;

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function getWorkspaceDir() {
  if (isDev) return undefined; // use default ./workspace-example
  const dir = path.join(app.getPath("userData"), "workspace");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", () => resolve(findAvailablePort(startPort + 1)));
  });
}

function waitForServer(port, retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      const client = net.createConnection({ port }, () => {
        client.end();
        resolve();
      });
      client.on("error", () => {
        if (attempt >= retries) {
          reject(new Error("Next.js server did not start in time"));
          return;
        }
        setTimeout(() => check(attempt + 1), 500);
      });
    };
    check(0);
  });
}

async function startNextServer(port) {
  if (isDev) {
    nextProcess = spawn("npx", ["next", "dev", "-p", String(port)], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      env: { ...process.env, PORT: String(port), ...(getWorkspaceDir() && { WORKSPACE_DIR: getWorkspaceDir() }) },
    });
    nextProcess.stdout?.on("data", (data) => console.log(`[Next.js] ${data}`));
    nextProcess.stderr?.on("data", (data) => console.error(`[Next.js] ${data}`));
  } else {
    const serverPath = path.join(process.resourcesPath, "standalone", "server.js");
    // Use Electron's utilityProcess to run the server invisibly (no dock icon, no terminal)
    nextProcess = utilityProcess.fork(serverPath, [], {
      cwd: path.join(process.resourcesPath, "standalone"),
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: "localhost",
        NODE_ENV: "production",
        WORKSPACE_DIR: getWorkspaceDir(),
      },
      stdio: "pipe",
    });
    nextProcess.stdout?.on("data", (data) => console.log(`[Next.js] ${data}`));
    nextProcess.stderr?.on("data", (data) => console.error(`[Next.js] ${data}`));
  }
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    frame: process.platform === "darwin",
    trafficLightPosition: { x: 16, y: 13 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Override default menu to remap Cmd+W to close tab instead of window
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("close-tab");
            }
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Window control IPC for frameless windows (Windows/Linux)
  ipcMain.on("window-minimize", () => mainWindow?.minimize());
  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => mainWindow?.close());

  mainWindow.loadURL(`http://localhost:${port}`);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  const port = await findAvailablePort(PORT);
  await startNextServer(port);
  await waitForServer(port);
  createWindow(port);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(port);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});
