# Git Workflow & Code Standards

This guide establishes the branching model, code standards, quality checks, and release flow for the **AgroSense Café** project.

---

### Branching Model (current practice)

```
feat/AGRO-123-...  ──PR──▶  dev  ──PR──▶  main
```

- Feature branches are created from `dev` and merged back into `dev` through a Pull Request.
- `dev` is promoted to `main` only through a Pull Request.
- In the **API** and **Database-seed** repositories, `main` is protected: a Pull Request is required, and force pushes and branch deletion are not allowed. In the **API** repository, the `main-protect` ruleset also requires the two jobs of the `CI` workflow (`.github/workflows/ci.yml`), `quality` and `secrets`, to pass before a Pull Request can be merged into `main` (since 2026-11-02). The branch does not have to be up to date with `main` before merging. Database-seed has no GitHub Actions workflows, so it has no required checks.
- As of 2026-11-02, `main` has been updated from `dev` in the **API**, **Database-seed** and **Docusaurus-Documents** repositories. The first promotion ([API PR #23](https://github.com/AgroSense-Riwi/API/pull/23)) was merged with `-s ours --allow-unrelated-histories` because `main` and `dev` had no common history; since then `dev` → `main` is a normal PR. In Database-seed, the first promotion ([PR #5](https://github.com/AgroSense-Riwi/Database-seed/pull/5)) was a normal merge, because `main` only had the initial commit.

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

#### After API PR #20 (merged into `dev`)

[API PR #20](https://github.com/AgroSense-Riwi/API/pull/20) (branch `fix/security-and-functionality`, **merged into `dev` on 2026-11-02**) changes the API workflows as follows. Until it is merged and promoted to `main`, the current state above still applies.

| Event | Workflow | Result |
| :-- | :-- | :-- |
| Pull request to `dev` or `main`; push to `dev` | `ci.yml` | Pre-commit checks, `alembic upgrade head` and `pytest` against a PostGIS service container, plus a Gitleaks secret scan. **No deploy.** |
| Push / merge to `main` | `deploy-ecs.yml` | CI (reused via `workflow_call`, cannot be skipped) → build and push to ECR → deploy to the GitHub environment **`staging`**. |
| Tag `vX.Y.Z` | `deploy-ecs.yml` | Same pipeline, deployed to the GitHub environment **`production`**. The tag must point to a commit that is in `main`, otherwise the run fails. |
| Manual (`workflow_dispatch`) | `deploy-ecs.yml` | Input `environment`: `staging` (only from `main`) or `production` (only from a `vX.Y.Z` tag). |

- **`dev` no longer deploys.**
- The `force_deploy` input is removed; there is no way to skip CI or the secret scan.
- Secrets are defined per GitHub environment (`staging` / `production`): `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECS_CLUSTER`, `ECS_SERVICE_API`, `SUBNET_1`, `SUBNET_2`, `API_SG`, optional `ALB_TG_ARN`; optional variables `ALB_TG_NAME` and `API_PUBLIC_URL`.
- **AWS credentials:** if the environment secret `AWS_ROLE_ARN` is set, the workflow assumes that IAM role through GitHub OIDC; otherwise it falls back to `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. OIDC is optional.
- Every secret referenced by the task definition (API and telemetry consumer containers) must exist in Secrets Manager; otherwise the deploy fails before registering the task definition.
- **HTTPS:** `infra/aws/setup-ecs-infra.sh` creates an HTTPS listener on port 443 (ACM certificate, SSL policy `ELBSecurityPolicy-TLS13-1-2-2021-06` by default) and turns HTTP:80 into a 301 redirect to HTTPS **only when `ACM_CERTIFICATE_ARN` is set**. Without it, the ALB keeps only HTTP:80 and the script prints a warning. The certificate must be issued in the same region as the ALB (`us-east-2`).
