// Wraps an async command handler with consistent error handling.
// Catches any thrown error, prints to stderr, and exits with the given code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- commander passes variadic args
export function wrapCommand<T extends (...args: any[]) => Promise<void>>(
  fn: T,
  opts?: { exitCode?: number },
): T {
  const exitCode = opts?.exitCode ?? 1;
  return (async (...args: unknown[]) => {
    try {
      await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(exitCode);
    }
  }) as T;
}

// Wraps a command that should never block git operations (hooks).
// Errors are printed as warnings and exit 0 so git proceeds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- commander passes variadic args
export function wrapHookCommand<T extends (...args: any[]) => Promise<void>>(
  fn: T,
): T {
  return wrapCommand(fn, { exitCode: 0 });
}
