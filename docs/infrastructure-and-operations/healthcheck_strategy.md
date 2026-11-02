# Healthcheck and Readiness Strategy in Docker Compose

This document defines the health verification strategy (*Healthchecks*), timing calibration, startup dependency graph, and `/health` endpoint specification for the interdependent local services of **AgroSense Café** (**PostgreSQL**, **RabbitMQ**, **LocalStack S3**, and **FastAPI**).

---

## 1. Purpose and Technical Rationale

When `docker compose up -d` is run, the Docker engine starts the container processes almost in parallel. However, **a container being in the `Up` state (process started) does not mean the service is `Ready` (able to accept TCP/HTTP connections)**:

- **PostgreSQL 16** needs extra time on its first startup to run the bootstrap scripts in `/docker-entrypoint-initdb.d/` (`01_enable_extensions.sql`, `02_create_schemas.sql`, `03_create_roles_and_db.sql`).
- **RabbitMQ** needs to initialize the Erlang engine and import the exchange and queue topology (`definitions.json`).
- **LocalStack** must bring up the S3 emulator and run the `01_init_s3_buckets.sh` script to create the buckets of the Medallion architecture (`Bronze`, `Silver`, `Gold`).

If **FastAPI** or the **Alembic** migrations try to connect at second 1 using a plain `depends_on`, they will fail with `Connection refused` errors. To eliminate this race condition, all critical services implement native `healthcheck` blocks combined with the `condition: service_healthy` directive.

---

## 2. Calibration Parameters (Timings)

Each `healthcheck` block in `docker-compose.yml` is calibrated with four core parameters:

| Parameter                  | Technical Description                                                                                                       | Impact on AgroSense Café                                                                                                                                                     |
| :------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`interval`**             | How often Docker runs the verification command inside the container.                                                        | Defines how quickly it is detected that a service is ready or has gone down (`10s` to `15s`).                                                                                |
| **`timeout`**              | Maximum time Docker waits for the probe command to respond before considering it failed.                                    | Prevents hung checks from blocking the Docker daemon (`5s`).                                                                                                                 |
| **`retries`**              | Number of consecutive failures allowed before the container is marked `unhealthy`.                                          | Prevents false positives caused by momentary CPU spikes during startup (`3` to `5` attempts).                                                                                |
| **`start_period`**         | Initial grace period after container start during which failures **do not count against retries**.                          | **Critical:** Lets PostgreSQL, RabbitMQ, and LocalStack run their initialization scripts without being prematurely marked as failed (`10s` to `20s`).                        |

---

## 3. Healthcheck Matrix by Service

| Service        | Container              | Verification Command (`test`)                        | `interval` | `timeout` | `retries` | `start_period` | Success Criterion (`healthy`)                                                                          |
| :------------- | :--------------------- | :--------------------------------------------------- | :--------: | :-------: | :-------: | :------------: | :----------------------------------------------------------------------------------------------------- |
| **PostgreSQL** | `agrosense_postgres`   | `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}`   |   `10s`    |   `5s`    |    `5`    |     `20s`      | The engine accepts SQL connections on the main DB after `/docker-entrypoint-initdb.d/` has finished.   |
| **RabbitMQ**   | `agrosense_rabbitmq`   | `rabbitmq-diagnostics -q ping`                       |   `10s`    |   `5s`    |    `5`    |     `20s`      | The Erlang node is active, AMQP port `5672` responds, and the queues are loaded.                       |
| **LocalStack** | `agrosense_localstack` | `awslocal s3 ls`                                     |   `10s`    |   `5s`    |    `5`    |     `15s`      | The S3 API on port `4566` responds and lists the Medallion buckets.                                    |
| **FastAPI**    | `agrosense_fastapi`    | `curl -f http://localhost:8000/health`               |   `15s`    |   `5s`    |    `3`    |     `10s`      | The Uvicorn server responds `HTTP 200 OK`, validating an active connection to the DB and the queue (S3 is not checked — see §6). |

---

## 4. Dependency Sequencing Graph (Dependency Order)

The local environment starts up following a strict three-level sequence governed by `condition: service_healthy` and `condition: service_completed_successfully`:

```text
[Level 1: Base Infrastructure]          [Level 2: Backend Application]         [Level 3: Tasks / Migrations]
┌─────────────────────────────┐
│ postgres (service_healthy)  ├────────┐
└─────────────────────────────┘        │
┌─────────────────────────────┐        │      ┌────────────────────────┐      ┌──────────────────────────────┐
│ rabbitmq (service_healthy)  ├────────┼─────►│ fastapi                ├─────►│ alembic_migrate / seed_data  │
└─────────────────────────────┘        │      │ (API Server - healthy) │      │ (Post-readiness jobs)        │
┌─────────────────────────────┐        │      └────────────────────────┘      └──────────────────────────────┘
│ localstack (service_healthy)├────────┘
└─────────────────────────────┘
```

### Step-by-Step Sequencing Flow:

1. **Level 1 (Infrastructure):** Docker starts `postgres`, `rabbitmq`, and `localstack` simultaneously. All of them enter the `health: starting` state during their `start_period`.
2. **Level 2 (Backend API):** The `fastapi` container waits until **all three Level 1 services** report `healthy`. Only then does it start Uvicorn and expose the `/health` endpoint.
3. **Level 3 (Migrations / Seeds):** The migration containers or commands (`alembic upgrade head`) and the seed data load (`seed_script`) run with the guarantee that both the database and the backend are operational.

---

## 5. Full Specification in `docker-compose.yml`

Below is the consolidated configuration with the `healthcheck` blocks and explicit `depends_on` rules:

