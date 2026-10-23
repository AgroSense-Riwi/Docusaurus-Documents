# Diccionario de Datos: Ingesta Satelital y Meteorológica (S3 Bronze)

**Proyecto:** AgroSense Café  
**User Story:** AGRO-18 / Épica EP-05  
**Capa Data Lake:** `s3://agrosense-datalake-bronze/`  
**Estructura de particionado:** `dt=YYYY-MM-DD/`

Este documento detalla la estructura y el significado de los parámetros de los JSONs generados por el DAG `dag_satellite_ingestion` para facilitar su consumo en los Spark Jobs, modelos agronómicos (Roya, Sequía, Lluvia extrema) y dashboards.

---

## 1. Estructura Común del Envoltorio (Root Metadata)

Tanto NASA POWER como Open-Meteo siguen el mismo contrato raíz para estandarización en la capa Bronze:

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `source` | `string` | Origen de la API (`NASA_POWER` o `OPEN_METEO`). |
| `execution_date` | `string` | Fecha lógica de ejecución del DAG (`YYYY-MM-DD`). |
| `ingestion_timestamp`| `string` | Marca temporal UTC en formato ISO8601 del momento exacto de la descarga. |
| `total_farms` | `integer`| Número total de fincas piloto procesadas (300). |
| `successful_count` | `integer`| Cantidad de fincas consultadas con éxito. |
| `failed_count` | `integer`| Cantidad de fincas que fallaron tras reintentos (0 en ejecuciones exitosas). |
| `records` | `array` | Lista de objetos por finca. Cada elemento contiene metadata de la finca y el payload crudo (`data`). |

### Estructura de cada elemento en `records[]`
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `farm_id` | `string` | UUID único de la finca en base de datos PostgreSQL (`farms.farm_id`). |
| `farm_code` | `string` | Código de negocio de la finca piloto (e.g. `PILOT-FARM-001`). |
| `latitude` | `float` | Latitud de consulta solicitada (WGS84). |
| `longitude` | `float` | Longitud de consulta solicitada (WGS84). |
| `status` | `string` | `SUCCESS` o `FAILED`. |
| `data` | `object` | Respuesta JSON cruda devuelta por el proveedor satelital/meteorológico. |

---

## 2. NASA POWER API (Fuente F2 - Clima Histórico Diario)

* **Ruta S3:** `weather_nasa_power/dt=YYYY-MM-DD/nasa_power_YYYY-MM-DD.json`
* **Formato del payload:** GeoJSON estándar (`type: Feature`). Los valores se encuentran en `records[].data.properties.parameter.<VARIABLE>["YYYYMMDD"]`.

| Parámetro | Nombre Completo | Unidad | Descripción y Uso Agronómico |
| :--- | :--- | :--- | :--- |
| `PRECTOTCORR` | *Precipitation Corrected* | `mm/día` | **Precipitación acumulada diaria** corregida por sesgo orográfico. Clave para evaluar alertas de inundación/lluvia extrema (`RN-05`) y balance hídrico (`RN-04`). |
| `T2M_MEAN` / `T2M` | *Temperature at 2 Meters* | `°C` | **Temperatura media del aire a 2 metros** sobre el suelo. Se utiliza para modelar la velocidad de desarrollo del hongo de la Roya del café (`RN-03`, rango óptimo 18°C - 24°C). |
| `ALLSKY_SFC_SW_DWN` | *All Sky Surface Shortwave Downward Irradiance* | `MJ/m²/día`| **Radiación solar global incidente**. Mide la energía recibida por el dosel del cafetal; influye en fotosíntesis, evaporación y necesidad de sombra/fertilización. |
| `RH2M` | *Relative Humidity at 2 Meters* | `%` | **Humedad relativa a 2 metros**. Factor detonante de enfermedades criptogámicas; >80% mantenido en ventana de 4 días dispara la alerta de Roya (`RN-03`). |
| `coordinates` | *Coordinates* | `[lon, lat, elev]` | Longitud, latitud y elevación en metros sobre el nivel del mar estimada por el modelo satelital. |

---

## 3. Open-Meteo API (Fuente F3 - Pronóstico a 7 Días)

* **Ruta S3:** `weather_open_meteo/dt=YYYY-MM-DD/open_meteo_YYYY-MM-DD.json`
* **Formato del payload:** JSON con arrays temporales para series diarias y horarias a 7 días.

### 3.1 Métricas Diarias (`records[].data.daily`)
Vienen alineadas al array `daily.time` (fechas `["YYYY-MM-DD", ...]` con 7 posiciones):

| Parámetro | Unidad | Descripción y Uso Agronómico |
| :--- | :--- | :--- |
| `precipitation_sum` | `mm` | **Suma total de lluvia pronosticada para cada uno de los próximos 7 días**. Permite anticipar alertas preventivas de sequía (`RN-04`) si la suma a 7 días es cercana a 0, o alertas de escorrentía si supera 50 mm/día. |
| `temperature_2m_mean`| `°C` | **Temperatura media esperada para cada día**. Anticipa olas de calor o enfriamientos que afecten la floración y maduración del grano de café. |

### 3.2 Métricas Horarias (`records[].data.hourly`)
Vienen alineadas al array `hourly.time` (fechas y horas en pasos de 1 hora, `["YYYY-MM-DDTHH:00", ...]` con 168 posiciones para 7 días):

| Parámetro | Unidad | Descripción y Uso Agronómico |
| :--- | :--- | :--- |
| `relative_humidity_2m`| `%` | **Humedad relativa prevista hora a hora**. Permite calcular las **horas de rocío y mojadura foliar nocturna**, condición esencial para que la espora de la roya penetre el estoma de la hoja de café. |

### 3.3 Metadatos Geográficos (`records[].data`)
| Parámetro | Unidad | Descripción |
| :--- | :--- | :--- |
| `elevation` | `metros` | Altitud estimada por el modelo digital de terreno de Open-Meteo (relevante para pisos térmicos cafeteros). |
| `generationtime_ms`| `milisegundos` | Latencia interna de procesamiento de la API de Open-Meteo. |
| `utc_offset_seconds`| `segundos` | Desplazamiento respecto a UTC (0 por defecto al consultar en estándar UTC). |

---

## 4. Snippet Rápido en Python (Cómo leer estos JSONs)

```python
import json

# Cargar archivo crudo Bronze
with open("s3_bronze_local/weather_nasa_power/dt=2026-10-23/nasa_power_2026-10-23.json", "r", encoding="utf-8") as f:
    nasa_payload = json.load(f)

# Extraer métricas de la primera finca
first_farm = nasa_payload["records"][0]
print(f"Finca: {first_farm['farm_code']}")

params = first_farm["data"]["properties"]["parameter"]
clean_date = nasa_payload["execution_date"].replace("-", "")

rain_mm = params["PRECTOTCORR"].get(clean_date)
temp_c = (params.get("T2M_MEAN") or params.get("T2M", {})).get(clean_date)
humidity_pct = params["RH2M"].get(clean_date)

print(f"Lluvia: {rain_mm} mm/día | Temp: {temp_c} °C | Humedad: {humidity_pct}%")
```
