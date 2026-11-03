---
sidebar_position: 1
title: Current Project Status
---

# Current Project Status (as of 2026-10-31, deployment rows updated 2026-11-02)

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
| Traceability API (FastAPI) | [US-01 ADR-002 / ADR-003](../deliverables/us01-technical-research-architecture-cost-estimation.md) | ECS cluster `agrosense-cluster` with one service, `agrosense-api-service`, running on Fargate behind an Application Load Balancer (HTTP only, port 80). The only registered task definition family is `agrosense-api`. Since 2026-11-02 it runs the code of `main` (task definition `agrosense-api:24`) and connects to the database as `agrosense_app`. It is kept at **0 tasks** to save credits and is started only for testing, together with the database instance (see next row). |
| PostgreSQL + PostGIS | [US-01 ADR-001](../deliverables/us01-technical-research-architecture-cost-estimation.md) (EC2 `t4g.small` / `t3.small`) | EC2 instance `agrosense-db-server`, type **`t3.micro`**. It is **intentionally stopped** by the team to save AWS credits until the project is ready. |
| Operational schema | [Dataset & Database Structure](../architecture-and-design/data_structure.md) (24 tables) | **15 tables**: 13 created by API Alembic migration `927ccb53d091` plus `forest_reserves` (migration `e5a9b3c7d1f2`) and `buyer_api_audit_logs` (migration `a9c4e6b2d8f1`). The remaining 9 tables are planned; see the [implementation status table](../architecture-and-design/data_structure.md#implementation-status-as-of-2026-10-31). Migration chain (head `a9c4e6b2d8f1`, applied on the EC2 database on 2026-11-02): `927ccb53d091` (initial schema) → `c1a8f93e2b45` (row-level security) → `a3f1c9d2e7b4` (`international_buyers.api_key_hash`, `is_active`) → `c8e2a7d5f0b1` (`users.email`, `password_hash`, `is_active`) → `b7d4e2f9a1c3` (deny-by-default, `FORCE ROW LEVEL SECURITY`) → `e5a9b3c7d1f2` (`forest_reserves`, `farms.geom`, trigger `trg_check_farm_forest_overlap`) → `f3b8c1d4a6e2` (function `export_batch_exists`, [CA-09](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#63-ca-09-foreign-batch-returns-403-under-rls-migration-f3b8c1d4a6e2)) → `a9c4e6b2d8f1` (table `buyer_api_audit_logs`, function `log_buyer_api_access`, [CA-09 audit log](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#65-ca-09-audit-log-buyer_api_audit_logs-migration-a9c4e6b2d8f1)). |
| RabbitMQ + FastConsumer worker | [US-01 inventory](../deliverables/us01-technical-research-architecture-cost-estimation.md), [RabbitMQ (local)](../infrastructure-and-operations/rabbitmq.md) | **Broker deployed** (2026-11-02) as ECS Fargate service `agrosense-broker` (task definition `agrosense-broker`, data on EFS access point `/rabbitmq-data`, vhost `/agrosense`), reachable at `broker.agrosense.local:5672` through the Cloud Map private namespace `agrosense.local`. It is kept at **0 tasks** to save credits and is started only for testing. Created by API script `infra/aws/setup-broker.sh`. The FastConsumer worker runs as a second container in the API task. Cloud Map is not described elsewhere in this documentation; it was chosen as the lowest-cost way for the API to find the broker. |
| Apache Airflow | [US-01 inventory](../deliverables/us01-technical-research-architecture-cost-estimation.md), [Bronze data dictionary](../data-and-traceability/data-dictionary-satellite-weather-bronze.md) | Since API PR #32 (2026-11-02): image `agrosense-airflow` (Airflow 3.3.2 + Java + PySpark 4.2.1) built and published to ECR by `.github/workflows/build-airflow-image.yml` (smoke test: both DAGs load, local SparkSession starts). `infra/aws/setup-airflow.sh` creates the missing secrets, the task definition (1 vCPU / 4 GB) and the ECS service `agrosense-airflow` with 0 tasks; **not run yet** in AWS because it writes to Secrets Manager. Already created: ECR repository, log group `/ecs/agrosense-airflow` and the Athena gold tables. DAGs: `dag_satellite_ingestion` (NASA POWER + Open-Meteo → S3 bronze) and `dag_gold_star_schema` (PostgreSQL → gold). See [Power BI first data](../deliverables/power-bi-first-data-guide.md). |
| "Spark" batch jobs | [US-01 Layer 3](../deliverables/us01-technical-research-architecture-cost-estimation.md) (PySpark on ECS Fargate) | `pipelines/spark_jobs/gold_star_schema_pyspark.py` is a **PySpark** job (API PR #32, dependency group `spark`, tested with a local SparkSession in CI), scheduled by `dag_gold_star_schema` at 06:00 UTC. The other jobs (`pipelines/spark_jobs/*.py`, `services/*_spark.py`) are still **plain Python modules** and nothing schedules them. |
| DB / broker on Fargate + EFS | API repo `infra/aws/ecs/` | `task-definition-broker.json` is registered (see the RabbitMQ row). `task-definition-db.json` is **not registered**: the database runs on EC2. An EFS file system `agrosense-efs` exists in the account. |
| Managed alternatives | [US-01 ADRs](../deliverables/us01-technical-research-architecture-cost-estimation.md) | No Amazon RDS, AWS Lambda or Amazon EMR resources in the account. |
| Cost estimate | [AGRO-12 cost analysis](../deliverables/agro12-aws-cost-analysis-and-budget-alarms.md) | Recalculated on 2026-11-02 with AWS Price List API prices: production \$254.21/month (optimized \$215.65), staging as deployed \$68.02/month stopped, \$111.65 24/7; actual October 2026 bill \$40.28 (covered by credits). AWS Budgets `agrosense-prod-monthly-budget` (\$260) and `agrosense-staging-monthly-budget` (\$120) created the same day. |
| Seed data | [Seed validation criteria](../data-quality-and-seed-data/seed-dataset-validation-criteria-en.md), [Reproducibility strategy](../data-quality-and-seed-data/seed_data_reproducibility_strategy.md) | Run with `python -m seed`. The dev profile produces 130 farms, at least 80 harvest deliveries and 10 export batches (asserted by Database-seed `tests/test_idempotency_ct06.py`). |
| Git flow & CI/CD | [Git Workflow](./git_workflow.md) | Feature branches → PR → `dev`; `dev` → `main` via PR. `main` is protected in API and Database-seed. With API PR #20 merged, `dev` no longer deploys: a merge to `main` deploys to `staging` and a tag `vX.Y.Z` deploys to `production`. In the **API** repo, the first promotion `dev` → `main` was [PR #23](https://github.com/AgroSense-Riwi/API/pull/23) (2026-11-02): because the two branches had no common history, it was merged with the `ours` strategy and `--allow-unrelated-histories`, so `main` now has the content of `dev` and both branches share history. Later promotions (PRs #25, #27, #29) are normal PRs. In **Database-seed**, the first promotion was [PR #5](https://github.com/AgroSense-Riwi/Database-seed/pull/5) (2026-11-02), a normal merge because `main` only had the initial commit; the repo has no GitHub Actions workflows, so it does not deploy. In **Docusaurus-Documents**, `main` has not been updated from `dev` yet. No `vX.Y.Z` tag exists, so nothing has been deployed to `production`. |
| Merged into `dev` (API PR #20) | See the section below | Security and functionality fixes on branch `fix/security-and-functionality` ([API PR #20](https://github.com/AgroSense-Riwi/API/pull/20)), merged into `dev` on 2026-11-02 and deployed to `staging` through `main` the same day. |
| CA-09 (buyer isolation) | [CA-09 implementation](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#63-ca-09-foreign-batch-returns-403-under-rls-migration-f3b8c1d4a6e2) | **Verified in AWS on 2026-11-02**: with the API connected as `agrosense_app` (secret `agrosense/prod/database-url`) and task definition `agrosense-api:23`, a foreign batch returns `403`, an unknown code `404` and an own batch `200` (`infra/aws/ca09-smoke-test.sh`). Since API PR #30 (task definition `agrosense-api:24`, migration `a9c4e6b2d8f1`) the `200` and the `403` are written to `buyer_api_audit_logs`, verified the same day ([CA-09 audit log](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#65-ca-09-audit-log-buyer_api_audit_logs-migration-a9c4e6b2d8f1)). After the test the API and broker were scaled to 0 and the EC2 instance was stopped. |

## Merged into `dev` (API PR #20)

[API PR #20](https://github.com/AgroSense-Riwi/API/pull/20) was merged into
`dev` on 2026-11-02 and deployed to `staging` through `main` the same day
(API PRs #23 to #29).
Summary of what it changes:

| Area | Change in PR #20 | Documented in |
| --- | --- | --- |
| Buyer authentication | `POST /api/v1/auth/buyer-token` requires `client_id` + `api_key`, verified against the Argon2 `api_key_hash`; the buyer must be `is_active`. | [Data structure — Authentication and RBAC](../architecture-and-design/data_structure.md#authentication-and-rbac-in-the-api-api-pr-20) |
| Operator authentication / RBAC | `POST /api/v1/auth/token` authenticates against table `users` (email + Argon2 `password_hash`) and puts the user's real role in the token; tokens without a role are rejected. Telemetry only for `ADMIN` and `AGRONOMIST`. | Same as above |
| Row-level security | Deny-by-default policies with `FORCE ROW LEVEL SECURITY`; buyer endpoints set `SET LOCAL app.current_buyer_id`; explicit operator path via `app.current_role`; API connects as `agrosense_app` (not table owner). A foreign batch returned `404` instead of `403`; fixed later by API PRs #26/#28 (CA-09, `403`). | [RN-11 implementation](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#61-rn-11-row-level-security-policies-migration-b7d4e2f9a1c3), [CA-09](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#63-ca-09-foreign-batch-returns-403-under-rls-migration-f3b8c1d4a6e2) |
| Certification (RN-09) | New table `forest_reserves`, column `farms.geom`, trigger `trg_check_farm_forest_overlap` with `ST_Intersects`; a farm without geometry makes the batch rejected. | [RN-09 implementation](../data-and-traceability/traceability-schema-definition-rn08-rn09-rn11.md#64-rn-09-forest-reserves-and-certification-migration-e5a9b3c7d1f2) |
| Health checks | `/health` checks the database and RabbitMQ and returns `503` on failure; new `/health/live` for ECS and the ALB. | [Healthcheck strategy](../infrastructure-and-operations/healthcheck_strategy.md#6-health-and-healthlive-endpoints-in-fastapi) |
| Telemetry | Publishes to `agrosense.ingest.exchange` (vhost `/agrosense`); new consumer with manual ACK and DLX, as a Compose service and as a second container in the API ECS task. `definitions.json` is not loaded at boot. The consumer does not persist readings yet. | [RabbitMQ](../infrastructure-and-operations/rabbitmq.md#33-telemetry-flow-implemented-in-the-api-api-pr-20) |
| Deploy | `dev` no longer deploys; `main` → staging; tag `vX.Y.Z` → production; `force_deploy` removed; OIDC if `AWS_ROLE_ARN` exists. HTTPS listener on the ALB when `ACM_CERTIFICATE_ARN` is set. | [Git Workflow](./git_workflow.md#after-api-pr-20-merged-into-dev) |
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
