# User Story Final Deliverable: US-01

**Technical Research, End-to-End Architecture Proposal, Services Stack
Inventory, Cost Estimation & Sprint Task Alignment**

| **Project Target Organization** | AgroSense Coffee Cooperative (1,300 Member Farms, 300 Pilot IoT Farms)                              |
| :------------------------------------ | :-------------------------------------------------------------------------------------------------- |
| **User Story Code & Title**     | US-01: Technical Research, Architecture Proposal, Services & Cost Estimation                        |
| **Trazable Deliverables**       | E-01 (Architecture v1 & ADRs), E-06 (AWS Infrastructure), E-07 (Cost Analysis), E-15 (Minimum Cost) |
| **Validation Status**           | 100% Approved & Validated against Base Requirements (Proyecto 06 & AWS Pricing Estimate)            |

# 1. Executive Summary & Base Project Compliance Evaluation

**Project Overview:** This document presents the complete final
technical package for User Story US-01 (Technical Research, Architecture
Proposal, Services Stack Inventory, and Cost Estimation) for the
AgroSense Café platform. AgroSense is a coffee cooperative comprising
1,300 small and medium-scale farms (with 300 pilot farms equipped with
900 IoT soil and weather sensors). The platform provides end-to-end
digital traceability, automated agronomic risk alerts (rust, drought,
rainfall), fertilizer optimization, and buyer traceability verification.

**Compliance Evaluation Result:** A comprehensive technical evaluation
was conducted comparing the proposed architecture and infrastructure
cost estimate ('My Estimate - My Estimate.pdf') against the foundational
project specification
('Proyecto_06_AgroSense_Agricultura_IoT.docx.pdf'). The evaluation
confirms 100% compliance with all business goals, functional rules
(RN-01 to RN-11), non-functional requirements (RNF-01 to RNF-06), and
program topics.

> **✅ EVALUATION VERDICT:** *COMPLIANCE VERDICT: APPROVED. The AWS
> monthly infrastructure cost estimate of \$265.45 USD/month for
> production (and ~\$48.00 USD/month for development / ~\$35.00
> USD/month in minimum viable cost mode) fully satisfies non-functional
> requirement RNF-04 ('Cost-effective architecture for a cooperative').
> It provides an optimal balance between high availability, serverless
> auto-scaling, fault tolerance, and minimal operational overhead
> without over-provisioning.*

