import * as exec from "@actions/exec";
import {
  getPullRequestDetails,
  addCommentReaction,
  postIssueComment,
  closePullRequest,
  configureGitUser,
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
});
