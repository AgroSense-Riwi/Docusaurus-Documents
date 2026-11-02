# Configuration Specification for RabbitMQ and Mock Storage (LocalStack S3)

This document establishes the technical configuration requirements, data persistence, default credentials, initial queue topology, S3 buckets, and network endpoints for the **RabbitMQ** and **LocalStack (Mock Storage)** containers in the **AgroSense Café** local development environment.

---

## 1. Purpose in the Local Architecture

To emulate the *end-to-end* flow without incurring cloud operating costs (RNF-04) or depending on constant AWS connectivity during development, the Docker environment includes two key services alongside PostgreSQL:

1. **RabbitMQ (Decoupled Ingestion Layer):** Acts as the messaging broker with acknowledgment (`ACK`) to receive block uploads of up to 7 days from the IoT sensors (RNF-01) and to queue the scheduled weather extractions without saturating the FastAPI backend.
2. **LocalStack (Local Amazon S3 Emulator):** Locally simulates the Data Lake to store raw and processed objects (JSON/Parquet with daily partitioning) across the three layers of the **Medallion** architecture (`Bronze`, `Silver`, and `Gold`).

---

## 2. Directory Structure in the Repository (`/docker`)

Following the project standard, the configuration and automatic bootstrap files for RabbitMQ and LocalStack live inside the `/docker` folder:

```text
agrosense-cafe/
├── app/
├── docker/
│   ├── postgres/
│   │   └── init/
│   │       ├── 01_enable_extensions.sql
│   │       ├── 02_create_schemas.sql
│   │       └── 03_create_roles_and_db.sql
│   ├── rabbitmq/
│   │   ├── rabbitmq.conf              # Broker startup configuration
│   │   └── definitions.json           # Predefined topology (Exchanges, Queues, and DLQ)
│   └── localstack/
│       └── init/
│           └── 01_init_s3_buckets.sh  # Bootstrap script for Medallion buckets
├── .env.example
└── docker-compose.yml
```

---

## 3. RabbitMQ Container Specification

### 3.1 Technical and Runtime Parameters

- **Official Image:** `rabbitmq:3.13-management-alpine` (includes the web management plugin and Prometheus metrics).
- **Exposed Ports:**
  - `5672`: **AMQP 0-9-1** protocol port for publishing and consuming from FastAPI and workers.
  - `15672`: **RabbitMQ Management UI** web interface (`http://localhost:15672`).
- **Data Persistence:** Named volume `rabbitmq_data` mounted at `/var/lib/rabbitmq` to keep messages on disk (`durable: true`) across container restarts.
- **Delivery Guarantee (RNF-01):** All queues are declared as **durable** (`durable: true`) and require explicit confirmation from the consumer (`manual ACK`) before a block of readings is removed from the queue.

### 3.2 Initial Queue Topology (`docker/rabbitmq/definitions.json`)

The following queues and exchanges make up the topology of the `/agrosense` virtual host.