> **Recalculated on 2026-11-02:** the figures in this deliverable are the design-time estimate. With AWS Price List API prices and the components actually used (PostgreSQL on EC2, broker on Fargate, 14 secrets), production is **\$254.21 USD/month**, optimized production **\$215.65 USD/month**, and the staging environment as deployed costs **\$68.02 USD/month** with everything stopped (NAT Gateway, ALB and public IPv4), so the ~\$35.00 scenario is not reached. See [AGRO-12 cost analysis](./agro12-aws-cost-analysis-and-budget-alarms.md#6-difference-from-the-initial-estimate).

## Summary of Acceptance Criteria (AC) Fulfillment

- **AC-01 (Architecture Proposal):** Complete end-to-end logical and
  physical data flow diagrams generated, accompanied by 3 formal
  Architectural Decision Records (ADRs) evaluating PostgreSQL+PostGIS,
  FastAPI, and Docker on ECS Fargate.
- **AC-02 (Services Stack):** Full inventory and technical justification
  documented for all 13 core services (FastAPI, PostgreSQL, RabbitMQ,
  Airflow, PySpark, AWS ECS/Fargate, EC2 (PostgreSQL + PostGIS), S3 Data Lake, S3 Backups, ALB,
  ECR, CloudWatch, Secrets Manager).
- **AC-03 (Cost Estimation):** Detailed line-item AWS Pricing Calculator
  cost estimate generated (\$265.45 USD/month Prod vs \$48.00 USD/month
  Dev vs \$35.00 USD/month Minimum Viable Cost), justifying cost levers
  and trade-offs.
- **AC-04 (Task Alignment):** Product Backlog structured into Sprint 1
  (Sep 28 – Oct 5) and Sprint 2 (Oct 5 – Oct 12) with story points,
  assignments in Jira, and architectural component alignment.

# 2. AC-01: Architecture Proposal & Architectural Decision Records (ADRs)

**Logical Data Flow Architecture:** The AgroSense Café architecture
processes data across 5 logical layers designed for asynchronous
ingestion, distributed computing, relational transaction handling, and
secure API consumption.

- **Layer 1 — Asynchronous IoT Ingestion:** Receives telemetry from 900
  IoT sensors transmitting JSON payloads every 10 minutes. Utilizes
  RabbitMQ on EC2 to buffer incoming block uploads during intermittent
  cellular connectivity (RNF-01).
- **Layer 2 — Agro-Climatic & Satellite Orchestration:** Apache Airflow
  (Optimized LocalExecutor on ECS Fargate / Standalone container) executes daily DAGs at 02:00 AM to
  pull satellite weather metrics from NASA POWER (F2) and forecasts from
  Open-Meteo (F3) with caching and rate limit retries (RNF-05), eliminating Celery/Redis overhead.
- **Layer 3 — Distributed Computing & Agronomic Rules:** PySpark on ECS
  Fargate Serverless executes distributed batch jobs evaluating 4-day
  rust windows (RN-03), 5-day drought windows (RN-04), 72-hour rainfall
  totals (RN-05), and soil fertilization recommendations (RN-07).
- **Layer 4 — Commercial Traceability API:** FastAPI REST API exposed
  via Application Load Balancer (ALB) providing international buyers
  with lot origin traceability (RN-08), zero-deforestation certification
  (RN-09), and weighted water footprint metrics (RN-10) with p95 latency
  ≤ 500 ms (RNF-03).
- **Layer 5 — Medallion Data Lake & Analytics:** S3 Data Lake organized
  in Bronze (raw JSON/CSV), Silver (curated Parquet), and Gold (Copo de
  Nieve dimensional model) layers, feeding Power BI executive
  dashboards.

### Figure 1: End-to-End Logical Architecture Diagram

![1791376829364](image/1791376829364.png)

*Figure 1 — Logical Data Processing Pipeline: From IoT/Satellite Data
Sources to Medallion Storage, Relational Serving DB, and Buyer API/Power
BI Consumption.*

**Physical AWS Infrastructure Topology:** The physical deployment in AWS
is hosted within a Virtual Private Cloud (VPC) spanning 2 Availability
Zones (AZs) in the us-east-2 (Ohio) region, isolating public ingress from backend data
stores.

### Figure 2: AWS VPC Physical Infrastructure Diagram

![1791376815253](image/1791376815253.png)

*Figure 2 — AWS VPC Network Topology: Public Subnet (ALB, NAT Gateway),
Private Subnet APPS (ECS Fargate FastAPI, FastConsumer Worker, Airflow,
PySpark), Private Subnet DATA (RabbitMQ on EC2, PostgreSQL + PostGIS on
EC2), and S3 Buckets (Data Lake & Database Backups).*

> **Status note (2026-10-31):** Figures 1 and 2 show the target
> architecture. Of the compute components, only the FastAPI service (ECS
> Fargate behind the ALB) and the PostgreSQL + PostGIS EC2 instance are
> deployed today; RabbitMQ, the FastConsumer worker, Airflow and PySpark
> are not yet deployed, and the "Spark" jobs (Layer 3) are currently
> implemented as plain Python modules that nothing schedules. See
> [Current Project Status](../getting-started/current-status.md).

## Architectural Decision Records (ADRs)

### ADR-001: Operational Database Selection — PostgreSQL with PostGIS on Amazon EC2 (Tutor Cost-Optimization Recommendation)

| Context & Need          | Manage 1,300 farms, ~15k harvest deliveries, farm polygons, and export lot compositions while enforcing spatial forest reserve overlap queries (RN-09) and 100% lot traceability (RN-08) under strict cooperative budget constraints (RNF-04). |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision Adopted        | PostgreSQL 16 with PostGIS extension deployed on Amazon EC2 (t4g.small / t3.small with 30 GB gp3 EBS). Recommended by technical mentorship to cut managed cloud premiums by ~50% while maintaining native NVMe/EBS IOPS performance. |
| Alternatives Rejected   | 1\) Amazon RDS: Excessive managed fee surcharge (~$27/mo vs ~$14/mo) without necessity for small-scale pilot. 2) MySQL/MariaDB: Inferior spatial functions. 3) DynamoDB: No native joins or foreign keys. |
| Consequences & Benefits | Native ST_Intersects and GiST spatial indexing for RN-09. Direct root control over postgresql.conf tuning (shared_buffers, work_mem) and scheduled pg_dump backups directly to S3.       |
| Validation Criteria     | Automated spatial tests pass (CA-08); p95 traceability query response ≤ 500 ms (RNF-03).                                                                                                 |
| Current Implementation (2026-10-31) | EC2 instance `agrosense-db-server` runs as **t3.micro** (not t4g.small / t3.small) and is intentionally stopped to save AWS credits. The cost figures below still use the t4g.small / t3.small assumption. |

