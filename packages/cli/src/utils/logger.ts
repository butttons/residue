import createDebug from "debug";

const BASE_NAMESPACE = "residue";

type Loggable = string | Error;

function formatMessage(value: Loggable): string {
  if (typeof value === "string") return value;
  return value.message;
}

/**
 * Lightweight CLI logger wrapping the `debug` package.
 *
 * Levels:
 *   log.debug(msg)        -- only visible when DEBUG=residue:* or DEBUG=residue:<ns>
 *   log.info(msg)         -- always printed to stderr, plain message
 *   log.warn(msg | error) -- always printed to stderr, prefixed with "Warning:"
 *   log.error(msg | error)-- always printed to stderr, prefixed with "Error:"
 *
 * warn() and error() accept a string or an Error (including CliError).
 * When given an Error, the .message is extracted automatically.
 *
 * All output goes to stderr so stdout stays clean for machine-readable
 * data (e.g. session IDs piped back to agent adapters).
 */
function createLogger(namespace: string) {
  const debug = createDebug(`${BASE_NAMESPACE}:${namespace}`);

  return {
    /** Diagnostic message. Only visible when DEBUG includes this namespace. */
    debug,

    /** User-facing status message. Always printed to stderr. */
    info(message: string) {
      process.stderr.write(`${message}\n`);
    },

    /** Warning. Always printed to stderr. Accepts a string or Error. */
    warn(value: Loggable) {
      process.stderr.write(`Warning: ${formatMessage(value)}\n`);
    },

    /** Error. Always printed to stderr. Accepts a string or Error. */
    error(value: Loggable) {
      process.stderr.write(`Error: ${formatMessage(value)}\n`);
    },
  };
}

export { createLogger, type Loggable };
