# Git Workflow & Code Standards

This guide establishes the branching model, code standards, quality checks, and release flow for the **AgroSense Café** project.

---

### Branching Model (current practice)

```
feat/AGRO-123-...  ──PR──▶  dev  ──PR──▶  main
```

- Feature branches are created from `dev` and merged back into `dev` through a Pull Request.
- `dev` is promoted to `main` only through a Pull Request.
- In the **API** and **Database-seed** repositories, `main` is protected: a Pull Request is required, and force pushes and branch deletion are not allowed.
- As of 2026-10-31, `main` has not yet been updated from `dev` in any repository.

---

### 1. Start a Task (New Branch)

Before starting your work, update your local `dev` branch and create a feature branch using the Jira ticket key and a short description in `kebab-case`:

```powershell
# Update local dev
git switch dev; git pull

# Create and switch to the task branch
git switch -c feat/AGRO-123-add-sensor-endpoint
```

---

### 2. Checks, Commit & Push

Run the linter, formatter, and unit tests before staging your changes, creating the commit, and pushing them to the remote repository:

```powershell
# Format and fix linting issues with Ruff
uv run ruff check . --fix; uv run ruff format .

# Run test suite
uv run pytest

# Stage changes interactively
git add -p

# Commit following Conventional Commits
git commit -m "feat(api): add sensor readings endpoint"

# Push the branch and set remote upstream
git push -u origin HEAD
```

---

### 3. Standards & Best Practices

#### Branch Naming

Use standard semantic prefixes followed by the Jira ticket key and a brief description in `kebab-case`:

- **Allowed prefixes:** `feat/`, `fix/`, `chore/`, `docs/`
- **Example:** `feat/AGRO-123-add-sensor-endpoint`

#### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- **Structure:** `<type>(<optional scope>): <description>`
- **Common types:** `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- **Example:** `feat(api): add sensor readings endpoint`

#### PR Scope

- **Size:** Keep Pull Requests small (ideally under 400 lines of diff).
- **Testing:** Ensure all changes include their corresponding unit or integration tests.

#### Merging Strategy

- **Squash and Merge:** Always use the **Squash and merge** option on GitHub to maintain a clean, linear history.
- **Target branch:** open feature PRs against `dev`, not `main`.

---

### 4. Release Flow

- **Current state (2026-10-31):** in the API repository, CI (`.github/workflows/ci.yml`) runs on pull requests to `dev` and on pushes to `dev`. The deploy workflow (`.github/workflows/deploy-ecs.yml`) is currently triggered by a push to `main` or `dev`, or manually.
- **Planned production release:** production deployments triggered by a Git Release Tag created from `main`.
- **Version format:** `v1.0.0`
