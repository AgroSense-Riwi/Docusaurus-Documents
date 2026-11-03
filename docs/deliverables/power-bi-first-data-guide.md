---
sidebar_label: Power BI first data
---

# Power BI: how to get the first data for the dashboard

**Scope:** `SCRUM-46` (`SCRUM-186`, `SCRUM-200`, `SCRUM-201`) and the gold layer of `SCRUM-184` / `SCRUM-185`.
**Status (2026-11-02):** the gold pipeline is implemented in the API repository ([PR #32](https://github.com/AgroSense-Riwi/API/pull/32), fixes #34, #36 and #38). The first run in AWS succeeded and the gold tables have data; see [Section 7](#7-verification).

This guide describes the path the data follows from the operational PostgreSQL database to a Power BI report, and the steps to load the first rows. It complements `docs/analytics/POWER_BI_ATHENA_DASHBOARDS.md` in the API repository; the differences with that document are listed in [Section 8](#8-differences-from-power_bi_athena_dashboardsmd).

---

## 1. Data path

```text
Database-seed (python -m seed)
        |
        v
PostgreSQL + PostGIS (EC2 agrosense-db-server) ......................+
        |                                                             :
        v                                                             : alternative:
Airflow DAG dag_gold_star_schema -> PySpark job                       : SSM port forwarding
        |                                                             : (Section 6)
        v                                                             :
S3 s3://datalakeagrosense/gold/<table>/ (Snappy Parquet)              :
        |                                                             :
        v                                                             :
Glue Data Catalog agrosense_datalake -> Amazon Athena (primary)       :
        |                                                             :
        v                                                             v
Power BI Desktop (Amazon Athena connector, ODBC DSN) <................+
```

| Step | Component | Where it is defined |
| :-- | :-- | :-- |
| 1 | Seed data in PostgreSQL (farms, deliveries, batches) | Database-seed repository, `python -m seed` |
| 2 | Gold star schema built with PySpark | API `pipelines/spark_jobs/gold_star_schema_pyspark.py` |
| 3 | Daily orchestration (06:00 UTC) | API `pipelines/airflow/dags/dag_gold_star_schema.py` |
| 4 | Airflow image (Airflow 3.3.2 + Java + PySpark 4.2.1) | API `infra/docker/airflow/Dockerfile`, published by `.github/workflows/build-airflow-image.yml` to ECR `agrosense-airflow` |
| 5 | Secrets, task definition, ECS service, Athena tables | API `infra/aws/setup-airflow.sh` |
| 6 | Athena tables over `s3://datalakeagrosense/gold/` | `ATHENA_GOLD_STAR_SCHEMA_DDL` in API `services/star_schema_gold.py` |

---

## 2. Gold tables available to Power BI

All four tables are in the Glue database **`agrosense_datalake`**, stored as Snappy Parquet under `s3://datalakeagrosense/gold/<table>/`. Each run of the DAG replaces the files of each table.

| Table | Grain | Columns | Source in PostgreSQL |
| :-- | :-- | :-- | :-- |
| `dim_finca` | One row per farm | `farm_id`, `farm_code`, `farm_name`, `municipality_name`, `altitude_meters`, `total_area_hectares`, `latitude`, `longitude` | `farms` + `producers.full_name` + `municipalities.name` |
| `dim_tiempo` | One row per day of every year with deliveries | `date_key` (`YYYYMMDD`), `full_date`, `year`, `month`, `day`, `quarter`, `day_of_week` (Monday = 1), `is_weekend` | Generated |
| `fact_entregas` | One row per harvest delivery | `delivery_id`, `date_key`, `farm_id`, `variety_id`, `delivered_weight_kg`, `is_organic`, `batch_id`, `batch_code` | `harvest_deliveries` + `farm_plots.variety_id` + `batch_farm_compositions` + `export_batches.batch_code` |
| `fact_alertas` | One row per agronomic alert | `alert_id`, `date_key`, `farm_id`, `alert_type`, `severity`, `alert_status`, `soil_moisture_mean_pct`, `precip_accum_72h_mm` | **Empty**: the `agronomic_alerts` table is still planned ([Dataset & Database Structure](../architecture-and-design/data_structure.md)) |

Columns that do not exist in the operational schema are written as NULL:

- `dim_finca.altitude_meters`: `farms` has no altitude.
- `dim_finca.farm_name`: `farms` has no name; the producer's `full_name` is used.
- `fact_entregas.is_organic`: there is no organic flag.
- If a delivery was split across several batches, `fact_entregas` keeps the batch with the largest `contributed_kg`.

Relationships for the Power BI model (star schema):

- `fact_entregas[farm_id]` → `dim_finca[farm_id]` (many to one)
- `fact_entregas[date_key]` → `dim_tiempo[date_key]` (many to one)
- `fact_alertas[farm_id]` → `dim_finca[farm_id]` and `fact_alertas[date_key]` → `dim_tiempo[date_key]`

---

## 3. Step 1: data in PostgreSQL

The database runs on the EC2 instance `agrosense-db-server` (`i-0ee2594ccbe4f06c3`, private subnet, private IP `10.0.3.10`). It is stopped when not in use:

```bash
aws ec2 start-instances --region us-east-2 --instance-ids i-0ee2594ccbe4f06c3
aws ec2 wait instance-status-ok --region us-east-2 --instance-ids i-0ee2594ccbe4f06c3
```

The tables must be migrated (`alembic upgrade head`, head `a9c4e6b2d8f1`) and loaded with the seed (`python -m seed` in the Database-seed repository). The dev profile produces 130 farms, at least 80 harvest deliveries and 10 export batches.

---

## 4. Step 2: build the gold layer

### 4.1 One-time setup (operator with AWS credentials)

```bash
cd API
./infra/aws/setup-airflow.sh
```

The script is idempotent. It creates the Airflow secrets that are missing (`agrosense/prod/airflow-fernet-key`, `airflow-api-secret`, `airflow-admin-user`, `airflow-admin-password`, `s3-bucket-raw`) with random values that are never printed. It also creates the ECR repository `agrosense-airflow`, the log group `/ecs/agrosense-airflow`, the four Athena tables, the task definition `agrosense-airflow` (1 vCPU / 4 GB) and the ECS service `agrosense-airflow` with 0 tasks.

### 4.2 First run

With the database running and the image published in ECR (workflow **Build Airflow image** on `main`):

```bash
RUN_GOLD_DAG=1 ./infra/aws/setup-airflow.sh
```

This starts a single Fargate task that runs `airflow db migrate && airflow dags test dag_gold_star_schema` and exits. It does not leave anything running. The logs are in CloudWatch under `/ecs/agrosense-airflow`, with the stream prefix `airflow/`. The task:

1. `build_gold_star_schema` reads PostgreSQL with `app.current_role = 'operator'`, because `export_batches` has `FORCE ROW LEVEL SECURITY` (RN-11). It then builds the four DataFrames with Spark (`local[2]`) and replaces `s3://datalakeagrosense/gold/<table>/`.
2. `validate_gold_star_schema` fails if `dim_finca` or `dim_tiempo` is empty or if a table has no Parquet file.

To schedule it daily, set the service to 1 task. This keeps Airflow running 24/7; see the cost in [AGRO-12](./agro12-aws-cost-analysis-and-budget-alarms.md):

```bash
aws ecs update-service --cluster agrosense-cluster --service agrosense-airflow --desired-count 1
```

### 4.3 Check the data in Athena

```sql
SELECT 'dim_finca' AS t, COUNT(*) AS n FROM agrosense_datalake.dim_finca
UNION ALL SELECT 'dim_tiempo', COUNT(*) FROM agrosense_datalake.dim_tiempo
UNION ALL SELECT 'fact_entregas', COUNT(*) FROM agrosense_datalake.fact_entregas
UNION ALL SELECT 'fact_alertas', COUNT(*) FROM agrosense_datalake.fact_alertas;
```

In the Athena console, use the workgroup `primary` and set the query result location to `s3://aws-athena-query-results-245908835315-us-east-2-lmkcawsu/`. The workgroup has no result location configured.

---

## 5. Step 3: connect Power BI Desktop to Athena

### 5.1 Read-only credentials

Do not use the root account or the deployment keys. Create an IAM user (or an IAM Identity Center role) for Power BI with read-only access. This policy covers only the gold prefix and the Athena results bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "athena:StartQueryExecution", "athena:GetQueryExecution", "athena:GetQueryResults",
        "athena:StopQueryExecution", "athena:GetWorkGroup", "athena:ListWorkGroups",
        "athena:ListDataCatalogs", "athena:ListDatabases", "athena:ListTableMetadata",
        "athena:GetTableMetadata"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["glue:GetDatabase", "glue:GetDatabases", "glue:GetTable", "glue:GetTables", "glue:GetPartitions"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::datalakeagrosense", "arn:aws:s3:::datalakeagrosense/gold/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": [
        "arn:aws:s3:::aws-athena-query-results-245908835315-us-east-2-lmkcawsu",
        "arn:aws:s3:::aws-athena-query-results-245908835315-us-east-2-lmkcawsu/*"
      ]
    }
  ]
}
```

The access keys of that user are entered only in the ODBC DSN on the analyst's computer. They must never be committed (CT-02).

### 5.2 ODBC DSN

1. Install the **Amazon Athena ODBC driver** (64-bit) from the AWS documentation.
2. In **ODBC Data Source Administrator (64-bit)** → **System DSN** → **Add** → Amazon Athena ODBC driver:
   - **Data Source Name:** `AgroSense_Athena_Gold`
   - **Region:** `us-east-2`
   - **Catalog:** `AwsDataCatalog`
   - **Database:** `agrosense_datalake`
   - **Workgroup:** `primary`
   - **S3 Output Location:** `s3://aws-athena-query-results-245908835315-us-east-2-lmkcawsu/`
   - **Authentication:** IAM Credentials (the read-only user of 5.1)