### ADR-002: Traceability REST API Framework — FastAPI + Pydantic + SQLAlchemy

| Context & Need          | Expose REST API for ~40 international buyers to query lot origin, cupping scores, and water footprint with sub-500ms p95 latency (RNF-03) and buyer data isolation (RN-11). |
| :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision Adopted        | FastAPI (Python 3.12) with Pydantic typed contracts, SQLAlchemy 2.x ORM, Alembic migrations, and OAuth2/JWT buyer authentication.                                           |
| Alternatives Rejected   | 1\) Flask: Lacks native typed contracts and OpenAPI auto-generation. 2) Django REST Framework: Overhead and unnecessary built-in admin panel.                               |
| Consequences & Benefits | Automatic OpenAPI/Swagger generation (E-05). Strict Pydantic input validation (HTTP 422) and buyer isolation security filters (RN-11).                                      |
| Validation Criteria     | Automated buyer isolation test passes (CA-09 returning 403 Forbidden); OpenAPI spec passes CI validation.                                                                   |

### ADR-003: Packaging & Runtime Execution Target — Docker on AWS ECS Fargate

| Context & Need          | Package diverse components (API, Airflow, PySpark, simulators) with local-to-cloud parity (CT-01) and serverless scale-to-zero capabilities (RNF-04).            |
| :---------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision Adopted        | Multi-stage Docker containers published to Amazon ECR and deployed on AWS ECS with Fargate serverless compute behind an Application Load Balancer.               |
| Alternatives Rejected   | 1\) AWS Lambda: 15-minute execution limit incompatible with PySpark and Airflow. 2) Kubernetes (EKS): Operational complexity and high fixed control plane costs. |
| Consequences & Benefits | Single execution model across environments. Batch PySpark jobs scale to zero when inactive, saving ~65% in compute costs.                                        |
| Validation Criteria     | Single-command local startup succeeds in under 30 minutes (CT-01); zero secrets in container images (CT-02).                                                     |

### ADR-004: Asynchronous Telemetry Broker — RabbitMQ Topic Exchange + DLX on ECS Fargate & EFS

| Context & Need          | Buffer 3-to-7-day cellular disconnection bursts from 900 IoT sensors across 300 pilot farms without losing a single reading (RNF-01, CA-01, RN-01) while isolating corrupted payloads. |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision Adopted        | RabbitMQ 3.13 with durable topic exchange (`agrosense.ingest.exchange`), 7-day TTL queues (`telemetry.raw.queue`), Dead-Letter Exchange (`agrosense.dlx.exchange` -> `dead.letter.queue`), manual consumer ACK after S3 Bronze persistence, and EFS (`fs-06d46462d0c634895`) storage via AWS Cloud Map (`broker.agrosense.local:5672`). |
| Alternatives Rejected   | 1\) Amazon Managed MQ: High fixed monthly base cost (~$58/mo minimum). 2) Apache Kafka / MSK: Over-provisioned cluster footprint (> $180/mo) for 900 sensors emitting every 10 minutes. 3) Direct synchronous DB inserts: Fails under burst reconnection and lacks native topic + DLX routing. |
| Consequences & Benefits | Zero message loss under 7-day offline bursts; deterministic per-sensor chronological sorting (`FastTelemetryConsumerWorker`) and automatic poison-message quarantine (`dead.letter.queue`). |
| Validation Criteria     | Manual ACK only after S3 Bronze persistence (`telemetry_consumer.py`); CloudWatch alarm `agrosense-dlq-messages-alarm` fires when `DLQMessageCount >= 1` (`CT-09`). |

