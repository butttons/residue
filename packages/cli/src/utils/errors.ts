import type { ResultAsync } from "neverthrow";

type CommandFn = (...args: never[]) => ResultAsync<void, string>;

// Wraps a command that returns ResultAsync<void, string> with consistent error handling.
// On Err, prints to stderr and exits with the given code.
export function wrapCommand<T extends CommandFn>(
  fn: T,
  opts?: { exitCode?: number },
): (...args: Parameters<T>) => Promise<void> {
  const exitCode = opts?.exitCode ?? 1;
  return async (...args: Parameters<T>) => {
    const result = await fn(...args);
    if (result.isErr()) {
      console.error(`Error: ${result.error}`);
      process.exit(exitCode);
    }
  };
}

// Wraps a command that should never block git operations (hooks).
// Errors are printed as warnings and exit 0 so git proceeds.
export function wrapHookCommand<T extends CommandFn>(
  fn: T,
): (...args: Parameters<T>) => Promise<void> {
  return wrapCommand(fn, { exitCode: 0 });
}
