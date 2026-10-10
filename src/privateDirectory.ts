import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export async function requirePrivateDirectory(directory: string): Promise<string> {
  const resolved = await realpath(path.resolve(directory));

  for (let ancestor = resolved; ; ancestor = path.dirname(ancestor)) {
    if (await lstat(path.join(ancestor, ".git")).catch(() => null)) {
      throw new Error("Private evaluation storage cannot be inside a repository");
    }

    if (path.dirname(ancestor) === ancestor) {
      return resolved;
    }
  }
}
