---
sidebar_position: 10
title: Operational Runbook & FinOps Teardown (E-15 / CT-03 / CT-09)
---

# Operational Runbook, Disaster Recovery & FinOps Teardown (E-15)

| **Deliverable** | `E-15` — Operational Runbook, Startup/Shutdown SOP, Backup/Restore & FinOps Teardown |
| :--- | :--- |
| **Aligned Criteria** | `RNF-04` (Cooperative Cost Control), `CT-03` (Mandatory Tags & Post-Demo Teardown), `CT-05`, `CT-09` (Live CloudWatch Alarm) |
| **Source Scripts** | `infra/aws/nat-toggle.sh`, `infra/aws/teardown.sh`, `infra/aws/setup-alarms-ct09.sh`, `infra/aws/aws_ops.py` |

---

## 1. Recovery Objectives & Architecture Overview

- **RTO (Recovery Time Objective):** $< 60\text{ minutes}$ for `agrosense-api-service`, `agrosense-broker`, and EC2 PostGIS (`i-0ee2594ccbe4f06c3`).
- **RPO (Recovery Point Objective):** $< 15\text{ minutes}$ of telemetry data loss via durable RabbitMQ queues on Amazon EFS (`fs-06d46462d0c634895`) and S3 Bronze (`s3://datalakeagrosense/raw/iot_telemetry/`).

---

## 2. Standard Operating Procedures: Cold Boot & Demo Startup

### 2.1 Local Environment Startup (`CT-01`)
```bash
cp .env.example .env
docker compose up -d db broker
docker compose exec -T db pg_isready -U agrosense -d agrosense_db
uv run alembic upgrade head
docker compose up -d api telemetry-consumer airflow
curl -s -f http://localhost:8000/health
```

### 2.2 AWS Demo Environment Startup (`us-east-2`)
```bash
# 1. Recreate NAT Gateway + Elastic IP and update agrosense-private-rt
./infra/aws/nat-toggle.sh up

# 2. Start EC2 PostGIS database instance and sync private IP to Secrets Manager
aws ec2 start-instances --instance-ids i-0ee2594ccbe4f06c3 --region us-east-2
./infra/aws/update-db-host-secrets.sh

# 3. Scale up RabbitMQ broker and FastAPI + Telemetry Consumer on ECS Fargate
aws ecs update-service --cluster agrosense-cluster --service agrosense-broker --desired-count 1 --region us-east-2
aws ecs update-service --cluster agrosense-cluster --service agrosense-api-service --desired-count 1 --region us-east-2

# 4. Run CA-09 smoke test (verifies 403 foreign batch, 404 nonexistent, 200 own batch + audit log)
./infra/aws/ca09-smoke-test.sh
```

---

## 3. FinOps Cost Control & Post-Sustentación Teardown (`CT-03`)

To prevent idle charges (~$1.20 USD/day from NAT Gateway + EIP) and satisfy the rubric's post-demo teardown requirement (**-10% penalty if active resources remain**):

```bash
# 1. Pause mode (between team working sessions):
#    Scales ECS services to 0, stops EC2 i-0ee2594ccbe4f06c3, deletes NAT Gateway & releases EIP
./infra/aws/teardown.sh pause

# 2. Verify mode (audits all EC2, ECS, NAT, EIP, ALB, EFS and 100% CT-03 tag compliance):
./infra/aws/teardown.sh verify

# 3. Full Destroy mode (post-sustentación final cleanup):
CONFIRM_DESTROY=yes ./infra/aws/teardown.sh destroy
```

---

## 4. Live CloudWatch Operational Alarms Demo (`CT-09`)

Three operational CloudWatch alarms are wired to SNS topic `arn:aws:sns:us-east-2:245908835315:agrosense-operational-alerts`:
1. `agrosense-api-alb-5xx-alarm` (`AWS/ApplicationELB` `HTTPCode_Target_5XX_Count >= 1`)
2. `agrosense-api-unhealthy-hosts-alarm` (`AWS/ApplicationELB` `UnHealthyHostCount >= 1`)
3. `agrosense-dlq-messages-alarm` (`AgroSense/Messaging` `DLQMessageCount >= 1`)

During the live demonstration, execute:
```bash
# Inject controlled DLQ anomaly (DLQMessageCount = 5) and fire alarm in real time
./infra/aws/setup-alarms-ct09.sh trigger-demo

# Restore alarm state to OK after demonstration
./infra/aws/setup-alarms-ct09.sh reset-demo
```

---

## 5. Backup & Disaster Recovery (`Tema #7`)

1. **PostgreSQL Logical Backup (`pg_dump`) & Restore (`pg_restore`):**
   ```bash
   pg_dump -h "${DB_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --compress=9 --file=/tmp/agrosense.dump
   aws s3 cp /tmp/agrosense.dump s3://datalakeagrosense/backups/postgres/latest.dump --sse AES256
   pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner /tmp/agrosense.dump
   ```
2. **S3 Medallion Lifecycle Rules (`datalakeagrosense`):**
   - `raw/`: `STANDARD_IA` (30d) $\rightarrow$ `GLACIER` (90d) $\rightarrow$ Expiration (365d).
   - `silver/`: `STANDARD_IA` (60d) $\rightarrow$ `GLACIER` (180d) $\rightarrow$ Expiration (730d).
   - `gold/`: `STANDARD_IA` (90d).
