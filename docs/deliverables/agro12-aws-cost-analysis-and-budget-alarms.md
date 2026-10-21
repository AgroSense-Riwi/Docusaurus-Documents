# User Story Deliverable: AGRO-12 (SCRUM-31)

**Cost Analysis, Financial Justification in AWS Pricing Calculator, Savings Plans/RI Optimization & AWS Budget Alarms**

| **Project Target Organization** | AgroSense Coffee Cooperative (1,300 Member Farms, 300 Pilot IoT Farms) |
| :--- | :--- |
| **User Story & Jira Keys** | `SCRUM-31` (`AGRO-12`): Cost Analysis and Justification in AWS Pricing Calculator |
| **Subtasks Covered** | `SCRUM-135` (Prod vs Dev Cost Modeling), `SCRUM-136` (Savings Plans & RI Optimization Report), `SCRUM-137` (AWS Budgets & Cost Explorer Alarms) |
| **Trazable Deliverables** | **E-07** (AWS Pricing Calculator Analysis), **E-15** (Minimum Viable Cost Scenario), **RNF-04** & **CT-05** |
| **Responsible Architect** | Keiner Martínez |

---

## 1. Executive Summary & Financial Compliance (RNF-04, CT-05)

This deliverable consolidates the cloud financial modeling (**FinOps**) for the AgroSense Café platform across three operating tiers:

1. **Full Production Architecture (`Prod` — 24/7 HA):** **$265.45 USD/month** ($3,185.40 USD/year), supporting 1,300 coffee farms (~$0.20 USD/farm/month) and 900 active IoT sensors.
2. **Optimized Development Environment (`Dev` — Scheduled Off-Hours & Shared Compute):** **$48.00 USD/month** ($576.00 USD/year), achieved via automated EventBridge off-hour shutdowns (10h/day, 5 days/week = ~220h/month active vs. 730h/month) and Fargate Spot compute.
3. **Minimum Viable Cost Scenario (`MVC` — Early Cooperative Pilot, Deliverable E-15):** **$35.00 USD/month** ($420.00 USD/year), consolidating local development onto Docker Compose ($0 cloud dev spend) and running single-task ARM64/Spot cloud staging.

---

## 2. Production vs. Development Cost Modeling (SCRUM-135 — AC-01 & AC-02)

The table below contrasts the **Production (24/7 On-Demand)** estimate from AWS Pricing Calculator against the **Development (Scheduled Off-Hour Shutdown & Shared Resources)** model:

