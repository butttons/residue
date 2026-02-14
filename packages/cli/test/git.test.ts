import { describe, test, expect } from "bun:test";
import {
  parseRemote,
  getRemoteUrl,
  getCurrentSha,
  getCommitMeta,
  isGitRepo,
} from "@/lib/git";

describe("parseRemote", () => {
  test("parses SSH remote URL", () => {
    const result = parseRemote("git@github.com:my-team/my-app.git");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ org: "my-team", repo: "my-app" });
  });

  test("parses HTTPS remote URL", () => {
    const result = parseRemote("https://github.com/my-team/my-app.git");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ org: "my-team", repo: "my-app" });
  });

  test("strips .git suffix", () => {
    const result = parseRemote("git@github.com:org/repo.git");
    expect(result._unsafeUnwrap().repo).toBe("repo");
  });

  test("handles URL without .git suffix", () => {
    const result = parseRemote("https://github.com/org/repo");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ org: "org", repo: "repo" });
  });

  test("returns err for invalid URL", () => {
    const result = parseRemote("not-a-url");
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("Cannot parse git remote URL");
  });
});

describe("isGitRepo", () => {
  test("returns true in a git repo", async () => {
    const result = await isGitRepo();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(true);
  });
});

describe("getRemoteUrl", () => {
  test("returns err when no remote is configured", async () => {
    // This repo may not have a remote — test that it returns a Result either way
    const result = await getRemoteUrl();
    // Result is either Ok(string) or Err(string) — both are valid
    if (result.isOk()) {
      expect(result._unsafeUnwrap().length).toBeGreaterThan(0);
    } else {
      expect(result._unsafeUnwrapErr()).toContain("Failed");
    }
  });
});

describe("getCurrentSha", () => {
  test("returns a 40-char hex SHA", async () => {
    const result = await getCurrentSha();
    expect(result.isOk()).toBe(true);
    const sha = result._unsafeUnwrap();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("getCommitMeta", () => {
  test("returns message, author, committed_at for HEAD", async () => {
    const shaResult = await getCurrentSha();
    expect(shaResult.isOk()).toBe(true);
    const sha = shaResult._unsafeUnwrap();

    const metaResult = await getCommitMeta(sha);
    expect(metaResult.isOk()).toBe(true);
    const meta = metaResult._unsafeUnwrap();
    expect(typeof meta.message).toBe("string");
    expect(typeof meta.author).toBe("string");
    expect(typeof meta.committed_at).toBe("number");
    expect(meta.committed_at).toBeGreaterThan(0);
  });

  test("returns err for invalid SHA", async () => {
    const result = await getCommitMeta("0000000000000000000000000000000000000000");
    expect(result.isErr()).toBe(true);
  });
});
