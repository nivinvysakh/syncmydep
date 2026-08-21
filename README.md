# 🔄 SyncMyDep

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](file:///Users/nivin/Desktop/Dev/Syncmydep/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![Automated Dependency Sync](https://img.shields.io/badge/SyncMyDep-Action-purple.svg)](https://github.com)

> A JavaScript-powered GitHub Action that detects `package.json` and lockfile desynchronization or vulnerabilities, automatically resolves them, and creates a Pull Request.

---

## ✨ Features

- 🔍 **Lockfile Synchronization**: Detects discrepancies when dependencies are added, updated, or removed in `package.json` without updating the lockfile (`package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`).
- 🛡️ **Vulnerability Remediation**: Runs security audit fixes (`npm audit fix` / `pnpm audit --fix`) to resolve known security vulnerabilities.
- 🤖 **Automated Pull Requests**: Automatically creates and updates branches, commits changed files, and opens or updates a Pull Request with a clear changelog and diff report.
- 📦 **Multi-Package Manager Support**: Out-of-the-box support for `npm`, `yarn`, and `pnpm`.
- ⚡ **Standalone & Fast**: Built with `@vercel/ncc`, bundling all dependencies into `dist/index.js` for instant execution without container setup overhead.

---

## 🚀 Quickstart Workflow

Create a workflow file in your repository at `.github/workflows/syncmydep.yml`:

```yaml
name: Dependency Sync & Audit

on:
  schedule:
    - cron: '0 8 * * 1' # Runs every Monday at 08:00 UTC
  workflow_dispatch:     # Allows manual trigger from GitHub UI
  push:
    paths:
      - 'package.json'
    branches:
      - main

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run SyncMyDep
        uses: ./ # Or your-username/syncmydep@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          package-manager: 'auto'
          sync-lockfile: 'true'
          fix-audit: 'true'
          audit-level: 'moderate'
          pr-branch: 'syncmydep/dependency-fix'
          pr-title: 'chore(deps): synchronize package.json and lockfile'
          pr-labels: 'dependencies, automated-pr'
```

---

## ⚙️ Inputs Reference

| Input | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `github-token` | GitHub token for git push and opening PRs (`GITHUB_TOKEN` or PAT) | No | `${{ github.token }}` |
| `package-manager` | Package manager: `auto`, `npm`, `yarn`, `pnpm` | No | `auto` |
| `working-directory` | Path to directory containing `package.json` | No | `.` |
| `sync-lockfile` | Synchronize lockfile with `package.json` | No | `true` |
| `fix-audit` | Run security vulnerability auto-fix | No | `true` |
| `audit-level` | Minimum vulnerability severity: `low`, `moderate`, `high`, `critical` | No | `moderate` |
| `pr-branch` | Branch name to push fixes to | No | `syncmydep/dependency-fix` |
| `pr-title` | Title for the generated Pull Request | No | `chore(deps): synchronize package.json and lockfile issues` |
| `commit-message` | Commit message for the updates | No | `chore(deps): synchronize package.json and lockfile issues` |
| `pr-labels` | Comma-separated labels to attach to the PR | No | `dependencies, automated-pr` |
| `pr-assignees` | Comma-separated usernames to assign | No | `""` |
| `pr-reviewers` | Comma-separated usernames to request review from | No | `""` |

---

## 📤 Outputs Reference

| Output | Description | Example |
| :--- | :--- | :--- |
| `changes-detected` | String boolean indicating if issues were fixed | `'true'` / `'false'` |
| `pull-request-number` | The PR number created or updated | `42` |
| `pull-request-url` | Full URL to the Pull Request | `https://github.com/org/repo/pull/42` |
| `modified-files` | Comma-separated list of modified files | `package.json,package-lock.json` |

---

---

## 🛠️ Step-by-Step Setup Guide

Follow these steps to enable SyncMyDep in any GitHub repository:

### Step 1: Add the Workflow File
Create `.github/workflows/syncmydep.yml` in your target repository with the workflow above.

### Step 2: Configure GitHub Repository Permissions *(Crucial)*

By default, GitHub restricts automated workflows from creating branches and Pull Requests. You must enable these permissions in your repository settings:

1. In your GitHub repository, navigate to **Settings** (top navigation tab).
2. In the left sidebar under **Code and automation**, click **Actions** ➔ **General**.
3. Scroll down to the **Workflow permissions** section:
   - ✅ Select **"Read and write permissions"** *(Grants `GITHUB_TOKEN` permission to checkout, commit, and push the fix branch)*.
   - ✅ Check the box for **"Allow GitHub Actions to create and approve pull requests"** *(Allows SyncMyDep to open the Pull Request)*.
4. Click **Save**.

```
Repository Settings
 └── Actions
      └── General
           └── Workflow permissions
                ├── ◉ Read and write permissions
                └── ☑ Allow GitHub Actions to create and approve pull requests
```

> [!IMPORTANT]
> If your repository belongs to a **GitHub Organization**, organization-wide policies might override these settings. An organization owner may need to allow `Read and write permissions` under **Organization Settings ➔ Actions ➔ General ➔ Workflow permissions**.

---

### Step 3: (Optional) Using a Personal Access Token (PAT)

By default, Pull Requests created by `GITHUB_TOKEN` do not trigger other GitHub Action workflows (such as downstream CI unit tests).

If you want the Pull Request created by SyncMyDep to trigger your project's CI test suite:
1. Create a fine-grained Personal Access Token (or classic PAT with `repo` scope).
2. Add it to your repository as a Secret (**Settings ➔ Secrets and variables ➔ Actions ➔ New repository secret**) with name `SYNC_TOKEN`.
3. In `.github/workflows/syncmydep.yml`, pass `github-token: ${{ secrets.SYNC_TOKEN }}`.

---

### Step 4: Testing & Running the Action

- **Manual Trigger**: Navigate to the **Actions** tab in your repository, select **Dependency Sync & Audit**, click **Run workflow**, and choose the `main` branch.
- **Automated Runs**: SyncMyDep runs automatically on your configured cron schedule (e.g. every Monday) or whenever `package.json` is pushed.

---

## 🔧 Troubleshooting Common Errors

| Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `Resource not accessible by integration (Status: 403)` | `GITHUB_TOKEN` lacks write permissions or workflow permissions are restricted. | Follow **Step 2** to select **Read and write permissions** in repository settings and ensure `permissions: contents: write, pull-requests: write` is in your workflow file. |
| `GitHub Actions is not permitted to create or approve pull requests` | PR creation by Actions is disabled in repo settings. | Follow **Step 2** to check **"Allow GitHub Actions to create and approve pull requests"**. |
| `package.json was not found` | Action is running in the wrong directory. | Set `working-directory: './path/to/app'` in the action inputs if your project is in a subdirectory or monorepo. |

---

## 🛠️ Development & Building

```bash
# Install dependencies
npm install

# Run Jest tests
npm test

# Build bundled standalone distribution
npm run build
```

---

## 📄 License

[MIT]()