| # | AWS Service Component | Production Sizing (24/7 — 730 hrs/mo) | Development Sizing (Scheduled 220 hrs/mo + Spot) | Dev Cost (USD/mo) | Prod Cost (USD/mo) | Annual Prod (12-Mo USD) |
| :-: | :--- | :--- | :--- | ---: | ---: | ---: |
| 1 | **Public IPv4 Addresses** | 3 Public IPv4 in use (ALB + NAT) | 1 Public IPv4 (Single-AZ shared) | $1.10 | $10.95 | $131.40 |
| 2 | **NAT Gateway** | 1 Regional NAT Gateway (730h + data) | Scheduled / VPC Endpoints for S3 & ECR | $4.50 | $33.75 | $405.00 |
| 3 | **Application Load Balancer** | 1 ALB (730h) + LCU processing | 1 ALB (Scheduled during active dev sprints) | $5.20 | $16.66 | $199.92 |
| 4 | **FastAPI (ECS Fargate)** | 2 tasks, 0.5 vCPU, 1 GB RAM (24/7) | 1 task, 0.25 vCPU, 0.5 GB RAM (Fargate Spot, 220h) | $3.85 | $36.04 | $432.48 |
| 5 | **Apache Airflow (ECS Fargate)** | 3 tasks, 2 GB RAM, 20 GB ephemeral | 2 tasks (Scheduler+Web), Fargate Spot (220h) | $14.20 | $108.12 | $1,297.44 |
| 6 | **Apache PySpark (ECS Fargate)** | 1 task/day, 1 hr, 2 vCPU, 16 GB RAM | On-demand test runs (15 min/day, Fargate Spot) | $0.85 | $7.09 | $85.08 |
| 7 | **RabbitMQ Broker** | 1 `t3.small` EC2 / Fargate (24/7, 20 GB) | 1 `t4g.micro` / Fargate Spot (Scheduled 220h) | $3.40 | $16.78 | $201.41 |
| 8 | **AWS Lambda (Ingestion)** | 4M invocations/mo, 512 MB RAM | 500k invocations/mo (Free Tier covered) | $0.00 | $0.60 | $7.20 |
| 9 | **PostgreSQL + PostGIS (RDS/EFS)** | `db.t4g.small`, 30 GB `gp3` SSD (24/7) | `db.t4g.micro` / EFS Container (Scheduled 220h) | $9.80 | $26.81 | $321.72 |
| 10 | **S3 Data Lake (Medallion)** | 50 GB Standard (`raw`, `trusted`, `refined`) | 15 GB Standard + Intelligent-Tiering | $0.45 | $1.69 | $20.28 |
| 11 | **S3 Database Backups** | 30 GB Standard + Glacier transition | 10 GB Standard backups | $0.25 | $0.69 | $8.28 |
| 12 | **Amazon ECR** | 3 GB private container images | Shared repository with lifecycle policy (keep 5) | $0.30 | $0.30 | $3.60 |
| 13 | **Amazon CloudWatch** | 5 GB logs, 10 metric alarms | 2 GB logs (7-day retention), 3 alarms | $1.65 | $3.52 | $42.27 |
| 14 | **AWS Secrets Manager** | 6 secrets, 10k API calls/month | 6 shared secrets | $2.45 | $2.45 | $29.40 |
| — | **TOTAL MONTHLY ESTIMATE** | **Full Production (24/7 High Availability)** | **Scheduled Dev Environment (~70% Compute Off)** | **$48.00** | **$265.45** | **$3,185.40** |

---

## 3. Cost Optimization Report: Savings Plans, Reserved Instances & Lifecycle Policies (SCRUM-136 — AC-03)

To further optimize long-term expenditure for the coffee cooperative once the 300-farm pilot transitions into permanent operation, we evaluated four structural FinOps levers:

### 3.1 Compute Savings Plans vs. Reserved Instances vs. Fargate Spot

| Optimization Mechanism | Target Services | Baseline On-Demand (USD/mo) | Discount Rate | Optimized Cost (USD/mo) | Monthly Savings | Trade-Off & Architectural Justification |
| :--- | :--- | ---: | :---: | ---: | ---: | :--- |
| **1-Year Compute Savings Plan (No Upfront)** | ECS Fargate (`FastAPI` + `Airflow` 24/7 baseline) | $144.16 | **~28%** | $103.80 | **-$40.36** | Applies automatically across ECS Fargate and Lambda regardless of region or OS/CPU architecture (`x86` or `ARM64`). Ideal for the steady 24/7 API and Airflow Scheduler baseline. |
| **Fargate Spot Capacity Provider** | ECS Fargate (`PySpark` Batch Jobs + `Airflow` Workers) | $43.13 | **~68%** | $13.80 | **-$29.33** | PySpark windowing jobs (`RN-03..RN-07`) and Airflow Celery workers are stateless and idempotent (`CT-06`), making them 100% fault-tolerant to 2-minute Spot interruption notices. |
| **1-Year RDS & EC2 Reserved Instances (`t4g`/`t3`)** | PostgreSQL (`db.t4g.small`) + RabbitMQ (`t3.small`) | $43.59 | **~34%** | $28.77 | **-$14.82** | Locks in database and broker instance families for 12 months. Recommended only after completing Month 3 of production telemetry sizing. |
| **S3 Lifecycle Transition to Glacier Instant Retrieval** | S3 Data Lake (`raw/` Bronze & `S3 Backups`) | $2.38 | **~65%** | $0.83 | **-$1.55** | Raw JSON telemetry payloads (`s3://agrosense-raw/`) are compacted into Parquet in `trusted/` within 24h; transitioning `raw/` objects older than 30 days to **S3 Glacier Instant Retrieval** cuts storage cost from $0.023/GB to $0.004/GB. |
| **Combined FinOps Optimized Production** | **All Production Services** | **$265.45** | **~32.4%** | **$179.39** | **-$86.06/mo** | Reduces annual cooperative cloud spend from **$3,185.40/yr** to **$2,152.68/yr** ($1,032.72 annual savings) without sacrificing SLA (`RNF-03`). |

