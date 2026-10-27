// Runs on the machine that holds the project folder: background Blender for texture-uv prepare/apply.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { z } from "zod";
import { TEXTURE_UV_SCRIPT } from "./src/blender-scripts.ts";

export const hostContract = defineRpcContract({
  blender: {
    input: z
      .object({
        blenderPath: z.string(),
        script: z.literal("texture_uv"),
        args: z.array(z.string().max(2000)).max(32),
        cwd: z.string().optional(),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }),
  },
});

const BLENDER_TIMEOUT_MS = 12 * 60 * 1000;

function resolveBlenderBin(blenderPath: string): string {
  const trimmed = blenderPath.trim();
  if (trimmed && existsSync(trimmed)) return trimmed;
  return "blender";
}

function runBlender(
  blenderPath: string,
  scriptPath: string,
  args: string[],
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = resolveBlenderBin(blenderPath);
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
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `Blender not found (tried "${bin}"). Set blenderPath in Image Studio settings, e.g. /Applications/Blender.app/Contents/MacOS/Blender.`,
          ),
        );
        return;
      }
      reject(error);
    });
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
    blender: async ({ blenderPath, script, args, cwd }, context) => {
      if (script !== "texture_uv") throw new Error(`Unknown Blender script "${script}"`);
      const dir = await mkdtemp(join(tmpdir(), "image-studio-blender-"));
      const scriptPath = join(dir, "texture_uv.py");
      await writeFile(scriptPath, TEXTURE_UV_SCRIPT, "utf8");
      try {
        await runBlender(blenderPath, scriptPath, args, cwd, context.signal);
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
      return { ok: true as const };
    },
  },
});