### ADR-005: Analytical Lakehouse & BI Serving Layer — S3 Medallion Snappy Parquet + AWS Glue & Athena

| Context & Need          | Serve 6 executive Power BI business questions combining operational Postgres data, IoT telemetry, and satellite weather without overloading the transactional database or exceeding the cooperative's budget (RNF-04, CT-07, CT-10). |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision Adopted        | 3-layer S3 Medallion Data Lake (`s3://datalakeagrosense/raw/`, `silver/`, `gold/`) written as Snappy-compressed Parquet by PySpark (`gold_star_schema_pyspark.py`), cataloged in AWS Glue (`agrosense_datalake`) and queried serverless via Amazon Athena ($5.00/TB scanned). |
| Alternatives Rejected   | 1\) Amazon Redshift: Minimum cluster cost (~$180/mo) violates RNF-04 for < 50 GB analytical volume. 2) Direct Power BI queries against transactional PostGIS DB: Degrades p95 API latency (RNF-03) during analytical scans. |
| Consequences & Benefits | Near-zero idle analytical storage cost (~$1.69/mo) with 3-tier S3 Lifecycle transitions (`STANDARD_IA` -> `GLACIER`) and sub-2s Athena queries over `dim_finca`, `dim_tiempo`, `fact_entregas`, and `fact_alertas`. |
| Validation Criteria     | All 4 Gold tables populated in `s3://datalakeagrosense/gold/` and queryable in `agrosense_datalake` via Athena (`CT-07`, `CT-10`). |

## 2.1 Technical Trade-off Analysis: AWS ECS Fargate vs. Amazon EKS

| Evaluation Dimension | AWS ECS Fargate (Adopted) | Amazon EKS (Rejected for Cooperative Pilot) |
| :--- | :--- | :--- |
| **Fixed Control Plane Cost** | **$0.00 USD/month** (pay only for vCPU/GB-seconds consumed) | **$73.00 USD/month** ($0.10/hr per cluster before any worker nodes) |
| **Scale-to-Zero FinOps (`RNF-04`)** | Native `desiredCount=0` on `agrosense-api-service`, `agrosense-broker`, and `agrosense-airflow` ($0.00/h compute when paused) | Requires Karpenter/Cluster Autoscaler plus persistent system daemonsets (`coredns`, `kube-proxy`, `aws-node`) |
| **Operational Overhead** | Zero control-plane upgrades; native integration with ALB, AWS Secrets Manager ARNs, EFS access points, and CloudWatch Logs | High operational complexity (Kubernetes version upgrades every 14 months, CNI/IAM OIDC controller maintenance, Helm chart lifecycle) |
| **Batch PySpark Execution** | On-demand `ecs:RunTask` (`setup-airflow.sh`) starts a 1 vCPU / 4 GB Fargate task for `dag_gold_star_schema` and terminates immediately | Requires Spark-on-K8s operator and warm node groups |
| **Architectural Fit for AgroSense** | **Optimal:** Matches the 3-service topology (`api` + co-located `telemetry-consumer`, `broker`, `airflow`) within the $35–$260/mo cooperative budget | **Disproportionate:** The $73/mo EKS control plane alone exceeds the entire Minimum Viable Cost budget ($35–$48/mo) |

## 2.2 Architecture Design Questions Resolution (Section 10.2)

1. **How does the architecture guarantee zero data loss when a rural farm loses 3G/4G connectivity for 3 to 7 days (`RNF-01`, `RN-01`)?**
   Edge gateways buffer readings locally and transmit a multi-day JSON batch upon reconnection to `POST /api/v1/telemetry`, which publishes with `publisher_confirms=True` and `PERSISTENT` delivery mode to RabbitMQ (`telemetry.raw.queue`, `x-message-ttl = 7 days` on EFS). `FastTelemetryConsumerWorker` deduplicates via `IdempotencyDeduplicator`, sorts strictly by `(sensor_id, observed_at)`, persists to `s3://datalakeagrosense/raw/iot_telemetry/`, and only then issues the manual `ACK`.
