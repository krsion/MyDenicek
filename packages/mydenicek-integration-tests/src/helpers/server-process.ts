/**
 * Server process helper - spawns the actual sync server and captures logs
 */

import { type ChildProcess,spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export interface ServerProcessContext {
    process: ChildProcess;
    port: number;
    url: string;
    persistencePath: string;
    getLogs: () => string[];
    getAllOutput: () => string;
}

function getNextPort(): number {
    // Use random port in range 20000-30000 to avoid conflicts
    return Math.floor(Math.random() * 10000) + 20000;
}

/**
 * Find the monorepo root by looking for package.json with workspaces
 */
function findMonorepoRoot(): string {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    let current = __dirname;
    while (current !== dirname(current)) {
        const pkgPath = join(current, "package.json");
        if (existsSync(pkgPath)) {
            // Check if this is the root (has apps/mydenicek-sync-server)
            if (existsSync(join(current, "apps", "mydenicek-sync-server"))) {
                return current;
            }
        }
        current = dirname(current);
    }
    throw new Error("Could not find monorepo root");
}

/**
 * Start the sync server as a child process
 */
export async function startServerProcess(): Promise<ServerProcessContext> {
    const port = getNextPort();
    const persistencePath = mkdtempSync(join(tmpdir(), "mydenicek-test-"));

    const logs: string[] = [];
    let allOutput = "";

    // Find monorepo root and construct server path
    const monorepoRoot = findMonorepoRoot();
    const serverPath = join(
        monorepoRoot,
        "apps",
        "mydenicek-sync-server",
        "src",
        "index.ts"
    );

    const serverProcess = spawn("npx", ["tsx", serverPath], {
        cwd: monorepoRoot,
        env: {
            ...process.env,
            PORT: String(port),
            PERSISTENCE_PATH: persistencePath,
        },
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
    });

    // Capture stdout
    serverProcess.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        allOutput += text;
        // Split into lines and add to logs array
        const lines = text.split("\n").filter((line) => line.trim());
        logs.push(...lines);
    });

    // Capture stderr
    serverProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        allOutput += text;
        // Also capture stderr in logs
        const lines = text.split("\n").filter((line) => line.trim());
        logs.push(...lines);
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Server did not start within 10 seconds"));
        }, 10000);

        const checkReady = () => {
            if (allOutput.includes("listening on")) {
                clearTimeout(timeout);
                resolve();
            } else {
                setTimeout(checkReady, 100);
            }
        };
        checkReady();

        serverProcess.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        serverProcess.on("exit", (code) => {
            if (code !== 0 && code !== null) {
                clearTimeout(timeout);
                reject(
                    new Error(
                        `Server exited with code ${code}. Output: ${allOutput}`
                    )
                );
            }
        });
    });

    return {
        process: serverProcess,
        port,
        url: `ws://127.0.0.1:${port}`,
        persistencePath,
        getLogs: () => [...logs],
        getAllOutput: () => allOutput,
    };
}

/**
 * Stop the server process and clean up
 */
export async function stopServerProcess(
    context: ServerProcessContext
): Promise<void> {
    // Kill the process
    context.process.kill("SIGTERM");

    // Wait for process to exit
    await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
            context.process.kill("SIGKILL");
            resolve();
        }, 5000);

        context.process.on("exit", () => {
            clearTimeout(timeout);
            resolve();
        });
    });

    // Clean up persistence directory
    try {
        rmSync(context.persistencePath, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }
}
