
# 🔄 SyncMyDep

<img align="right" src="/images/drawing.svg" width="280" alt="Wonderful drawing"/>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/nivinvysakh/syncmydep/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/nivinvysakh/syncmydep?color=purple&label=latest%20release)](https://github.com/nivinvysakh/syncmydep/releases/latest)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Automated Dependency Sync](https://img.shields.io/badge/SyncMyDep-Action-purple.svg)](https://github.com/nivinvysakh/syncmydep)

> A high-performance, TypeScript-powered GitHub Action that detects package manifest and lockfile desynchronization or vulnerabilities, auto-fixes them across **npm**, **pnpm**, **yarn (v1 & berry)**, **bun**, and **deno** (including monorepos), and opens Pull Requests or commits fixes directly.

<br clear="right"/>

## ✨ Features

- 🔍 **Lockfile Synchronization**: Detects discrepancies when dependencies are added, updated, or removed in package manifests without updating the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`/`bun.lockb`, `deno.lock`).
- 🛡️ **Vulnerability Remediation**: Runs security audit fixes (`npm audit fix`, `pnpm audit --fix`, `yarn audit`, `bun pm audit`) to resolve known security vulnerabilities.
- 📦 **Modern Multi-Package Manager Support**: Seamless out-of-the-box support for:
  - **npm**
  - **pnpm**
  - **yarn** (Classic v1 and **Yarn Berry v2–v4**)
  - **bun** (`bun.lock` / `bun.lockb`)
  - **deno** (`deno.lock` / `deno.json`)
- 🏢 **Monorepo & Workspace Auto-Detection**: Automatically recognizes multi-package repositories powered by **Turborepo**, **pnpm workspaces**, **Lerna**, **Nx**, and standard **npm/yarn/bun workspaces**.
- 🚦 **Check-Only / CI Gating Mode**: Dry-run mode (`check-only: true`) that emits GitHub step annotations and exits with code `1` if desynchronization or security vulnerabilities are detected.
- ⚡ **Direct Push vs. PR Modes**: Optionally push fixes directly to active PR branches in place (`direct-push: true` or on `pull_request` triggers) without generating PR clutter.
- 💬 **On-Demand PR Comments (`syncdep`)**: Comment `syncdep` on any open Pull Request to trigger an instant dependency sync and push directly to that PR branch with `👀` & `🚀` status reactions.
- 🔒 **Repository Owner Authorization**: Built-in security that ensures only repository owners can trigger comment-based branch modifications.
- ⚙️ **Config File Support**: Configure custom commit conventions, branch names, and rules in `.syncmydep.yml`.
- 📊 **Detailed Dependency Diff Reports**: Markdown tables highlighting added (`✨`), upgraded (`🔄`), and removed (`🗑️`) packages with exact before-and-after versions.
- ⚡ **Zero-Dependency Fast Runner**: Standalone compiled bundle using `@vercel/ncc` with no runtime `npm install` overhead on runners.


## 🍃 Demo Video


https://github.com/user-attachments/assets/351c3dbd-88bd-42ca-87a4-6b8a25523ec9






---

## 🚀 Workflows

### 1. Automated Dependency Sync & PR (`.github/workflows/syncmydep.yml`)

Runs on schedule or push to automatically synchronize lockfiles, patch vulnerabilities, run safety checks, and open/update Pull Requests:

```yaml
name: Sync Dependencies & Fix Vulnerabilities

on:
  schedule:
    - cron: "0 8 * * 1" # Runs weekly every Monday at 08:00 UTC
  workflow_dispatch: # Allows manual one-click trigger
  push:
    paths:
      - "package.json"
      - ".syncmydep.yml"
      - "pnpm-workspace.yaml"
      - "bun.lock"
      - "deno.json"
    branches:
      - main

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  sync:
    name: Sync Dependencies & Open PR
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}

      - name: Run SyncMyDep
        uses: nivinvysakh/syncmydep@v1
        with:
          github-token: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
          # Optional settings (also configurable via .syncmydep.yml):
          # verify-lockfile: "true"
          # run-build: "npm run build"
          # auto-merge: "true"
```

---

### 2. On-Demand PR Comment Trigger (`.github/workflows/syncmydep-comment.yml`)

Comment on any open Pull Request to interact with SyncMyDep:
- **`syncdep`**: Instantly synchronizes and updates the PR branch in place.
- **`syncdep rebase`**: Recreates the branch fresh from upstream `main`, re-syncs, and force-pushes.
- **`syncdep close`**: Closes the PR and deletes the remote branch.

```yaml
name: SyncMyDep on PR Comment

on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  sync-pr-comment:
    name: Sync Dependencies on PR Comment
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}

      - name: Run SyncMyDep
        uses: nivinvysakh/syncmydep@v1
        with:
          github-token: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
          comment-trigger: "syncdep"
          require-owner: "true"
          sync-lockfile: "true"
          fix-audit: "true"
```

---

### 3. CI Gating / Check-Only Linter Mode

Use SyncMyDep strictly as a fast CI gating check on pull requests to ensure contributors never commit desynchronized lockfiles or unpatched vulnerabilities:

```yaml
name: CI Lockfile Verification

on:
  pull_request:
    branches: [main]

jobs:
  verify-lockfile:
    name: Verify Lockfile Synchronization
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: nivinvysakh/syncmydep@v1
        with:
          check-only: "true"
