---
sidebar_position: 1
title: Current Project Status
---

# Current Project Status (as of 2026-10-31)

Most pages in this site describe the **target (designed) architecture** of
AgroSense Café. This page records what is **actually implemented and
deployed** at the date above, so readers can tell the two apart. The design
documents are kept as the reference for where the project is heading.

Sources: review of the AWS account (region `us-east-2`, Ohio) and of the
`dev` branches of the API and Database-seed repositories.

## Component status

| Component | Designed in | Current real state |
| --- | --- | --- |
| AWS region | [US-01 architecture](../deliverables/us01-technical-research-architecture-cost-estimation.md) | `us-east-2` (Ohio). |
| Traceability API (FastAPI) | [US-01 ADR-002 / ADR-003](../deliverables/us01-technical-research-architecture-cost-estimation.md) | ECS cluster `agrosense-cluster` with one service, `agrosense-api-service`, running on Fargate behind an Application Load Balancer (HTTP only, port 80). The only registered task definition family is `agrosense-api`. The service currently **cannot start** because the database instance is stopped (see next row). |
| PostgreSQL + PostGIS | [US-01 ADR-001](../deliverables/us01-technical-research-architecture-cost-estimation.md) (EC2 `t4g.small` / `t3.small`) | EC2 instance `agrosense-db-server`, type **`t3.micro`**. It is **intentionally stopped** by the team to save AWS credits until the project is ready. |
| Operational schema | [Dataset & Database Structure](../architecture-and-design/data_structure.md) (24 tables) | **13 tables** created by API Alembic migration `927ccb53d091`, plus migration `c1a8f93e2b45` (row-level security). The remaining 11 tables are planned; see the [implementation status table](../architecture-and-design/data_structure.md#implementation-status-as-of-2026-10-31). |
| RabbitMQ + FastConsumer worker | [US-01 inventory](../deliverables/us01-technical-research-architecture-cost-estimation.md), [RabbitMQ (local)](../infrastructure-and-operations/rabbitmq.md) | **Not yet deployed** in AWS (no EC2 instance, no ECS service). RabbitMQ is defined only in the local Docker Compose stack (API repo `docker-compose.yml`). |
| Apache Airflow | [US-01 inventory](../deliverables/us01-technical-research-architecture-cost-estimation.md), [Bronze data dictionary](../data-and-traceability/data-dictionary-satellite-weather-bronze.md) | **Not yet deployed** in AWS. `infra/aws/ecs/task-definition-airflow.json` exists in the API repo but is not registered. Airflow runs only in the local Docker Compose stack. The repo contains one DAG, `dag_satellite_ingestion` (NASA POWER + Open-Meteo → S3 bronze). |
| "Spark" batch jobs | [US-01 Layer 3](../deliverables/us01-technical-research-architecture-cost-estimation.md) (PySpark on ECS Fargate) | Implemented as **plain Python modules** (`pipelines/spark_jobs/`, `services/*_spark.py`); `pyspark` is not a dependency and **nothing schedules** these jobs yet. |
| DB / broker on Fargate + EFS | API repo `infra/aws/ecs/` | `task-definition-db.json` and `task-definition-broker.json` exist but are **not registered**. An EFS file system `agrosense-efs` exists in the account. |
| Managed alternatives | [US-01 ADRs](../deliverables/us01-technical-research-architecture-cost-estimation.md) | No Amazon RDS, AWS Lambda or Amazon EMR resources in the account. |
| Cost estimate | [AGRO-12 cost analysis](../deliverables/agro12-aws-cost-analysis-and-budget-alarms.md) | Design-time estimate; not recalculated for the components actually deployed. |
| Seed data | [Seed validation criteria](../data-quality-and-seed-data/seed-dataset-validation-criteria-en.md), [Reproducibility strategy](../data-quality-and-seed-data/seed_data_reproducibility_strategy.md) | Run with `python -m seed`. The dev profile produces 130 farms, at least 80 harvest deliveries and 10 export batches (asserted by Database-seed `tests/test_idempotency_ct06.py`). |
| Git flow & CI/CD | [Git Workflow](./git_workflow.md) | Feature branches → PR → `dev`; `dev` → `main` via PR. `main` is protected in API and Database-seed and has not yet been updated from `dev` in any repository. The API deploy workflow is currently triggered by a push to `main` or `dev`. |

## Out of scope for this page

API authentication, row-level security behavior, health checks and
telemetry handling are being reworked and will be documented separately.