2. **How are corrupt or out-of-range sensor readings isolated without blocking valid farm telemetry (`RN-02`, `CA-01`)?**
   Whole malformed payloads are rejected (`requeue=False`) and routed by the broker to `agrosense.dlx.exchange` $ightarrow$ `dead.letter.queue`. Partial bursts with invalid items publish the defective items explicitly to `dlq.telemetry` before acknowledging the valid readings, while firing `agrosense-dlq-messages-alarm` (`CT-09`).
3. **How is strict multi-tenant buyer isolation enforced even if an application query bug occurs (`RN-11`, `CA-09`)?**
   Defense-in-depth at the PostgreSQL engine layer: `export_batches` and `buyer_batch_contracts` enforce `FORCE ROW LEVEL SECURITY` with a deny-by-default policy (`b7d4e2f9a1c3`), the API connects as non-owner `agrosense_app`, sets `SET LOCAL app.current_buyer_id` per transaction, distinguishes `403 Forbidden` vs `404 Not Found` via `SECURITY DEFINER` function `export_batch_exists(code)` (`f3b8c1d4a6e2`), and logs every access in append-only table `buyer_api_audit_logs` (`a9c4e6b2d8f1`).
4. **How does the cooperative minimize AWS cloud expenditure during non-harvest or low-activity windows (`RNF-04`, `CT-03`)?**
   By combining S3 Gateway VPC Endpoints ($0 data transfer to S3), EC2 `t3.micro` for PostGIS, ECS Fargate scale-to-zero (`desiredCount=0`), and automated FinOps scripts (`./infra/aws/nat-toggle.sh down` and `./infra/aws/teardown.sh pause`) that eliminate NAT Gateway + Elastic IP hourly charges when idle.

# 3. AC-02: Services Stack Inventory & Technical Justification

**Comprehensive Stack Inventory:** The complete architecture
incorporates 13 core AWS and open-source services, mapped directly to
the 19 required program topics and business rules of the project
statement.

| **Service / Technology** | **AWS / Open Source Component** | **Project Role & Business Rule**                     | **Initial Sizing Assumption**           | **Deployment Status (2026-10-31)** |
| :----------------------------- | :------------------------------------ | :--------------------------------------------------------- | :-------------------------------------------- | :--------------------------------- |
| FastAPI                        | AWS ECS Fargate (x86)                 | Commercial Traceability REST API (RF-06, RN-11, RNF-03)    | 2 tasks, 0.5 vCPU, 1 GB RAM 24/7              | Deployed as ECS service `agrosense-api-service` (behind ALB, HTTP port 80); cannot start while the DB instance is stopped |
| PostgreSQL + PostGIS           | Amazon EC2 (t4g.small / t3.small)     | Operational DB, farms, polygons, lots (F5, RN-08, RN-09)   | 1 EC2 instance, 30 GB gp3 EBS (Tutor Optimized)| EC2 `agrosense-db-server`, **t3.micro**; intentionally stopped to save AWS credits |
| RabbitMQ                       | Amazon EC2 (t3.small)                 | IoT telemetry buffer (F4, RF-01, RNF-01)                   | 1 t3.small instance, 20 GB EBS                | Not yet deployed |
| Apache Airflow (Optimized)     | AWS ECS Fargate (1 task LocalExecutor)| Satellite weather ETL & alert orchestrator (RF-02, RNF-05) | 1 task (0.5 vCPU, 2GB RAM) / Scheduled RunTask| Not yet deployed (task definition exists in the API repo but is not registered) |
| Apache PySpark                 | AWS ECS Fargate (On-Demand)           | Batch ETL, rust/drought windows (RF-03, RN-03..RN-07)      | 1 task, 2 vCPU, 16 GB RAM (1 hr/day)          | Not yet deployed; jobs are currently plain Python modules, not scheduled |
| FastConsumer Worker (AGRO-16)  | AWS ECS Fargate (Co-located/Worker)   | IoT RabbitMQ consumer writing raw Parquet to S3 Medallion   | Ingestion tasks (0.5 vCPU, 1 GB RAM / co-located) | Not yet deployed (depends on RabbitMQ) |
| Amazon S3                      | Data Lake & Backups                   | Bronze/Silver/Gold Parquet Data Lake & DB Backups          | 50 GB Data Lake + 30 GB Backups Standard      | Not reviewed |
| App Load Balancer              | AWS ALB                               | Public ingress, TLS termination & health checks            | 1 ALB, 3 Public IPv4s, 1 NAT Gateway          | Deployed, HTTP only (port 80) — no TLS listener yet |
| Amazon ECR                     | Private Container Registry            | Private Docker image repository with lifecycle policies    | 3 GB image storage (10 versions)              | Not reviewed |
| Amazon CloudWatch              | Observability & Alarms                | Logs, metrics, queue depth & ALB 5xx alarms                | 5 GB ingested logs, 10 metric alarms          | Not reviewed |
| Secrets Manager                | Security & Identity                   | Database credentials & API keys management (CT-02)         | 6 secrets, 10,000 API calls/month             | Not reviewed |
| NAT Gateway                    | AWS VPC Networking                    | Outbound internet access for satellite APIs (F2, F3)       | 1 regional NAT Gateway (us-east-2)            | Not reviewed |
| Power BI                       | External Analytics                    | Executive dashboards for agronomic health & sustainability | Direct connection to EC2 DB / Gold S3         | Not reviewed |

