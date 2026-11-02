# User Story Deliverable: AGRO-12 (SCRUM-31)

**Cost Analysis, Financial Justification in AWS Pricing Calculator, Savings Plans/RI Optimization & AWS Budget Alarms**

| **Project Target Organization** | AgroSense Coffee Cooperative (1,300 Member Farms, 300 Pilot IoT Farms) |
| :--- | :--- |
| **User Story & Jira Keys** | `SCRUM-31` (`AGRO-12`): Cost Analysis and Justification in AWS Pricing Calculator |
| **Subtasks Covered** | `SCRUM-135` (Prod vs Dev Cost Modeling), `SCRUM-136` (Savings Plans & RI Optimization Report), `SCRUM-137` (AWS Budgets & Cost Explorer Alarms) |
| **Trazable Deliverables** | **E-07** (AWS Pricing Calculator Analysis), **E-15** (Minimum Viable Cost Scenario), **RNF-04** & **CT-05** |
| **Responsible Architect** | Keiner Martínez |

> **Recalculated on 2026-11-02.** All unit prices in this document come from the **AWS Price List API** (`aws pricing get-products`, on-demand, region `us-east-2`) and the **Savings Plans API** (`aws savingsplans describe-savings-plans-offering-rates`). Actual spend comes from **AWS Cost Explorer** (record type `Usage`, before credits). The first version of this deliverable priced Amazon RDS and AWS Lambda, which are not part of the architecture; [Section 6](#6-difference-from-the-initial-estimate) compares both versions.

---

## 1. Executive Summary & Financial Compliance (RNF-04, CT-05)

| Scenario | USD/month | USD/year | What it is |
| :--- | ---: | ---: | :--- |
| **Full Production (24/7)** | **$254.21** | **$3,050.52** | Target architecture of Section 2 at on-demand prices (~$0.20 USD/farm/month for 1,300 farms). |
| **Optimized Production (Savings Plan + RI + S3 lifecycle)** | **$215.65** | **$2,587.80** | Section 3. Saves $38.56/month (15.2%). |
| **Staging as deployed, everything stopped** | **$68.02** | $816.24 | Fixed cost of the resources that exist today even with 0 tasks and the database stopped. |
| **Staging as deployed, compute 220 h/month** | **$81.17** | $974.04 | Same resources, API + broker + database running ~10 h/day on weekdays. |
| **Staging as deployed, 24/7** | **$111.65** | $1,339.80 | Same resources running all month. |
| **Actual bill, October 2026** | **$40.28** | — | Resources existed from 2026-10-20/21 (about 11 days); fully covered by AWS credits. |

The **Minimum Viable Cost** scenario (E-15, ~$35.00/month in the first estimate) is **below the fixed cost of the current staging environment** ($68.02/month): NAT Gateway, Application Load Balancer and public IPv4 addresses alone cost **$60.23/month** while everything is stopped. Reaching E-15 requires deleting the NAT Gateway and the ALB while staging is idle (Section 3.3).

---

## 2. Production vs. Staging Cost Modeling (SCRUM-135 — AC-01 & AC-02)

### 2.1 Unit prices used (`us-east-2`, on-demand)

| Item | Price | Item | Price |
| :--- | ---: | :--- | ---: |
| NAT Gateway hour | $0.045 | Fargate vCPU-hour (x86) | $0.04048 |
| NAT Gateway data processed (GB) | $0.045 | Fargate GB-hour (x86) | $0.004445 |
| Public IPv4 address hour | $0.005 | Fargate vCPU-hour / GB-hour (ARM) | $0.03238 / $0.00356 |
| ALB hour | $0.0225 | EC2 `t3.micro` / `t3.small` / `t4g.small` hour | $0.0104 / $0.0208 / $0.0168 |
| ALB LCU-hour | $0.008 | EBS `gp3` GB-month | $0.08 |
| Secrets Manager secret-month | $0.40 | S3 Standard GB-month (first 50 TB) | $0.023 |
| Secrets Manager 10,000 API calls | $0.05 | S3 Glacier Instant Retrieval GB-month | $0.004 |
| ECR storage GB-month | $0.10 | EFS Standard GB-month | $0.30 |
| CloudWatch Logs ingestion (GB) | $0.50 | CloudWatch Logs storage GB-month | $0.03 |
| CloudWatch alarm-month | $0.10 | | |

Fargate Spot is **not** published in the Price List API (its price varies); it is not used in any total of this document.

### 2.2 Full Production (24/7 — 730 h/month)

| # | AWS Service Component | Production Sizing | Prod Cost (USD/mo) | Annual (USD) |
| :-: | :--- | :--- | ---: | ---: |
| 1 | **Public IPv4 Addresses** | 3 in use (2 ALB + 1 NAT) × 730 h | $10.95 | $131.40 |
| 2 | **NAT Gateway** | 1 × 730 h + 20 GB processed | $33.75 | $405.00 |
| 3 | **Application Load Balancer** | 1 ALB × 730 h + 0.04 LCU average | $16.66 | $199.92 |
| 4 | **FastAPI (ECS Fargate)** | 2 tasks × 0.5 vCPU / 1 GB | $36.04 | $432.48 |
| 5 | **Apache Airflow (ECS Fargate)** | 3 tasks × 1 vCPU / 2 GB | $108.12 | $1,297.44 |
| 6 | **Apache PySpark (ECS Fargate)** | 1 run/day × 1 h × 2 vCPU / 16 GB (30 h) | $4.56 | $54.72 |
| 7 | **RabbitMQ Broker (ECS Fargate + EFS)** | 1 task × 0.5 vCPU / 1 GB, as deployed (`agrosense-broker`) | $18.02 | $216.24 |
| 8 | **FastConsumer Worker (AGRO-16)** | Second container in the API task | Included in row 4 | $0.00 |
| 9 | **PostgreSQL + PostGIS (Amazon EC2, ADR-001)** | 1 `t4g.small` + 30 GB `gp3` (with `t3.small`: $17.58) | $14.66 | $175.92 |
| 10 | **S3 Data Lake (Medallion)** | 50 GB Standard | $1.15 | $13.80 |
| 11 | **S3 Database Backups** | 30 GB Standard | $0.69 | $8.28 |
| 12 | **Amazon ECR** | 3 GB of images | $0.30 | $3.60 |
| 13 | **Amazon CloudWatch** | 5 GB logs ingested and stored + 10 alarms | $3.65 | $43.80 |
| 14 | **AWS Secrets Manager** | 14 secrets (as in the account) + 10,000 calls | $5.65 | $67.80 |
| — | **TOTAL** | | **$254.21** | **$3,050.52** |

Sizing is the same as in the first estimate, except: row 7 uses the broker as deployed (Fargate) instead of a `t3.small` EC2 instance; row 9 uses EC2 instead of Amazon RDS; row 14 uses the 14 secrets that exist instead of 6. Rows 5 and 6 assume Airflow and PySpark run as sized above; see [Current Project Status](../getting-started/current-status.md) for what is deployed.

### 2.3 Staging as deployed today

Inventory read from the account on 2026-11-02:

| Resource | Deployed sizing | Stopped (USD/mo) | Compute 220 h (USD/mo) | 24/7 (USD/mo) |
| :--- | :--- | ---: | ---: | ---: |
| NAT Gateway `nat-0649e5d6674419876` | 1 × 730 h (always on) | $32.85 | $32.85 | $32.85 |
| Application Load Balancer `agrosense-alb` | 1 × 730 h (always on) | $16.43 | $16.43 | $16.43 |
| Public IPv4 | 3 (2 ALB + 1 NAT) | $10.95 | $10.95 | $10.95 |
| Secrets Manager | 14 secrets | $5.60 | $5.60 | $5.60 |
| EBS `gp3` (database volume) | 20 GB | $1.60 | $1.60 | $1.60 |
| CloudWatch alarms | 4 | $0.40 | $0.40 | $0.40 |
| ECR `agrosense-api` | 16 images, 1.94 GB | $0.19 | $0.19 | $0.19 |
| ECS `agrosense-api-service` | 1 task × 0.5 vCPU / 1 GB (`agrosense-api:24`) | $0.00 | $5.43 | $18.02 |
| ECS `agrosense-broker` | 1 task × 0.5 vCPU / 1 GB | $0.00 | $5.43 | $18.02 |
| EC2 `agrosense-db-server` | `t3.micro` | $0.00 | $2.29 | $7.59 |
| S3, EFS, CloudWatch Logs | < 1 MB stored | ~$0.00 | ~$0.00 | ~$0.00 |
| **TOTAL** | | **$68.02** | **$81.17** | **$111.65** |

NAT data processing, ALB LCUs, Athena and Glue are usage-based and are not included; in October 2026 they cost $0.10, under $0.05 and $0.33.

### 2.4 Actual bill (AWS Cost Explorer, before credits)

| Usage type | Oct 2026 (USD) | Nov 1–2, 2026 (USD) |
| :--- | ---: | ---: |
| `USE2-NatGateway-Hours` + `USE2-RegionalNatGateway-Hours` | $17.68 | $0.49 |
| `USE2-LoadBalancerUsage` | $6.23 | $0.25 |
| `USE2-PublicIPv4:InUseAddress` + `IdleAddress` | $5.50 | $0.17 |
| `USE2-Fargate-vCPU-Hours` + `USE2-Fargate-GB-Hours` | $6.38 | $0.19 |
| `USE2-AWSSecretsManager-Secrets` | $1.63 | $0.07 |
| `USE2-BoxUsage:t3.micro` | $1.39 | $0.06 |
| `USE2-EBS:VolumeUsage.gp3` | $0.77 | — |
| Glue, Athena, S3 requests, NAT bytes | $0.70 | $0.13 |
| **TOTAL** | **$40.28** | **$1.36** |

The net bill was $0.00: AWS credits covered all usage. 73% of October's spend (NAT, ALB, public IPv4) is fixed cost that does not depend on whether the API runs.

---

## 3. Cost Optimization Report: Savings Plans, Reserved Instances & Lifecycle Policies (SCRUM-136 — AC-03)

### 3.1 Compute Savings Plans, Reserved Instances and S3 lifecycle

Rates: Compute Savings Plan **1 year, No Upfront**, `us-east-2`: $0.032384 per vCPU-hour and $0.003556 per GB-hour (20% below on-demand). EC2 Standard Reserved Instance **1 year, No Upfront**, `t4g.small` Linux: $0.0105 per hour (37.5% below on-demand).

| Optimization Mechanism | Target Services | Baseline On-Demand (USD/mo) | Discount | Optimized (USD/mo) | Monthly Savings |
| :--- | :--- | ---: | :---: | ---: | ---: |
| **1-Year Compute Savings Plan (No Upfront)** | Fargate 24/7: API (row 4) + Airflow (row 5) + broker (row 7) = 4.5 vCPU / 9 GB | $162.18 | 20% | $129.74 | **-$32.44** |
| **1-Year EC2 Reserved Instance (No Upfront)** | PostgreSQL `t4g.small` (row 9, instance only) | $12.26 | 37.5% | $7.67 | **-$4.60** |
| **S3 Lifecycle to Glacier Instant Retrieval** | Data lake + backups (rows 10–11), upper bound if all objects are older than 30 days | $1.84 | 82.6% | $0.32 | **-$1.52** |
| **Fargate Spot** | PySpark (row 6) | $4.56 | Not published | — | Not quantified |
| **Combined Optimized Production** | **All Production Services** | **$254.21** | **15.2%** | **$215.65** | **-$38.56/mo** |

Annual: from **$3,050.52** to **$2,587.80** (**$462.72** saved). A 3-year No Upfront Savings Plan ($0.022264 per vCPU-hour, $0.00244475 per GB-hour) would lower the Fargate baseline to $89.20/month (-45%), but commits the cooperative for 3 years.

The first version of this table projected 32.4% ($86.06/month) of savings. That figure assumed ~28% for the Savings Plan, ~34% for RIs on two EC2 instances and ~68% for Fargate Spot; the published 1-year No Upfront rates are lower, the broker now runs on Fargate (covered by the Savings Plan, not by an RI), and Spot is not priced.

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

The deployed data lake is a single bucket, `datalakeagrosense`, with prefixes instead of the three buckets named above.

### 3.3 Fixed-cost levers for staging (not in the first version)

| Lever | Monthly savings | Trade-off |
| :--- | ---: | :--- |
| Delete the NAT Gateway (and its public IPv4) while staging is stopped; recreate it before tests | $36.50 | Fargate tasks in private subnets lose internet access (ECR pulls, NASA POWER / Open-Meteo) until it is recreated. The S3 gateway endpoint already exists. |
| Replace the NAT Gateway with VPC interface endpoints for ECR, Secrets Manager and CloudWatch Logs | Depends on the number of endpoints | Each interface endpoint is billed per AZ-hour; Airflow still needs internet access for NASA POWER and Open-Meteo. |
| Delete the ALB (and its 2 public IPv4) while staging is stopped | $23.73 | The public URL changes when it is recreated. |

With both deletions, stopped staging costs **$7.79/month** (secrets, EBS, alarms, ECR), which is below the E-15 target of ~$35.00/month.

---

## 4. AWS Budgets & Cost Explorer Alarms Configuration (SCRUM-137)

To prevent unexpected billing spikes (e.g., runaway NAT Gateway data processing or infinite retry loops in Airflow/Simulators), two cost budgets are configured in **AWS Budgets**:

### 4.1 Budget Threshold Matrix

| Budget Name | Environment Scope | Monthly Cap (USD) | Alert 1: High Usage (80% Actual) | Alert 2: Forecasted Breach (100% Forecasted) | Notification Channel |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `agrosense-staging-monthly-budget` | Staging as deployed (Section 2.3, $68.02–$111.65/mo) | **$120.00** | $96.00 USD | $120.00 USD (Forecast) | Email |
| `agrosense-prod-monthly-budget` | Full Production (`$254.21/mo`) | **$260.00** | $208.00 USD | $260.00 USD (Forecast) | Email |

> **Status (2026-11-02):** before this recalculation **no budget existed in the account**, although the first version of this section described them as established. The two budgets above were created on 2026-11-02 with the commands below. Both cover the whole account, because staging and production are not separated by cost allocation tags yet.

### 4.2 Reproducible AWS CLI Provisioning for Budget Alarms

```bash
# 1. Production monthly cost budget ($260.00 USD cap covering the $254.21/mo baseline)
aws budgets create-budget \
  --account-id "${AWS_ACCOUNT_ID}" \
  --budget '{
    "BudgetName": "agrosense-prod-monthly-budget",
    "BudgetLimit": { "Amount": "260.00", "Unit": "USD" },
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

# 2. Staging monthly cost budget ($120.00 USD cap covering staging 24/7, $111.65/mo)
aws budgets create-budget \
  --account-id "${AWS_ACCOUNT_ID}" \
  --budget '{
    "BudgetName": "agrosense-staging-monthly-budget",
    "BudgetLimit": { "Amount": "120.00", "Unit": "USD" },
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
```

---

## 5. Financial Review Approval Sign-Off (AC-04)

> **FINANCIAL & ARCHITECTURAL SIGN-OFF (`AGRO-12` / `SCRUM-31`), recalculated 2026-11-02:**
> - **AC-01 (`E-07`):** Production architecture at **$254.21 USD/month** (on-demand list prices, `us-east-2`).
> - **AC-02 (`Staging vs. Prod`):** Staging as deployed costs **$68.02** (stopped), **$81.17** (220 h of compute) and **$111.65** (24/7) per month; actual October 2026 usage was **$40.28** (covered by credits).
> - **AC-03 (`E-15` & FinOps):** Savings Plan + RI + S3 lifecycle reduce production to **$215.65/month** (15.2%, **$462.72/yr**). E-15 (~$35.00/month) is only reachable by deleting the NAT Gateway and the ALB while idle (Section 3.3).
> - **AC-04 (`Budget Governance`):** AWS Budgets alarms at 80% actual and 100% forecasted, created on 2026-11-02 (Section 4).

---

## 6. Difference from the initial estimate

| Item | Initial estimate | Recalculated (2026-11-02) | Reason |
| :--- | ---: | ---: | :--- |
| Production total | $265.45/mo | $254.21/mo | The initial total included Amazon RDS `db.t4g.small` ($26.81) and AWS Lambda ($0.60), which are not in the architecture (ADR-001: PostgreSQL on EC2; FastConsumer on ECS). The sum of its own rows was $252.24. |
| PostgreSQL | $14.20 (row) / $26.81 (RDS, in the total) | $14.66 | EC2 `t4g.small` + 30 GB `gp3` at list price. |
| RabbitMQ | $16.78 (`t3.small` EC2 + 20 GB) | $18.02 | Deployed on Fargate (0.5 vCPU / 1 GB) with data on EFS. |
| PySpark | $7.09 | $4.56 | 30 h × (2 vCPU + 16 GB) at list price. |
| Secrets Manager | $2.45 (6 secrets) | $5.65 (14 secrets) | The account has 14 secrets. |
| S3 data lake | $1.69 | $1.15 | 50 GB × $0.023 (requests not included). |
| CloudWatch | $3.52 | $3.65 | 5 GB × ($0.50 + $0.03) + 10 alarms. |
| Development environment | $48.00/mo (Fargate Spot, EventBridge schedules, VPC endpoints) | Replaced by staging as deployed: $68.02 / $81.17 / $111.65 | Fargate Spot is not priced in the Price List API, and the scheduled NAT/ALB of the initial model does not exist: NAT, ALB and public IPv4 run 24/7. |
| Minimum Viable Cost (E-15) | $35.00/mo | Not reachable with the current staging resources ($68.02 stopped); $7.79 stopped if NAT and ALB are deleted | Fixed cost of NAT + ALB + IPv4 ($60.23). |
| Optimized production | $179.39/mo (-32.4%) | $215.65/mo (-15.2%) | Published 1-year No Upfront rates (20% Savings Plan, 37.5% RI); Spot not priced. |
| AWS Budgets | Described as established | Created on 2026-11-02 | No budget existed in the account. |