```

---

## ⚙️ Configuration File (`.syncmydep.yml`)

You can create a `.syncmydep.yml` (or `.syncmydeprc.yml`) in your repository root to configure default behavior across all workflows:

```yaml
package-manager: "auto"
sync-lockfile: true
fix-audit: true
audit-level: "moderate"
check-only: false
direct-push: false
pr-branch: "syncmydep/dependency-fix"
pr-title: "chore(deps): synchronize dependencies"
commit-message: "chore(deps): update lockfile"
pr-labels:
  - "dependencies"
  - "automated-pr"
comment-trigger: "syncdep"
require-owner: true
```

---

## ⚙️ Inputs Reference

| Input                 | Description                                                                          | Required | Default                                                     |
| :-------------------- | :----------------------------------------------------------------------------------- | :------: | :---------------------------------------------------------- |
| `github-token`        | GitHub token for git push and opening PRs (`${{ secrets.GH_PAT \|\| secrets.GITHUB_TOKEN }}`) |   Yes    | `${{ github.token }}`                                       |
| `package-manager`     | Package manager: `auto`, `npm`, `yarn`, `pnpm`, `bun`, `deno`                        |    No    | `auto`                                                      |
| `working-directory`   | Path to directory containing package manifest and lockfile                           |    No    | `.`                                                         |
| `config-file`         | Optional path to custom `.syncmydep.yml` config file                                 |    No    | `""`                                                        |
| `sync-lockfile`       | Synchronize lockfile with package specifications                                     |    No    | `true`                                                      |
| `fix-audit`           | Run security vulnerability auto-fix                                                  |    No    | `true`                                                      |
| `audit-level`         | Minimum vulnerability severity: `low`, `moderate`, `high`, `critical`                |    No    | `moderate`                                                  |
| `check-only`          | Dry-run CI gating mode that emits step annotations and exits with code `1` on desync |    No    | `false`                                                     |
| `direct-push`         | Commit and push directly to open PR branch on `pull_request` triggers                |    No    | `false`                                                     |
| `pr-branch`           | Branch name to push fixes to                                                         |    No    | `syncmydep/dependency-fix`                                  |
| `pr-title`            | Title for the generated Pull Request                                                 |    No    | `chore(deps): synchronize package.json and lockfile issues` |
| `commit-message`      | Commit message for the updates                                                       |    No    | `chore(deps): synchronize package.json and lockfile issues` |
| `pr-labels`           | Comma-separated labels to attach to the PR                                           |    No    | `dependencies, automated-pr`                                |
| `pr-assignees`        | Comma-separated usernames to assign                                                  |    No    | `""`                                                        |
| `pr-reviewers`        | Comma-separated usernames to request review from                                     |    No    | `""`                                                        |
| `comment-trigger`     | Keyword that triggers sync on a PR comment                                           |    No    | `syncdep`                                                   |
| `require-owner`       | Restrict comment trigger commands strictly to repository owners                      |    No    | `true`                                                      |
| `verify-lockfile`     | Run dry-run frozen installation check on generated lockfile                          |    No    | `true`                                                      |
| `run-build`           | Optional build smoke test command (e.g. `npm run build`) before opening PR           |    No    | `""`                                                        |
| `fail-on-build-error` | Abort and fail if build smoke test encounters an error                               |    No    | `false`                                                     |
| `auto-merge`          | Automatically enable auto-merge on the created Pull Request                          |    No    | `false`                                                     |
| `auto-merge-method`   | Auto-merge strategy: `squash`, `merge`, or `rebase`                                  |    No    | `squash`                                                    |
| `cache`               | Automatically restore and save package manager dependency caches                     |    No    | `true`                                                      |

---

## 📤 Outputs Reference

| Output                | Description                                                | Example                               |
| :-------------------- | :--------------------------------------------------------- | :------------------------------------ |
| `changes-detected`    | String boolean indicating if issues were fixed or detected | `'true'` / `'false'`                  |
| `pull-request-number` | The PR number created or updated                           | `42`                                  |
| `pull-request-url`    | Full URL to the Pull Request                               | `https://github.com/org/repo/pull/42` |
| `modified-files`      | Comma-separated list of modified files                     | `package.json,package-lock.json`      |

---

## 🛠️ Step-by-Step Setup Guide

### Step 1: Add Workflow File

Add `.github/workflows/syncmydep.yml` and/or `.github/workflows/syncmydep-comment.yml` to your repository.

### Step 2: Configure Repository Permissions

1. In your GitHub repository, navigate to **Settings** ➔ **Actions** ➔ **General**.
2. Under **Workflow permissions**:
   - ✅ Select **"Read and write permissions"**.
   - ✅ Check **"Allow GitHub Actions to create and approve pull requests"**.
3. Click **Save**.

### Step 3: (Recommended) Configure Personal Access Token (`GH_PAT`)

By default, GitHub's `GITHUB_TOKEN` is restricted from pushing branches that contain changes to `.github/workflows/*` files or triggering downstream CI workflows on created PRs. Using a Personal Access Token (PAT) overcomes these restrictions:

1. Go to GitHub **Settings** ➔ **Developer Settings** ➔ **Personal Access Tokens** ➔ **Tokens (classic)** (or Fine-grained tokens).
2. Generate a token with the following scopes:
   - `repo` (Full control of repository)
   - `workflow` (Update GitHub Action workflows)
3. In your target repository, navigate to **Settings** ➔ **Secrets and variables** ➔ **Actions**.
4. Click **New repository secret**, name it **`GH_PAT`**, paste your token, and save.

Your workflows configured with `token: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}` will automatically use `GH_PAT` when present and fall back to `GITHUB_TOKEN`.

---

## 📄 License

[MIT](https://github.com/nivinvysakh/syncmydep/blob/main/LICENSE)