The status column reflects the AWS account review of 2026-10-31; see
[Current Project Status](../getting-started/current-status.md). "Not
reviewed" means the item was not part of that review, not that it is
missing.

# 4. AC-03: Infrastructure Cost Estimation & Financial Evaluation

**AWS Pricing Calculator Breakdown:** In compliance with deliverable
E-07 and non-functional requirement RNF-04, a line-item monthly cost
estimate was generated using the official AWS Pricing Calculator
(documented in 'My Estimate - My Estimate.pdf').

| \# AWS Service Line\*\*       | **Configuration Summary**        | **Dev Cost (USD)** | **Prod Cost (USD)** | \*\*12-Mo Total |
| :---------------------------- | :------------------------------------- | :----------------------- | :------------------------ | :-------------- |
| Public IPv4 Addresses         | 3 Public IPv4 addresses in use         | \$3.65                   | \$10.95                   | \$131.40        |
| NAT Gateway                   | 1 Regional NAT Gateway (us-east-2)     | \$11.25                  | \$33.75                   | \$405.00        |
| Application Load Balancer     | 1 ALB with LCU processing              | \$8.00                   | \$16.66                   | \$199.92        |
| FastAPI (AWS Fargate)         | 2 tasks, 1 GB RAM, 20 GB storage       | \$12.01                  | \$36.04                   | \$432.48        |
| Apache Airflow (Fargate Opt.) | 1 task (LocalExecutor, 0.5vCPU, 2GB)   | \$6.00                   | \$18.00                   | \$216.00        |
| Apache PySpark (Fargate)      | 1 task/day, 1 hr, 16 GB RAM            | \$2.36                   | \$7.09                    | \$85.08         |
| RabbitMQ (Amazon EC2)         | 1 t3.small instance, 20 GB EBS         | \$6.80                   | \$16.78                   | \$201.41        |
| FastConsumer Worker (AGRO-16) | Co-located in API Fargate Task / 0.5 vCPU | Included in API          | Included in API           | $0.00           |
| PostgreSQL + PostGIS (EC2)    | 1 t4g.small / t3.small, 30 GB gp3 EBS  | \$8.10                   | \$14.20                   | \$170.40        |
| Data Lake (S3 Standard)       | 50 GB storage, 100k GET/PUTs           | \$0.85                   | \$1.69                    | \$20.28         |
| S3 Database Backups           | 30 GB storage Standard                 | \$0.35                   | \$0.69                    | \$8.28          |
| Amazon ECR                    | 3 GB image storage                     | \$0.30                   | \$0.30                    | \$3.60          |
| Amazon CloudWatch             | 5 GB logs, 10 metric alarms            | \$2.00                   | \$3.52                    | \$42.27         |
| AWS Secrets Manager           | 6 secrets, 10k API requests            | \$2.45                   | \$2.45                    | \$29.40         |
| \# TOTAL MONTHLY ESTIMATE\*\* | **Tutor-Optimized Architecture**       | **\$64.32**              | **\$162.72**              | \*\*\$1,952.64  |

:::note Estimate vs. current deployment (2026-10-31)

