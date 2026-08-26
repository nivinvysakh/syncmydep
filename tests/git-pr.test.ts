import * as exec from "@actions/exec";
import {
  getPullRequestDetails,
  addCommentReaction,
  postIssueComment,
  closePullRequest,
  enablePullRequestAutoMerge,
  configureGitUser,
  checkoutBranch,
  commitAndPushChanges,
  createOrUpdatePullRequest,
} from "../src/git-pr";
import { OctokitClient } from "../src/types";

jest.mock("@actions/exec");

describe("git-pr helpers", () => {
  let mockOctokit: Partial<OctokitClient>;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              number: 42,
              title: "Fix something",
              head: {
                ref: "feature/fix-auth",
                repo: { full_name: "owner/repo" },
              },
              base: { ref: "main" },
              html_url: "https://github.com/owner/repo/pull/42",
            },
          }),
        },
        reactions: {
          createForIssueComment: jest.fn().mockResolvedValue({ data: {} }),
        },
        issues: {
          createComment: jest.fn().mockResolvedValue({ data: {} }),
        },
      } as unknown as OctokitClient["rest"],
    };
  });

  test("getPullRequestDetails retrieves branch and repo details", async () => {
    const details = await getPullRequestDetails(
      mockOctokit as OctokitClient,
      "owner",
      "repo",
      42,
    );

    expect(details.number).toBe(42);
    expect(details.headBranch).toBe("feature/fix-auth");
    expect(details.baseBranch).toBe("main");
    expect(details.headRepo).toBe("owner/repo");
    expect(details.isFork).toBe(false);
  });

  test("getPullRequestDetails detects fork PR correctly", async () => {
    const forkMockOctokit = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              number: 22,
              title: "remove package-lock.json",
              head: {
                ref: "main",
                repo: { full_name: "contributor/repo" },
              },
              base: { ref: "main" },
              html_url: "https://github.com/owner/repo/pull/22",
            },
          }),
        },
      },
    } as unknown as OctokitClient;

    const details = await getPullRequestDetails(
      forkMockOctokit,
      "owner",
      "repo",
      22,
    );

    expect(details.number).toBe(22);
    expect(details.headBranch).toBe("main");
    expect(details.headRepo).toBe("contributor/repo");
    expect(details.isFork).toBe(true);
  });

  test("checkoutBranch fetches PR head ref into dedicated working branch", async () => {
    const mockedExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
    mockedExec.mockResolvedValue(0);

    await checkoutBranch("/test/workspace", "main", 22);

    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "pull/22/head:syncmydep-pr-22", "--force"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["checkout", "-B", "syncmydep-pr-22", "refs/heads/syncmydep-pr-22"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
  });

  test("checkoutBranch fetches standard branch when no prNumber provided", async () => {
    const mockedExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
    mockedExec.mockResolvedValue(0);

    await checkoutBranch("/test/workspace", "feature/my-branch");

    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "+refs/heads/feature/my-branch:refs/remotes/origin/feature/my-branch", "--force"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["checkout", "feature/my-branch"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
  });

  test("commitAndPushChanges pushes to fork remote for fork PRs", async () => {
    const mockedExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
    mockedExec.mockResolvedValue(0);

    const result = await commitAndPushChanges({
      workspaceDir: "/test/workspace",
      branch: "main",
      commitMessage: "chore(deps): sync lockfile",
      files: ["package-lock.json"],
      isFork: true,
      headRepo: "contributor/repo",
      token: "ghp_fake_token_123",
    });

    expect(result).toBe(true);
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["add", "package-lock.json"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["commit", "-m", "chore(deps): sync lockfile"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["remote", "add", "pr-fork", "https://x-access-token:ghp_fake_token_123@github.com/contributor/repo.git"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["push", "pr-fork", "HEAD:main"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
  });

  test("commitAndPushChanges pushes to origin for standard branches", async () => {
    const mockedExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
    mockedExec.mockResolvedValue(0);

    const result = await commitAndPushChanges({
      workspaceDir: "/test/workspace",
      branch: "feature/test",
      commitMessage: "chore(deps): sync lockfile",
      files: ["package-lock.json"],
    });

    expect(result).toBe(true);
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:feature/test"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
  });

  test("addCommentReaction posts reaction to comment", async () => {
    await addCommentReaction(
      mockOctokit as OctokitClient,
      "owner",
      "repo",
      12345,
      "eyes",
    );

    expect(
      mockOctokit.rest?.reactions.createForIssueComment,
    ).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 12345,
      content: "eyes",
    });
  });

  test("postIssueComment posts message to PR", async () => {
    await postIssueComment(
      mockOctokit as OctokitClient,
      "owner",
      "repo",
      42,
      "Test comment",
    );

    expect(mockOctokit.rest?.issues.createComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 42,
      body: "Test comment",
    });
  });

  test("configureGitUser sets github-actions[bot] by default", async () => {
    const mockedExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
    mockedExec.mockResolvedValue(0);

    await configureGitUser("/test/workspace");

    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["config", "user.name", "github-actions[bot]"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
    expect(mockedExec).toHaveBeenCalledWith(
      "git",
      ["config", "user.email", "github-actions[bot]@users.noreply.github.com"],
      expect.objectContaining({ cwd: "/test/workspace" }),
    );
  });

  test("closePullRequest calls octokit pulls.update with state closed", async () => {
    const mockPullsUpdate = jest.fn().mockResolvedValue({ data: { state: "closed" } });
    const octokit = {
      rest: {
        pulls: {
          update: mockPullsUpdate,
        },
      },
    } as unknown as OctokitClient;

    await closePullRequest(octokit, "owner", "repo", 42);

    expect(mockPullsUpdate).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      pull_number: 42,
      state: "closed",
    });
  });

  test("enablePullRequestAutoMerge executes GraphQL mutation", async () => {
    const mockGraphql = jest.fn().mockResolvedValue({ data: {} });
    const octokit = {
      graphql: mockGraphql,
    } as unknown as OctokitClient;

    const result = await enablePullRequestAutoMerge(octokit, "PR_node_123", "squash");

    expect(result).toBe(true);
    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining("enablePullRequestAutoMerge"),
      expect.objectContaining({
        pullRequestId: "PR_node_123",
        mergeMethod: "SQUASH",
      }),
    );
  });

  test("createOrUpdatePullRequest creates draft PR when draft: true", async () => {
    const mockList = jest.fn().mockResolvedValue({ data: [] });
    const mockCreate = jest.fn().mockResolvedValue({
      data: {
        number: 55,
        html_url: "https://github.com/owner/repo/pull/55",
        node_id: "PR_55",
      },
    });

    const octokit = {
      rest: {
        pulls: {
          list: mockList,
          create: mockCreate,
        },
      },
    } as unknown as OctokitClient;

    const result = await createOrUpdatePullRequest({
      octokit,
      owner: "owner",
      repo: "repo",
      baseBranch: "main",
      headBranch: "syncmydep/test-branch",
      title: "chore: update deps",
      body: "markdown description",
      draft: true,
    });

    expect(result.number).toBe(55);
    expect(result.isNew).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        head: "syncmydep/test-branch",
        base: "main",
      }),
    );
  });
});
