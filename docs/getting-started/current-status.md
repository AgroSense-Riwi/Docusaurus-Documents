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
| Pending merge (API PR #20) | See the section below | Security and functionality fixes on branch `fix/security-and-functionality` ([API PR #20](https://github.com/AgroSense-Riwi/API/pull/20)), CI green, **open and not yet merged into `dev`**. Nothing in this row is deployed. |

## Pending merge (API PR #20)

[API PR #20](https://github.com/AgroSense-Riwi/API/pull/20) is open and
**not yet merged into `dev`**; the rows above describe the state without it.
Summary of what it changes:

| Area | Change in PR #20 | Documented in |
| --- | --- | --- |
| Buyer authentication | `POST /api/v1/auth/buyer-token` requires `client_id` + `api_key`, verified against the Argon2 `api_key_hash`; the buyer must be `is_active`. | [Data structure — Authentication and RBAC](../architecture-and-design/data_structure.md#authentication-and-rbac-in-the-api-api-pr-20) |
| Operator authentication / RBAC | `POST /api/v1/auth/token` authenticates against table `users` (email + Argon2 `password_hash`) and puts the user's real role in the token; tokens without a role are rejected. Telemetry only for `ADMIN` and `AGRONOMIST`. | Same as above |
| Row-level security | Deny-by-default policies with `FORCE ROW LEVEL SECURITY`; buyer endpoints set `SET LOCAL app.current_buyer_id`; explicit operator path via `app.current_role`; API connects as `agrosense_app` (not table owner). A foreign batch returns `404` instead of `403`. | [RN-11 implementation](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#61-rn-11-row-level-security-policies-migration-b7d4e2f9a1c3) |
| Certification (RN-09) | New table `forest_reserves`, column `farms.geom`, trigger `trg_check_farm_forest_overlap` with `ST_Intersects`; a farm without geometry makes the batch rejected. | [RN-09 implementation](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#64-rn-09-forest-reserves-and-certification-migration-e5a9b3c7d1f2) |
| Health checks | `/health` checks the database and RabbitMQ and returns `503` on failure; new `/health/live` for ECS and the ALB. | [Healthcheck strategy](../infrastructure-and-operations/healthcheck_strategy.md#6-health-and-healthlive-endpoints-in-fastapi) |
| Telemetry | Publishes to `agrosense.ingest.exchange` (vhost `/agrosense`); new consumer with manual ACK and DLX, as a Compose service and as a second container in the API ECS task. `definitions.json` is not loaded at boot. The consumer does not persist readings yet. | [RabbitMQ](../infrastructure-and-operations/rabbitmq.md#33-telemetry-flow-implemented-in-the-api-api-pr-20) |
| Deploy | `dev` no longer deploys; `main` → staging; tag `vX.Y.Z` → production; `force_deploy` removed; OIDC if `AWS_ROLE_ARN` exists. HTTPS listener on the ALB when `ACM_CERTIFICATE_ARN` is set. | [Git Workflow](./git_workflow.md#after-api-pr-20-pending-merge) |
| Airflow | Login enabled and its own secrets (Fernet, API and its own database). | [Local Environment Workflow](./local-environment-workflow-agrosense.md#api-authentication-and-credentials-api-pr-20) |

### Manual steps before merging or deploying (from the PR)

- **Secrets Manager (`agrosense/prod/`):**
  - create `auth-username`, `auth-password-hash`, `airflow-database-url`, `airflow-fernet-key`, `airflow-api-secret`, `airflow-admin-user` and `airflow-admin-password`;
  - change `rabbitmq-url` to the vhost `/%2Fagrosense`;
  - change `database-url` to the user `agrosense_app`.
- **EC2 Postgres:**
  - run `infra/aws/ec2-postgres-app-role.sql`;
  - if the table owner is not a superuser, grant it `BYPASSRLS`;
  - create `airflow_db`.
- **RabbitMQ with an existing volume:** `rabbitmqctl add_vhost /agrosense` and grant permissions to the user.
- **GitHub:** environments `staging` and `production` with their secrets; optional `AWS_ROLE_ARN` (OIDC).
- **ACM:** certificate in `us-east-2`, then re-run the infra script (`infra/aws/setup-ecs-infra.sh`).
- **Data:** load `email` and `password_hash` of the users and `api_key_hash` of the buyers. They are generated with `python -m agrosense_api.cli`.
- **Local:** `docker compose down -v` so that the new role is created.
