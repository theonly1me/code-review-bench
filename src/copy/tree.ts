import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "../process";

export async function treeWithoutWorkflows(options: {
  readonly checkout: string;
  readonly commit: string;
}): Promise<string> {
  const directory = mkdtempSync(path.join(os.tmpdir(), "review-index-"));
  const environment = { GIT_INDEX_FILE: path.join(directory, "index") };

  try {
    await git({ cwd: options.checkout, arguments: ["read-tree", options.commit], environment });
    await git({
      cwd: options.checkout,
      arguments: ["rm", "--cached", "-r", "-q", "-f", "--ignore-unmatch", ".github/workflows"],
      environment,
    });
    return await git({ cwd: options.checkout, arguments: ["write-tree"], environment });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