```yaml
services:
  # ==========================================================================
  # LEVEL 1: BASE INFRASTRUCTURE (PostgreSQL, RabbitMQ, LocalStack)
  # ==========================================================================
  postgres:
    image: postgres:16-alpine
    container_name: agrosense_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-agrosense_db}
      POSTGRES_USER: ${POSTGRES_USER:-agrosense_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-agrosense_password}
      TZ: UTC
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
      - postgres_data:/var/lib/postgresql/data
    networks:
      - agrosense_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-agrosense_user} -d ${POSTGRES_DB:-agrosense_db}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: agrosense_rabbitmq
    hostname: agrosense-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER:-agrosense_mq}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS:-agrosense_mq_secret}
      RABBITMQ_DEFAULT_VHOST: ${RABBITMQ_DEFAULT_VHOST:-/agrosense}
    ports:
      - "${RABBITMQ_AMQP_PORT:-5672}:5672"
      - "${RABBITMQ_MGMT_PORT:-15672}:15672"
    volumes:
      - ./docker/rabbitmq/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
      - ./docker/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json:ro
      - rabbitmq_data:/var/lib/rabbitmq
    networks:
      - agrosense_network
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  localstack:
    image: localstack/localstack:3.7
    container_name: agrosense_localstack
    restart: unless-stopped
    environment:
      SERVICES: s3
      PERSISTENCE: 1
      AWS_DEFAULT_REGION: ${AWS_DEFAULT_REGION:-us-east-2}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:-test}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:-test}
    ports:
      - "${LOCALSTACK_PORT:-4566}:4566"
    volumes:
      - ./docker/localstack/init:/etc/localstack/init/ready.d:ro
      - localstack_data:/var/lib/localstack
    networks:
      - agrosense_network
    healthcheck:
      test: ["CMD", "awslocal", "s3", "ls"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

  # ==========================================================================
  # LEVEL 2: BACKEND API (FastAPI)
  # ==========================================================================
  fastapi:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: agrosense_fastapi
    restart: unless-stopped
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-agrosense_user}:${POSTGRES_PASSWORD:-agrosense_password}@postgres:5432/${POSTGRES_DB:-agrosense_db}
      RABBITMQ_URL: amqp://${RABBITMQ_DEFAULT_USER:-agrosense_mq}:${RABBITMQ_DEFAULT_PASS:-agrosense_mq_secret}@rabbitmq:5672/%2Fagrosense
      AWS_ENDPOINT_URL: http://localstack:4566
    ports:
      - "${API_PORT:-8000}:8000"
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      localstack:
        condition: service_healthy
    networks:
      - agrosense_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

networks:
  agrosense_network:
    name: agrosense_network
    driver: bridge

volumes:
  postgres_data:
    name: agrosense_postgres_data
  rabbitmq_data:
    name: agrosense_rabbitmq_data
  localstack_data:
    name: agrosense_localstack_data
```

---

## 6. `/health` and `/health/live` Endpoints in FastAPI

> **Status:** the behavior below is implemented in [API PR #20](https://github.com/AgroSense-Riwi/API/pull/20) (branch `fix/security-and-functionality`), **pending merge — not yet in `dev`**. The real implementation lives in the API repository at `apps/api/src/agrosense_api/api/v1/endpoints/health.py` (both routes are mounted at the root, without the `/api/v1` prefix).

The API exposes two probes with different purposes:

| Endpoint | Type | What it checks | Used by |
| :-- | :-- | :-- | :-- |
| `GET /health` | Readiness | PostgreSQL (`SELECT 1` through the API engine) and RabbitMQ (TCP connection to the AMQP host/port of `AGROSENSE_RABBITMQ_URL`; `5672`, or `5671` for `amqps`). Each check has a 2-second timeout and both run in parallel. | Docker Compose healthcheck of the `api` service and monitoring. |
| `GET /health/live` | Liveness | Nothing external: it only confirms the process answers HTTP. | ECS container healthcheck (`infra/aws/ecs/task-definition-api.json`) and the ALB target group health check (`infra/aws/setup-ecs-infra.sh`). |

ECS and the ALB use `/health/live` so that a transient database or broker outage does not make ECS replace every task in a loop (flapping). `setup-ecs-infra.sh` also realigns the health check path of an existing target group to `/health/live`.

### 6.1 HTTP Response Contract

- **`GET /health` — healthy (`HTTP 200 OK`):**

  ```json
  {
    "status": "healthy",
    "database": "connected",
    "rabbitmq": "connected",
    "storage": "not_checked"
  }
  ```
- **`GET /health` — unavailable (`HTTP 503 Service Unavailable`):** returned when the database or RabbitMQ is not `connected`. `curl -f` then exits non-zero and Docker marks the container `unhealthy`:

  ```json
  {
    "status": "unhealthy",
    "database": "connected",
    "rabbitmq": "disconnected",
    "storage": "not_checked"
  }
  ```

  Possible values per dependency: `connected`, `disconnected`, `not_configured` (RabbitMQ URL not set; this also produces `503`) and `not_checked`.
- **S3 / LocalStack is not checked:** the API does not use S3 in its request path, so `storage` is always reported as `not_checked`. The S3 check shown in earlier versions of this page is not implemented.
- **`GET /health/live` (`HTTP 200 OK`):**

  ```json
  { "status": "alive", "service": "agrosense-api" }
  ```

---
## 7. Verification and Diagnostic Commands

During local development, use the following commands to inspect the health status and audit the startup times of each container:

```powershell
# 1. Start the whole stack, waiting for the healthchecks to pass in order
docker compose up -d --wait

# 2. Verify that all containers show "(healthy)" in the STATUS column
docker compose ps

# 3. Inspect the detailed healthcheck execution history for PostgreSQL
docker inspect --format "{{json .State.Health }}" agrosense_postgres

# 4. Manually test the FastAPI health endpoint from your terminal
curl -i http://localhost:8000/health
```