3. Use **Test** to check the connection.

### 5.3 Load the tables in Power BI Desktop

1. **Get Data** → **Amazon Athena** → DSN `AgroSense_Athena_Gold`.
2. Data connectivity mode:
   - **Import** for the first dashboard. The gold tables are small (a few hundred rows with the seed), and Athena is only queried on refresh.
   - **DirectQuery** when the facts grow. Every visual then runs an Athena query, billed per TB scanned.
3. In the Navigator, select `AwsDataCatalog` → `agrosense_datalake` → `dim_finca`, `dim_tiempo`, `fact_entregas` and `fact_alertas`. The data lake also contains `trusted_*` and `refined_*` tables; those are not part of the star schema.
4. In **Model view**, create the relationships of [Section 2](#2-gold-tables-available-to-power-bi). Mark `dim_tiempo` as a date table on `full_date`; change its type to Date in Power Query first.
5. First measures:

```dax
Delivered Kg = SUM ( fact_entregas[delivered_weight_kg] )
Deliveries = COUNTROWS ( fact_entregas )
Farms with Deliveries = DISTINCTCOUNT ( fact_entregas[farm_id] )
Batches = DISTINCTCOUNT ( fact_entregas[batch_code] )
Traced Kg = CALCULATE ( [Delivered Kg], NOT ISBLANK ( fact_entregas[batch_code] ) )
```

6. First visuals (Page 1, "Executive Farm Traceability & Harvest Volume"):
   - Cards: `Delivered Kg`, `Deliveries`, `Batches`.
   - Line chart: `Delivered Kg` by `dim_tiempo[year]` / `dim_tiempo[month]`.
   - Bar chart: top 10 `dim_finca[farm_code]` by `Delivered Kg`.
   - Map: `dim_finca[latitude]`, `dim_finca[longitude]`, size = `Delivered Kg`.

---

## 6. Alternative: import directly from PostgreSQL

Use this for tables that are not in the gold layer, such as `coffee_varieties` for variety names or `international_buyers`. The database has no public IP, so the connection goes through an SSM port-forwarding session. This requires the AWS CLI and the Session Manager plugin on the analyst's computer:

```bash
aws ssm start-session --region us-east-2 --target i-0ee2594ccbe4f06c3 \
  --document-name AWS-StartPortForwardingSession \
  --parameters portNumber=5432,localPortNumber=15432
```

In Power BI: **Get Data** → **PostgreSQL database**. Use server `localhost:15432`, the database name stored in `agrosense/prod/postgres-db`, and **Import** mode.

`export_batches`, `batch_farm_compositions` and the buyer tables have `FORCE ROW LEVEL SECURITY`. A role without `BYPASSRLS` gets no rows unless `app.current_role` is set, and the Power BI connector does not set it. For the first dashboard, prefer the Athena gold tables, where the extraction already ran as `operator`.

---

## 7. Verification

| Check | Result |
| :-- | :-- |
| CI of API PR #32: SparkSession tests (schema equal to the Athena DDL, `dim_tiempo` with ISO weekdays, Snappy Parquet, S3 prefix replacement) and extraction queries against the migrated database | Passed (203 passed) |
| Athena tables `dim_finca`, `dim_tiempo`, `fact_entregas`, `fact_alertas` created in `agrosense_datalake` on 2026-11-02 | Done |
| `./infra/aws/setup-airflow.sh` (secrets, task definition `agrosense-airflow:3`, service at 0) | Done on 2026-11-02 |
| First run, `RUN_GOLD_DAG=1` (Fargate task `8722b82a81d74f8ab7785316d0f27008`) | `exitCode=0`; both tasks `success`. Log: `Extracted 130 farms and 150 deliveries`, then `{'dim_finca': 130, 'dim_tiempo': 365, 'fact_entregas': 150, 'fact_alertas': 0}`. About 45 s from extraction to upload. |
| Files in `s3://datalakeagrosense/gold/` | One Snappy Parquet file per table: `dim_finca` 11,745 bytes, `dim_tiempo` 5,986, `fact_entregas` 15,450, `fact_alertas` 996 (schema only) |
| Athena query of Section 4.3 plus checks | `dim_finca` 130, `dim_tiempo` 365 (year 2026), `fact_entregas` 150, `fact_alertas` 0; 133,501 kg delivered; 130 farms with deliveries; 20 deliveries linked to 10 batches; 0 deliveries without a `dim_tiempo` row |

Two problems were found and fixed during the first runs. A partial secret ARN ending in `-secret` was read as the random suffix (`ResourceNotFoundException`, API PR #36). The secret `agrosense/prod/s3-bucket` does not contain `datalakeagrosense` (`NoSuchBucket`); `S3_BUCKET_GOLD` is now a plain environment variable (API PR #38).

---

## 8. Differences from `POWER_BI_ATHENA_DASHBOARDS.md`

| Topic | `POWER_BI_ATHENA_DASHBOARDS.md` | Actual |
| :-- | :-- | :-- |
| Athena result location | `s3://datalakeagrosense/athena-query-results/` | The workgroup `primary` has none configured; the existing bucket is `aws-athena-query-results-245908835315-us-east-2-lmkcawsu`. |
| Registration of the gold tables | `infra/aws/glue_athena_medallion_catalog.sql` | That file only registers `trusted_*` tables. The gold tables are created by `setup-airflow.sh` with `ATHENA_GOLD_STAR_SCHEMA_DDL`. |
| ODBC driver | Simba Amazon Athena ODBC Driver | AWS now distributes the Amazon Athena ODBC driver 2.x; the DSN fields are the same. |
| Page 1 visuals by variety (Castillo, Caturra, Geisha) | Variety names in the model | `fact_entregas` only has `variety_id`; names come from `coffee_varieties` (Section 6). |
| Page 2 (agronomic alerts) | Uses `fact_alertas` | `fact_alertas` is empty until `agronomic_alerts` exists. |
| Page 3 (water footprint) | Liters per kg exported | Not in the gold layer; `farms.water_usage_m3_ton` and `export_batches.weighted_water_m3_ton` are only in PostgreSQL. |
| Buyer RLS in Power BI with `[buyer_id] = USERNAME()` | On the gold tables | No gold table has `buyer_id`; buyer isolation (RN-11) is enforced only in PostgreSQL and in the API. |


---

## 9. All 8 Gold Tables & 6 Business Questions (E-11 / CT-10 / Section 13)

As of **2026-11-03**, all 8 Gold analytical tables in **`agrosense_datalake`** (`s3://datalakeagrosense/gold/`) are populated with Snappy Parquet files and ready for Power BI Desktop via Amazon Athena:

| Gold Table | Rows | Business Question Covered |
| :-- | :-- | :-- |
| `dim_finca` | 130 | Farm master dimension (`farm_id`, `farm_code`, `municipality_name`, `altitude_meters`, `total_area_hectares`, `latitude`, `longitude`) |
| `dim_tiempo` | 365 | Calendar dimension (`date_key` `YYYYMMDD`, `full_date`, `year`, `month`, `quarter`, `day_of_week`) |
| `fact_entregas` | 150 | Harvest deliveries (`delivered_weight_kg`, `variety_id`, `batch_code`) |
| `fact_alertas` | 38 | **Question 1:** Early detection of coffee leaf rust (`ROY_RISK`) and water stress (`WATER_STRESS`) across municipalities (`soil_moisture_mean_pct`, `precip_accum_72h_mm`) |
| `fact_visitas_agronomicas` | 1,300 | **Questions 2 & 6:** Productivity impact before/after NPK fertilization (`yield_kg_ha_before`, `yield_kg_ha_after`, `yield_delta_pct`) and agronomist SLA coverage (`days_since_prev_visit`, `alert_response_hours`) |
| `fact_iot_vs_satelite` | 300 | **Question 3:** In-situ IoT telemetry vs. NASA POWER / IDEAM / ERA5-Land satellite correlation across 300 pilot farms (`temp_abs_error_c`, `soil_moisture_abs_error_pct`, `pearson_r_correlation`, `microclimate_divergence_flag`) |
| `fact_lotes_exportacion` | 50 | **Question 4:** Export batch traceability, weighted water footprint (`weighted_water_m3_ton` vs `regional_benchmark_m3_ton`), SCA cupping score, and SHA-256 certificate hash per international buyer |
| `dim_sensores_salud` | 900 | **Question 5:** Operational health of the 900 IoT sensors (300 pilot farms × 3 sensor types), battery (`battery_mv`), RSSI (`rssi_dbm`), 30-day uptime (`uptime_30d_pct`), and anomalies (`dominant_anomaly_type`, `requires_maintenance`) |

### Ready-to-run Athena SQL Queries for Power BI (6 Business Questions)

```sql
-- Q1: Which municipalities have the highest incidence of coffee rust (Roya) and water stress alerts?
SELECT f.municipality_name, a.alert_type, a.severity, COUNT(*) AS total_alertas,
       ROUND(AVG(a.soil_moisture_mean_pct), 2) AS avg_soil_moisture_pct
FROM agrosense_datalake.fact_alertas a
LEFT JOIN agrosense_datalake.dim_finca f ON a.farm_id = f.farm_id
GROUP BY f.municipality_name, a.alert_type, a.severity
ORDER BY total_alertas DESC;

-- Q2: What is the productivity impact (kg/ha) of applying NPK fertilizer recommendations?
SELECT department_name, fertilizer_applied, COUNT(*) AS visitas,
       ROUND(AVG(yield_kg_ha_before), 1) AS avg_kg_ha_before,
       ROUND(AVG(yield_kg_ha_after), 1) AS avg_kg_ha_after,
       ROUND(AVG(yield_delta_pct), 2) AS avg_yield_gain_pct
FROM agrosense_datalake.fact_visitas_agronomicas
GROUP BY department_name, fertilizer_applied
ORDER BY department_name, fertilizer_applied DESC;

-- Q3: How strongly do satellite estimates (NASA POWER / ERA5-Land) correlate with in-situ IoT sensors across altitude bands?
SELECT department_name,
       CASE WHEN altitude_meters < 1500 THEN '1200-1499m'
            WHEN altitude_meters < 1800 THEN '1500-1799m'
            ELSE '1800m+' END AS altitude_band,
       COUNT(*) AS pilot_farms,
       ROUND(AVG(temp_abs_error_c), 2) AS mae_temp_c,
       ROUND(AVG(soil_moisture_abs_error_pct), 2) AS mae_soil_moisture_pct,
       ROUND(AVG(pearson_r_correlation), 3) AS avg_pearson_r,
       SUM(CASE WHEN microclimate_divergence_flag THEN 1 ELSE 0 END) AS divergent_microclimates
FROM agrosense_datalake.fact_iot_vs_satelite
GROUP BY 1, 2
ORDER BY 1, 2;

-- Q4: Do export batches comply with sustainable water footprint benchmarks and 100% farm traceability?
SELECT buyer_company, destination_country, coffee_variety,
       COUNT(*) AS export_batches,
       ROUND(SUM(total_weight_kg), 0) AS total_exported_kg,
       ROUND(AVG(weighted_water_m3_ton), 2) AS avg_water_m3_ton,
       ROUND(AVG(water_saving_pct), 2) AS avg_water_saving_vs_benchmark_pct,
       ROUND(AVG(cupping_score_sca), 2) AS avg_sca_score
FROM agrosense_datalake.fact_lotes_exportacion
GROUP BY buyer_company, destination_country, coffee_variety
ORDER BY total_exported_kg DESC;

-- Q5: What is the operational health and anomaly rate of the 900 IoT sensors across the 300 pilot farms?
SELECT department_name, sensor_type, status,
       COUNT(*) AS total_sensors,
       ROUND(AVG(uptime_30d_pct), 2) AS avg_uptime_pct,
       ROUND(AVG(battery_mv), 0) AS avg_battery_mv,
       SUM(CASE WHEN requires_maintenance THEN 1 ELSE 0 END) AS sensors_needing_maintenance
FROM agrosense_datalake.dim_sensores_salud
GROUP BY department_name, sensor_type, status
ORDER BY department_name, sensor_type;

-- Q6: Are field agronomists meeting SLA response times for critical alerts and quarterly visit coverage?
SELECT department_name, visit_quarter,
       COUNT(DISTINCT farm_id) AS covered_farms,
       COUNT(*) AS total_visits,
       ROUND(AVG(days_since_prev_visit), 1) AS avg_days_between_visits,
       ROUND(AVG(alert_response_hours), 1) AS avg_alert_sla_hours
FROM agrosense_datalake.fact_visitas_agronomicas
GROUP BY department_name, visit_quarter
ORDER BY department_name, visit_quarter;
```
