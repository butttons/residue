import { isGitRepo } from "../lib/git";
import { mkdir, readFile, writeFile, chmod, stat } from "fs/promises";
import { join } from "path";

const POST_COMMIT_LINE = "residue capture";
const PRE_PUSH_LINE = "residue sync";

async function installHook(opts: {
  hooksDir: string;
  filename: string;
  line: string;
}): Promise<string> {
  const hookPath = join(opts.hooksDir, opts.filename);
  let isExisting = false;

  try {
    await stat(hookPath);
    isExisting = true;
  } catch {
    // file does not exist
  }

  if (isExisting) {
    const content = await readFile(hookPath, "utf-8");
    if (content.includes(opts.line)) {
      return `${opts.filename}: already installed`;
    }
    await writeFile(hookPath, content.trimEnd() + "\n" + opts.line + "\n");
    await chmod(hookPath, 0o755);
    return `${opts.filename}: appended`;
  }

  await writeFile(hookPath, `#!/bin/sh\n${opts.line}\n`);
  await chmod(hookPath, 0o755);
  return `${opts.filename}: created`;
}

export async function run(_args: string[]): Promise<void> {
  const isRepo = await isGitRepo();
  if (isRepo.isErr() || !isRepo._unsafeUnwrap()) {
    console.error("Error: not a git repository");
    process.exit(1);
  }

  // Find .git dir
  const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  const gitDir = (await new Response(proc.stdout).text()).trim();

  // Create ai-sessions dir
  const sessionsDir = join(gitDir, "ai-sessions");
  await mkdir(sessionsDir, { recursive: true });

  // Create hooks dir
  const hooksDir = join(gitDir, "hooks");
  await mkdir(hooksDir, { recursive: true });

  // Install hooks
  const postCommit = await installHook({
    hooksDir,
    filename: "post-commit",
    line: POST_COMMIT_LINE,
  });
  const prePush = await installHook({
    hooksDir,
    filename: "pre-push",
    line: PRE_PUSH_LINE,
  });

  console.log("Initialized residue in this repository.");
  console.log(`  ${postCommit}`);
  console.log(`  ${prePush}`);

  // Check for known adapters
  const home = process.env.HOME || process.env.USERPROFILE || "/";
  const hasClaudeDir = await Bun.file(join(home, ".claude")).exists().catch(() => false);
  if (hasClaudeDir) {
    console.log("\nDetected adapters: claude-code");
  } else {
    console.log("\nNo known adapters detected. Install an adapter to start capturing sessions.");
  }
}