### 3.2 S3 Medallion Lifecycle Policy Specification

- **`agrosense-raw` (Bronze Layer):**
  - Days `0–30`: `S3 Standard` (hot access for daily PySpark reprocessing and backfill).
  - Days `31–365`: Transition to `S3 Glacier Instant Retrieval` ($0.004/GB/month).
  - Day `365+`: Transition to `S3 Glacier Deep Archive` ($0.00099/GB/month) for 5-year regulatory audit retention.
- **`agrosense-trusted` (Silver Layer — Snappy Parquet):**
  - Days `0–90`: `S3 Standard`.
  - Day `91+`: `S3 Intelligent-Tiering`.
- **`agrosense-refined` (Gold Layer — Star Schema for Power BI):**
  - Kept in `S3 Standard` (< 5 GB compacted dimensional tables) to guarantee sub-second Athena/Power BI queries.

---

## 4. AWS Budgets & Cost Explorer Alarms Configuration (SCRUM-137)

To prevent unexpected billing spikes (e.g., runaway NAT Gateway data processing or infinite retry loops in Airflow/Simulators), three threshold alarms are configured in **AWS Budgets** and **AWS Cost Explorer Anomaly Detection**:

### 4.1 Budget Threshold Matrix

| Budget Name | Environment Scope | Monthly Cap (USD) | Alert 1: Early Warning (50% Actual) | Alert 2: High Usage (80% Actual) | Alert 3: Forecasted Breach (100% Forecasted) | Notification Channel |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `agrosense-dev-monthly-budget` | Development / Staging (`~$48.00/mo`) | **$50.00** | $25.00 USD | $40.00 USD | $50.00 USD (Forecast) | Email + SNS (`agrosense-finops-alerts`) |
| `agrosense-prod-monthly-budget` | Full Production (`$265.45/mo`) | **$270.00** | $135.00 USD | $216.00 USD | $270.00 USD (Forecast) | Email + SNS (`agrosense-finops-alerts`) |

### 4.2 Reproducible AWS CLI Provisioning for Budget Alarms

```bash
# 1. Create Production Monthly Cost Budget ($270.00 USD cap covering the $265.45/mo baseline)
aws budgets create-budget \
  --account-id "${AWS_ACCOUNT_ID}" \
  --budget '{
    "BudgetName": "agrosense-prod-monthly-budget",
    "BudgetLimit": { "Amount": "270.00", "Unit": "USD" },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80.0,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "keinermb01@gmail.com" }]
    },
    {
      "Notification": {
        "NotificationType": "FORECASTED",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 100.0,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "keinermb01@gmail.com" }]
    }
  ]'

# 2. Create Development Monthly Cost Budget ($50.00 USD cap covering the ~$48.00/mo Dev model)
aws budgets create-budget \
  --account-id "${AWS_ACCOUNT_ID}" \
  --budget '{
    "BudgetName": "agrosense-dev-monthly-budget",
    "BudgetLimit": { "Amount": "50.00", "Unit": "USD" },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80.0,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "keinermb01@gmail.com" }]
    }
  ]'
```

---

## 5. Financial Review Approval Sign-Off (AC-04)

> **✅ FINANCIAL & ARCHITECTURAL SIGN-OFF (`AGRO-12` / `SCRUM-31`):**
> - **AC-01 (`E-07`):** Production architecture verified at **$265.45 USD/month**.
> - **AC-02 (`Dev vs. Prod`):** Development environment modeled at **$48.00 USD/month** via EventBridge off-hour scheduling and Fargate Spot.
> - **AC-03 (`E-15` & FinOps):** Minimum Viable Cost scenario (**$35.00 USD/month**) and Savings Plans / RI / Fargate Spot / S3 Glacier trade-offs documented, projecting **32.4% ($1,032.72/yr)** in post-pilot savings.
> - **AC-04 (`Budget Governance`):** AWS Budgets alarms established at 80% actual and 100% forecasted thresholds.
