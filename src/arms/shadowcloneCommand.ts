import { statSync } from "node:fs";
import path from "node:path";

export type ShadowcloneCommand = {
  readonly arguments: readonly string[];
  readonly checkout: string | null;
};

export function shadowcloneCommand(location: string | undefined): ShadowcloneCommand {
  if (location === undefined) {
    return { arguments: ["shadowclone"], checkout: null };
  }

  const resolved = path.resolve(location);

  return statSync(resolved).isDirectory()
    ? {
        arguments: ["bun", path.join(resolved, "packages", "cli", "src", "main.ts")],
        checkout: resolved,
      }
    : { arguments: [resolved], checkout: null };
}