> **Updated by [API PR #20](https://github.com/AgroSense-Riwi/API/pull/20) (merged into `dev` on 2026-11-02):** `definitions.json` is **not** imported when the broker starts. When definitions are configured to load at boot, RabbitMQ skips creating the default user and vhost from `RABBITMQ_DEFAULT_USER` / `RABBITMQ_DEFAULT_PASS` / `RABBITMQ_DEFAULT_VHOST`, and the broker would be left without credentials. Instead, the API and the telemetry consumer declare this same topology idempotently every time they connect (see [§3.3](#33-telemetry-flow-implemented-in-the-api-api-pr-20)). In the API repository the files live in `infra/docker/rabbitmq/`, and `definitions.json` there has the `vhosts`, `exchanges`, `queues` and `bindings` shown below but no `permissions` block. It can still be imported manually:
>
> ```bash
> docker compose exec broker rabbitmqctl import_definitions /etc/rabbitmq/definitions.json
> ```

| Resource                  | Type                | Name                        | Purpose in AgroSense Café                                                                       |
| :------------------------ | :------------------ | :-------------------------- | :---------------------------------------------------------------------------------------------- |
| **Main Exchange**         | `topic`             | `agrosense.ingest.exchange` | Routes messages by source type (`telemetry.*`, `climate.*`).                                    |
| **DLX Exchange**          | `direct`            | `agrosense.dlx.exchange`    | Captures corrupted or rejected blocks after retries are exhausted.                              |
| **IoT Queue (F4)**        | `classic (durable)` | `telemetry.raw.queue`       | Receives blocks of IoT sensor readings (up to 7 days accumulated) with `ACK` confirmation.      |
| **Weather Queue (F2/F3)** | `classic (durable)` | `climate.ingest.queue`      | Queues the daily downloads from NASA POWER and Open-Meteo.                                      |
| **Dead Letter Queue**     | `classic (durable)` | `dead.letter.queue`         | Stores failed payloads for auditing and insertion into `sensor_anomalies_log`.                  |

#### File `docker/rabbitmq/rabbitmq.conf`:

```ini
loopback_users.guest = false
listeners.tcp.default = 5672
management.tcp.port = 15672
## definitions.json is NOT imported at startup (API PR #20): the API and the
## FastConsumer declare the topology idempotently. Optional manual import:
##   docker compose exec broker rabbitmqctl import_definitions /etc/rabbitmq/definitions.json
## management.load_definitions = /etc/rabbitmq/definitions.json
## Safe memory limit for local development
vm_memory_high_watermark.relative = 0.6
```

#### File `docker/rabbitmq/definitions.json`:

```json
{
  "vhosts": [
    { "name": "/" },
    { "name": "/agrosense" }
  ],
  "permissions": [
    {
      "user": "agrosense_mq",
      "vhost": "/agrosense",
      "configure": ".*",
      "write": ".*",
      "read": ".*"
    }
  ],
  "exchanges": [
    {
      "name": "agrosense.ingest.exchange",
      "vhost": "/agrosense",
      "type": "topic",
      "durable": true,
      "auto_delete": false
    },
    {
      "name": "agrosense.dlx.exchange",
      "vhost": "/agrosense",
      "type": "direct",
      "durable": true,
      "auto_delete": false
    }
  ],
  "queues": [
    {
      "name": "telemetry.raw.queue",
      "vhost": "/agrosense",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "agrosense.dlx.exchange",
        "x-dead-letter-routing-key": "dlq.telemetry",
        "x-message-ttl": 604800000
      }
    },
    {
      "name": "climate.ingest.queue",
      "vhost": "/agrosense",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "agrosense.dlx.exchange",
        "x-dead-letter-routing-key": "dlq.climate"
      }
    },
    {
      "name": "dead.letter.queue",
      "vhost": "/agrosense",
      "durable": true,
      "auto_delete": false
    }
  ],
  "bindings": [
    {
      "source": "agrosense.ingest.exchange",
      "vhost": "/agrosense",
      "destination": "telemetry.raw.queue",
      "destination_type": "queue",
      "routing_key": "telemetry.block.#"
    },
    {
      "source": "agrosense.ingest.exchange",
      "vhost": "/agrosense",
      "destination": "climate.ingest.queue",
      "destination_type": "queue",
      "routing_key": "climate.daily.#"
    },
    {
      "source": "agrosense.dlx.exchange",
      "vhost": "/agrosense",
      "destination": "dead.letter.queue",
      "destination_type": "queue",
      "routing_key": "dlq.telemetry"
    },
    {
      "source": "agrosense.dlx.exchange",
      "vhost": "/agrosense",
      "destination": "dead.letter.queue",
      "destination_type": "queue",
      "routing_key": "dlq.climate"
    }
  ]
}
```

### 3.3 Telemetry Flow Implemented in the API (API PR #20)

> **Status:** implemented in [API PR #20](https://github.com/AgroSense-Riwi/API/pull/20) (branch `fix/security-and-functionality`), **merged into `dev` on 2026-11-02**. Before this PR, the API published to a queue named `agrosense.telemetry` that is not part of the topology above.

**Connection.** The API, the consumer and the simulators connect with `AGROSENSE_RABBITMQ_URL`, which points to the `/agrosense` vhost (URL-encoded as `%2Fagrosense`), e.g. `amqp://agrosense_mq:<password>@broker:5672/%2Fagrosense`. In Docker Compose the broker creates that vhost from `RABBITMQ_DEFAULT_VHOST=/agrosense`. A broker whose data volume already exists does not create it again; in that case run `rabbitmqctl add_vhost /agrosense` and grant the user permissions on it.

**Publishing (`POST /api/v1/telemetry`).** Restricted to the `ADMIN` and `AGRONOMIST` roles. The API:

1. Declares the topology idempotently (same arguments as `definitions.json`).
2. Publishes to exchange **`agrosense.ingest.exchange`** with routing key **`telemetry.block.<farm_id>`**, which matches the binding `telemetry.block.#` of `telemetry.raw.queue`.
3. Uses publisher confirms, `mandatory=True` (an unroutable message is not silently lost) and persistent delivery; the message body is the reading plus its `event_id`, which is also the AMQP `message_id`.
4. Returns `202 Accepted` with `{ "event_id": "...", "status": "queued" }`, or `503` if the broker is not configured or not reachable.

**Consumer (`python -m agrosense_api.workers.telemetry_consumer`).** It consumes `telemetry.raw.queue`:

- **Manual ACK** (`no_ack=False`) with prefetch `AGROSENSE_TELEMETRY_CONSUMER_PREFETCH` (default `50`). A message is acknowledged only after it has been processed (**RNF-01**).
- Each message is validated, deduplicated (bounded in-memory idempotency registry) and ordered chronologically per `sensor_id`. It accepts a single reading, a list, or an object with a `readings` list.
- A completely invalid message (or an unexpected processing error) is rejected with `requeue=False`, so the broker routes it through the queue's DLX (`agrosense.dlx.exchange`, routing key `dlq.telemetry`) to `dead.letter.queue`. In a partially valid block, the invalid readings are published explicitly to the DLX before the message is acknowledged.
- If the broker is not reachable at startup, it retries with backoff (1, 2, 5, 10, 30 s) instead of exiting, and stops cleanly on `SIGTERM`/`SIGINT`.
- **It does not persist readings yet:** accepted readings are only logged (debug level). In PR #20 the consumer writes nothing to PostgreSQL or S3.

**Where the consumer runs.**

- **Docker Compose:** service `telemetry-consumer` (container `agrosense_telemetry_consumer`), same image as the API (`agrosense-api:local`), command `python -m agrosense_api.workers.telemetry_consumer`, `SKIP_MIGRATIONS=true`, depends on a healthy `broker`, private network only.
- **AWS ECS:** second container `agrosense-telemetry-consumer` in the API task definition (`infra/aws/ecs/task-definition-api.json`), same image as the API, `essential: false`, started after the `agrosense-api` container (`dependsOn` with condition `START`), with `AGROSENSE_RABBITMQ_URL` from the secret `agrosense/prod/rabbitmq-url` and logs in `/ecs/agrosense-api` with stream prefix `telemetry-consumer`. RabbitMQ itself is still not deployed in AWS (see [Current Project Status](../getting-started/current-status.md)).

---

## 4. Mock Storage (LocalStack S3) Container Specification

### 4.1 Technical and Runtime Parameters

- **Official Image:** `localstack/localstack:3.7`
- **Emulated Services (`SERVICES`):** `s3` (restricted to S3 only to optimize RAM usage and enable fast startup).
- **Unified Port (Edge Port):** `4566` (`http://localhost:4566`).
- **Data Persistence:**
  - Variable `PERSISTENCE=1` enabled.
  - Named volume `localstack_data` mounted at `/var/lib/localstack`.
- **Default Mock Credentials:**
  - `AWS_ACCESS_KEY_ID=test`
  - `AWS_SECRET_ACCESS_KEY=test`
  - `AWS_DEFAULT_REGION=us-east-2`

### 4.2 Medallion Bucket Initialization Script (`docker/localstack/init/01_init_s3_buckets.sh`)

LocalStack automatically runs all scripts located in `/etc/localstack/init/ready.d/` once the service is ready. This script creates the three local Data Lake buckets and their base structure for daily partitioning (`dt=YYYY-MM-DD`):

```bash
#!/usr/bin/env bash
# ============================================================================
# 01_init_s3_buckets.sh
# Automatically creates the local S3 buckets for the Medallion architecture
# ============================================================================

set -euo pipefail

echo "🚀 Initializing AgroSense Café S3 buckets in LocalStack..."

BUCKETS=(
  "agrosense-bronze-local"
  "agrosense-silver-local"
  "agrosense-gold-local"
)

for BUCKET in "${BUCKETS[@]}"; do
  awslocal s3 mb "s3://${BUCKET}" --region us-east-2 || true
  echo "✅ Bucket verified/created: s3://${BUCKET}"
done

# Create base prefixes for daily partitioning (Bronze / Silver / Gold)
awslocal s3api put-object --bucket agrosense-bronze-local --key iot_telemetry/
awslocal s3api put-object --bucket agrosense-bronze-local --key weather_nasa_power/
awslocal s3api put-object --bucket agrosense-bronze-local --key weather_open_meteo/

awslocal s3api put-object --bucket agrosense-silver-local --key telemetry_cleaned/
awslocal s3api put-object --bucket agrosense-silver-local --key weather_validated/

awslocal s3api put-object --bucket agrosense-gold-local --key agronomic_alerts/
awslocal s3api put-object --bucket agrosense-gold-local --key sustainability_indicators/

echo "🎉 Mock Storage (S3 Medallion) initialization completed."
```

> ⚠️ **Important:** Make sure to grant execute permissions to the script before committing to Git: `git update-index --chmod=+x docker/localstack/init/01_init_s3_buckets.sh`.

---

## 5. Full Definition in `docker-compose.yml` and Internal Network

All containers communicate within the dedicated bridge network `agrosense_network`:

```yaml
services:
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
      interval: 5s
      timeout: 5s
      retries: 5

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

## 6. Endpoint Matrix and Environment Variables (`.env.example`)

### 6.1 Service Endpoints Table

| Service             | Protocol / Interface        | Endpoint from the Host (Your PC)     | Internal Endpoint (Docker Network `agrosense_network`) |
| :------------------ | :-------------------------- | :----------------------------------- | :----------------------------------------------------- |
| **PostgreSQL**      | TCP (`psql` / SQLAlchemy)   | `localhost:5432`                     | `postgres:5432`                                        |
| **RabbitMQ Broker** | AMQP 0-9-1                  | `amqp://localhost:5672/%2Fagrosense` | `amqp://rabbitmq:5672/%2Fagrosense`                    |
| **RabbitMQ UI**     | HTTP (Web Dashboard)        | `http://localhost:15672`             | `http://rabbitmq:15672`                                |
| **LocalStack (S3)** | HTTP (AWS S3 API)           | `http://localhost:4566`              | `http://localstack:4566`                               |

### 6.2 Variable Configuration in `.env.example`

```dotenv
# ============================================================================
# PostgreSQL (Serving Database)
# ============================================================================
POSTGRES_DB=agrosense_db
POSTGRES_USER=agrosense_user
POSTGRES_PASSWORD=agrosense_password
POSTGRES_PORT=5432
DATABASE_URL=postgresql+psycopg://agrosense_user:agrosense_password@localhost:5432/agrosense_db

# ============================================================================
# RabbitMQ (IoT Ingestion with ACK and Weather Queue)
# ============================================================================
RABBITMQ_DEFAULT_USER=agrosense_mq
RABBITMQ_DEFAULT_PASS=agrosense_mq_secret
RABBITMQ_DEFAULT_VHOST=/agrosense
RABBITMQ_AMQP_PORT=5672
RABBITMQ_MGMT_PORT=15672
# URL for local use outside Docker:
RABBITMQ_URL=amqp://agrosense_mq:agrosense_mq_secret@localhost:5672/%2Fagrosense
# URL for internal use between Docker containers:
# RABBITMQ_URL=amqp://agrosense_mq:agrosense_mq_secret@rabbitmq:5672/%2Fagrosense

# ============================================================================
# Mock Storage — LocalStack S3 (Medallion Data Lake)
# ============================================================================
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-2
LOCALSTACK_PORT=4566
AWS_ENDPOINT_URL=http://localhost:4566
# AWS_ENDPOINT_URL=http://localstack:4566  # (Use inside Docker containers)

S3_BUCKET_BRONZE=agrosense-bronze-local
S3_BUCKET_SILVER=agrosense-silver-local
S3_BUCKET_GOLD=agrosense-gold-local
```

---

## 7. Local Verification and Diagnostic Commands

Once the environment is up with `docker compose up -d`, run the following commands to verify that the queues and S3 buckets were created correctly:

```powershell
# 1. Check the health status (Healthy) of the 3 containers
docker compose ps

# 2. List the queues created in RabbitMQ within the /agrosense vhost
docker exec -it agrosense_rabbitmq rabbitmqctl list_queues -p /agrosense name durable messages

# 3. Verify that the 3 Medallion buckets exist in LocalStack S3
docker exec -it agrosense_localstack awslocal s3 ls

# 4. List the prefixes created inside the Bronze bucket
docker exec -it agrosense_localstack awslocal s3 ls s3://agrosense-bronze-local/
```
