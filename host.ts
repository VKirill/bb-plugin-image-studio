// Runs on the machine that holds the project folder: background Blender for texture-uv prepare/apply.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { z } from "zod";

export const hostContract = defineRpcContract({
  blender: {
    input: z
      .object({
        blenderPath: z.string().min(1),
        scriptPath: z.string().min(1),
        args: z.array(z.string().max(2000)).max(32),
        cwd: z.string().optional(),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }),
  },
});

const BLENDER_TIMEOUT_MS = 12 * 60 * 1000;

function runBlender(
  blenderPath: string,
  scriptPath: string,
  args: string[],
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!existsSync(scriptPath)) {
      reject(new Error(`Blender script not found at ${scriptPath}`));
      return;
    }
    const bin = existsSync(blenderPath) ? blenderPath : "blender";
    const child = spawn(bin, ["--factory-startup", "-b", "-P", scriptPath, "--", ...args], {
      cwd,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const tail = stderr.trim().split("\n").slice(-8).join("\n");
        reject(new Error(`Blender exited ${code ?? "?"}${tail ? `: ${tail}` : ""}`));
      }
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Blender timed out after ${BLENDER_TIMEOUT_MS / 1000}s`));
    }, BLENDER_TIMEOUT_MS);
    child.on("close", () => clearTimeout(timer));
  });
}

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    blender: async ({ blenderPath, scriptPath, args, cwd }, context) => {
      await runBlender(blenderPath, scriptPath, args, cwd, context.signal);
      return { ok: true as const };
    },
  },
});
