export type ProcessResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export async function runProcess(options: {
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly input?: string;
  readonly timeoutMilliseconds?: number;
}): Promise<ProcessResult> {
  const child = Bun.spawn({
    cmd: [...options.arguments],
    cwd: options.cwd,
    env: { ...options.environment },
    stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
    stdout: "pipe",
    stderr: "pipe",
    detached: process.platform !== "win32",
  });
  const terminate = () => {
    try {
      process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  const deadline = setTimeout(terminate, options.timeoutMilliseconds ?? 600_000);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { exitCode, stdout, stderr: stderr.slice(-20_000) };
  } finally {
    clearTimeout(deadline);
  }
}
