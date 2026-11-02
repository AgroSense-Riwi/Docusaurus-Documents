# Local Environment Startup and Teardown Workflow Specification

*AgroSense Café · Multi-Container Docker Compose Stack (Deliverables
E-02, E-04 \| CT-01, CT-02, CT-06)*

|                                                                         |
|:------------------------------------------------------------------------|
| \*\*Document Scope & Alignment:\\                                       |
| \*\*This document defines the standardized developer workflow for       |
| orchestrating the multi-container local stack of AgroSense Café via     |
| Docker Compose. It satisfies Deliverable E-04 and Jira Tasks AGRO-05A / |
| AGRO-05B, ensuring full alignment with Cross-Cutting Criteria CT-01     |
| (single-command startup, \<30 min onboarding), CT-02 (zero hardcoded    |
| secrets), and CT-06 (idempotent seed population).                       |


## 1. Overview & Developer Prerequisites

To ensure frictionless onboarding and strict parity between local
development and AWS cloud deployments, the entire AgroSense Café
stack—comprising PostgreSQL with PostGIS, RabbitMQ, Redis, Apache
Airflow, FastAPI, and data seeders—is containerized. Developers must
meet the following baseline environment prerequisites before executing
the workflow:

- **Docker Engine & Docker Compose v2:** Docker Desktop (macOS/Windows)
  or Docker Engine v24+ with compose plugin on Linux.

- **Environment Variables Configuration (.env):** A local .env file
  generated from .env.example containing non-sensitive credentials and
  service ports.

- **Resource Allocation:** Minimum 8 GB RAM and 4 CPUs assigned to the
  Docker daemon to handle Airflow, Spark, and PostgreSQL concurrently.

## 2. Local Stack Startup Workflow

In compliance with Criterion CT-01, bringing up the entire local
multi-container environment requires executing a single command from the
project root. The startup sequence automatically resolves service
dependencies, performs health checks, runs database migrations, and
triggers data seeding.

### 2.1 Primary Startup Command

|                                              |
|:---------------------------------------------|
| docker compose --env-file .env up -d --build |


### 2.2 Container Startup Dependency & Initialization Sequence

Docker Compose enforces strict startup ordering using condition-based
health checks (depends_on with service_healthy) to prevent race
conditions during database schema initialization:

1.  **Stage 1: Core Infrastructure Services:** PostgreSQL (PostGIS) and
    RabbitMQ containers launch first. PostgreSQL initializes the SRID
    4326 spatial extension, while RabbitMQ configures queues and
    exchange bindings.

2.  **Stage 2: Healthcheck Validation:** PostgreSQL executes pg_isready
    -U agrosense_user, and RabbitMQ runs rabbitmq-diagnostics ping.
    Upstream services wait until health status reaches 'healthy'.

3.  **Stage 3: Database Migrations & Seed Trigger:** An ephemeral init
    container executes Alembic database migrations followed by
    `python -m seed --mode dev --seed 42`, populating 130 farms
    and simulated IoT data idempotently (CT-06).

4.  **Stage 4: Application & Orchestration Services:** FastAPI (web
    API), Airflow Webserver/Scheduler (LocalExecutor - Airflow 3), and IoT
    Simulators start once database schema and seed data are verified.

## 3. Local Stack Teardown & Volume Management

Developers can stop or reset the local environment using standard Docker
Compose teardown commands. Care must be taken regarding persistent
volumes to distinguish between routine service stops and complete data
resets.

### 3.1 Routine Teardown (Preserving Data & State)

To temporarily halt execution without losing database records, RabbitMQ
queue state, or Airflow metadata, execute:

|                     |
|:--------------------|
| docker compose down |


### 3.2 Full Environment Reset (Destroying Named Volumes)

When testing schema migrations from scratch, re-running seed scripts, or
clearing corrupted queue states, developers must remove persistent named
volumes using the -v flag:

|                                         |
|:----------------------------------------|
| docker compose down -v --remove-orphans |


|                                                                       |
|:----------------------------------------------------------------------|
| \*\*⚠️ WARNING — PERSISTENT VOLUME PURGE:\\                           |
| \*\*Executing 'docker compose down -v' completely deletes the local   |
| PostgreSQL data volume (postgres_data), RabbitMQ queue volume         |
| (rabbitmq_data), and S3 local emulator buckets. Upon the next 'docker |
| compose up', the seed script will re-run automatically to reconstruct |
| the baseline state.                                                   |


## API Authentication and Credentials (API PR #20)

