#!/bin/sh
# Residue adapter for Claude Code
#
# This script is called by Claude Code hooks (SessionStart, SessionEnd).
# It reads JSON from stdin and calls the residue CLI to track sessions.
#
# Hook input (JSON on stdin):
#   session_id       - Claude Code session identifier
#   transcript_path  - path to the session JSONL file
#   cwd              - working directory
#   hook_event_name  - "SessionStart" or "SessionEnd"
#   source           - (SessionStart only) "startup", "resume", "clear", "compact"

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Extract fields using built-in tools (no jq dependency)
HOOK_EVENT=$(printf '%s' "$INPUT" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4)
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | grep -o '"transcript_path":"[^"]*"' | head -1 | cut -d'"' -f4)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
SOURCE=$(printf '%s' "$INPUT" | grep -o '"source":"[^"]*"' | head -1 | cut -d'"' -f4)

# Check if residue is available
if ! command -v residue >/dev/null 2>&1; then
  exit 0
fi

# Detect Claude Code version
CLAUDE_VERSION="unknown"
if command -v claude >/dev/null 2>&1; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
fi

# State file to persist the residue session ID across hooks.
# Claude Code's session_id is stable across SessionStart/SessionEnd,
# so we use it to key the state file.
STATE_DIR="${HOME}/.residue/claude-code"
mkdir -p "$STATE_DIR"
STATE_FILE="${STATE_DIR}/${SESSION_ID}.state"

case "$HOOK_EVENT" in
  SessionStart)
    # Skip resume/compact/clear -- only track new sessions
    if [ "$SOURCE" != "startup" ]; then
      # For resume, check if we already have a residue session
      if [ -f "$STATE_FILE" ]; then
        exit 0
      fi
    fi

    # Don't start a session if transcript_path is missing
    if [ -z "$TRANSCRIPT_PATH" ]; then
      exit 0
    fi

    # Call residue session-start; capture the session ID from stdout
    RESIDUE_ID=$(residue session start \
      --agent claude-code \
      --data "$TRANSCRIPT_PATH" \
      --agent-version "$CLAUDE_VERSION" 2>/dev/null) || true

    if [ -n "$RESIDUE_ID" ]; then
      printf '%s' "$RESIDUE_ID" > "$STATE_FILE"
    fi
    ;;

  SessionEnd)
    # Read the residue session ID from state
    if [ -f "$STATE_FILE" ]; then
      RESIDUE_ID=$(cat "$STATE_FILE")
      rm -f "$STATE_FILE"

      if [ -n "$RESIDUE_ID" ]; then
        residue session end --id "$RESIDUE_ID" 2>/dev/null || true
      fi
    fi
    ;;
esac

exit 0