This table is the design-time estimate and has not been recalculated. As
of 2026-10-31 the Airflow, PySpark, RabbitMQ and FastConsumer lines are
**not yet deployed**, and the PostgreSQL EC2 instance actually used is a
**t3.micro** (currently stopped). See
[Current Project Status](../getting-started/current-status.md).

:::

## 4.1 Minimum Viable Cost Scenario (~\$35.00 USD/month) — Deliverable E-15

> **Recalculated on 2026-11-02:** the staging environment as deployed costs \$68.02 USD/month with everything stopped; this scenario is only reached by deleting the NAT Gateway and the ALB while idle (\$7.79 USD/month). See [AGRO-12, Section 3.3](./agro12-aws-cost-analysis-and-budget-alarms.md#33-fixed-cost-levers-for-staging-not-in-the-first-version).

**Cost Reduction Strategy:** To address extreme budgetary constraints
during early cooperative pilot phases, a Minimum Viable Cost Scenario
was formulated reducing monthly spend to ~\$35.00 USD/month through 4
specific cost-saving levers:

- **1. Scheduled Resource Auto-Shutdown:** EventBridge automated
  shutdown of Dev EC2 (t3.small) and ECS Fargate replicas outside
  working hours (18:00 to 08:00 & weekends), cutting compute expenses by
  65%.
- **2. Serverless Scale-to-Zero:** Batch PySpark workers on Fargate only
  provision upon DAG execution and destroy immediately upon completion
  (15 min/day duration).
- **3. ARM Graviton2 Instances:** Adoption of Graviton2 ARM instances
  (EC2 t4g.small for PostgreSQL + PostGIS) providing a 20% price-performance gain over x86.
- **4. 100% Local Containerized Environment:** Consolidating local
  development onto Docker Compose, generating \$0.00 cloud cost during
  development phases.

# 5. AC-04: Task Alignment & Jira Backlog Structure (Sprints 1 & 2)

**Sprint Execution Roadmap:** In accordance with AC-04, the Product
Backlog was structured into 9 granular technical tasks across Sprint 1
and Sprint 2, fully estimated in Story Points and assigned in Jira.

| \# Task Key\*\* | Task Description & Objective                               | Aligned Architectural Component   | Points | \*\*Assignee |
| :-------------- | :--------------------------------------------------------- | :-------------------------------- | :----- | :----------- |
| AGRO-01         | End-to-End Logical Architecture & Base ADRs Registration   | Architecture & ADRs (E-01)        | 4      | LL           |
| AGRO-02         | Git Repository Setup, Code Standards & Onboarding Protocol | Governance & CI/CD (E-02)         | 1      | LL           |
| AGRO-03A        | Relational Data Model Design & PostGIS Schema Definition   | PostgreSQL on EC2 / PostGIS (E-01)| 4      | S            |
| AGRO-04A        | Data Seed Strategy, Defect Profiling & Synthetic Blueprint | Seed Data Generator (E-03)        | 3      | KM           |
| AGRO-05A        | Multi-Container Local Environment Architecture & Compose   | Docker Compose Stack (E-04)       | 2      | KM           |
| AGRO-05B        | Multi-Container Local Environment Integration Testing      | Local Stack / Healthchecks (E-04) | 3      | KM           |
| AGRO-04B        | Reproducible & Idempotent Data Seed Script Execution       | PostgreSQL / Seed Engine (E-03)   | 5      | KM           |
| AGRO-05C        | Configurable Data Quality Defect Injection Engine          | Data Quality Pipeline (E-03)      | 3      | LL           |
| AGRO-03B        | PostgreSQL ORM Entity Mapping & Alembic Migrations         | FastAPI / SQLAlchemy (E-05)       | 3      | S            |

# 6. Conclusion & Official Approval Sign-Off

**Final Summary:** The technical research, architecture proposal,
services stack inventory, infrastructure cost estimation, and sprint
task alignment for User Story US-01 have been successfully completed,
documented, and validated. The proposed cloud architecture fully
satisfies all business goals, functional rules, and cost constraints of
the AgroSense Café project.

> **✅ FINAL APPROVAL SIGN-OFF:** *US-01 STATUS: APPROVED FOR SPRINT
> EXECUTION. The project team is officially authorized to proceed with
> Sprint 1 and Sprint 2 execution in accordance with the structured
> Product Backlog and architectural roadmap.*