> **Status:** applies to [API PR #20](https://github.com/AgroSense-Riwi/API/pull/20)
> (branch `fix/security-and-functionality`), **merged into `dev` on
> 2026-11-02**. Values below come from the API repository `.env.example` on that
> branch; `changeme` placeholders are for local development only.

### New and changed variables in `.env`

| Variable | Used by | Purpose |
|:--|:--|:--|
| `AGROSENSE_APP_DB_PASSWORD` | `db` (init script) | Password of the application role `agrosense_app`, created by `infra/docker/postgres/init/02-create-app-role.sh`. Required. |
| `AGROSENSE_DATABASE_URL` | `api` | Now connects as `agrosense_app` (not the table owner), so row-level security applies: `postgresql+asyncpg://agrosense_app:<password>@db:5432/agrosense_db`. |
| `DATABASE_URL` | `api` entrypoint (Alembic), seed | Still the owner role (`POSTGRES_USER`). |
| `RABBITMQ_DEFAULT_VHOST` | `broker` | `/agrosense`. |
| `AGROSENSE_RABBITMQ_URL` | `api`, `telemetry-consumer`, `simulators` | Must include the vhost: `amqp://agrosense_mq:<password>@broker:5672/%2Fagrosense`. |
| `AGROSENSE_JWT_SECRET_KEY`, `AGROSENSE_BUYER_JWT_SECRET_KEY` | `api` | Operator and buyer JWT signing secrets, at least 32 characters each. Generate real values with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. |
| `AGROSENSE_AUTH_USERNAME`, `AGROSENSE_AUTH_PASSWORD_HASH` | `api` | Optional bootstrap operator for `POST /api/v1/auth/token` (always role `ADMIN`). The hash is Argon2. With the `changeme` placeholder the API starts but the bootstrap login returns `401`. |
| `AIRFLOW_ADMIN_USER`, `AIRFLOW_ADMIN_PASSWORD` | Airflow | Real login for the Airflow UI (`http://localhost:8080`); `SIMPLE_AUTH_MANAGER_ALL_ADMINS` is now `false`. |
| `AIRFLOW__CORE__FERNET_KEY`, `AIRFLOW__WEBSERVER__SECRET_KEY` | Airflow | Required. Generate a Fernet key with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. |
| `AGROSENSE_TELEMETRY_CONSUMER_PREFETCH` | `telemetry-consumer` | Optional; unacknowledged messages held at once (default `50`). |

### Generating password and API key hashes

The API ships a small CLI (`agrosense_api.cli`) that never stores secrets:

```bash
# Argon2 hash of a password (prompts without echo, or reads one line from stdin)
docker compose run --rm --no-deps --entrypoint python api -m agrosense_api.cli hash-secret
# equivalent outside Docker:
uv run python -m agrosense_api.cli hash-secret

# New buyer API key + its Argon2 hash
uv run python -m agrosense_api.cli new-buyer-key
```

- Paste the bootstrap hash into `.env` **between single quotes**, because it contains `$`:
  `AGROSENSE_AUTH_PASSWORD_HASH='$argon2id$v=19$m=65536,t=3,p=4$...'`.
- `new-buyer-key` prints the `api_key` (deliver it to the buyer through a secure channel; it is not shown again) and the `api_key_hash` to store in `international_buyers.api_key_hash`.
- Internal users authenticate with `users.email` + `users.password_hash` (hash from `hash-secret`) and need `is_active = true`. Users and buyers created by the current seed have no credentials, so they cannot log in until these columns are filled.

### Reset required after pulling PR #20

The `agrosense_app` role is created only when the PostgreSQL volume is
initialized, and the `/agrosense` vhost only when the RabbitMQ volume is
initialized. An existing local stack must therefore be recreated:

```powershell
docker compose down -v
docker compose --env-file .env up -d --build
```

`docker compose down -v` deletes the local database, queues and Airflow
metadata (see the warning in §3.2). PR #20 also adds the
`telemetry-consumer` service to the stack.

## 4. Developer Commands Reference Table

The following reference table summarizes standard commands for local
environment lifecycle management:

| **Command**                                                   | **Primary Action / Purpose**                          | **Expected Output / Health Status**                |
|:--------------------------------------------------------------|:------------------------------------------------------|:---------------------------------------------------|
| docker compose up -d --build                                  | Builds images and starts all services in background   | All 7 containers reach 'healthy' / 'running' state |
| docker compose logs -f api                                    | Tail logs for FastAPI service in real time            | HTTP 200/201 request logs displayed in stdout      |
| docker compose exec db psql -U agrosense_user -d agrosense_db | Interactive PostgreSQL shell access                   | psql prompt ready; PostGIS extension verified      |
| docker compose stop                                           | Pauses all running containers without destroying them | Containers stopped; volumes & data preserved       |
| docker compose down -v                                        | Stops containers & permanently removes all volumes    | Volumes purged; environment clean for fresh build  |

## 5. Verification & Onboarding Checklist (CT-01)

To satisfy Criterion CT-01, an external team member must be able to
complete local environment setup and verify system operation in under 30
minutes following this checklist:

- **Repository Clone & Secret Verification:** Repository cloned locally;
  .env file created from .env.example with no hardcoded production keys
  (CT-02).

- **Single-Command Execution:** Executed 'docker compose up -d --build'
  without manual intervention or configuration errors.

- **Service Accessibility Verification:** FastAPI Swagger UI accessible
  at http://localhost:8000/docs; Airflow UI accessible at
  http://localhost:8080.

- **Seed Verification Query:** Executed 'SELECT COUNT(\*) FROM farms;'
  returning exactly 130 records in development mode (CT-06).

- **Teardown Validation:** Executed 'docker compose down -v' and
  confirmed complete cleanup of local resources.
