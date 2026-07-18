import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runCommand(command, args = [], options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: options.timeout ?? 10000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 4,
    cwd: options.cwd,
    env: options.env,
  });

  return {
    stdout: String(stdout || ""),
    stderr: String(stderr || ""),
  };
}