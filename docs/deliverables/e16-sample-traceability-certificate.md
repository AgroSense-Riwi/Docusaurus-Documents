---
sidebar_position: 12
title: Sample Traceability Certificate & API Artifacts (E-05 / E-16)
---

# Sample Digital Traceability Certificate & API Contract Artifacts (E-05 / E-16)

| **Deliverables** | `E-05` (OpenAPI 3.0.3 + Postman Collection) & `E-16` (Cryptographic Sample Traceability Certificate) |
| :--- | :--- |
| **Aligned Rules** | `RN-08` (100% Lot Origin Composition), `RN-09` (PostGIS Zero-Deforestation Check), `RN-10` (Weighted Water Footprint), `RN-11` (Buyer Multi-Tenant Isolation) |
| **Downloadable Artifacts** | [`openapi.json`](pathname:///openapi.json) · [`agrosense_postman_collection.json`](pathname:///agrosense_postman_collection.json) · [`sample_traceability_certificate_EXP-2026-0001.json`](pathname:///sample_traceability_certificate_EXP-2026-0001.json) · [`aws-pricing-calculator-estimate.csv`](pathname:///aws-pricing-calculator-estimate.csv) |

---

## 1. Cryptographic Traceability Certificate (`EXP-2026-0001` — `E-16`)

Generated and verified by `CertificateBuilder` and `PublicCertificateValidator` (`apps/api/src/agrosense_api/services/certificate_service.py`):

- **Certificate ID:** `CERT-EXP-2026-0001-2B70B697`
- **Export Batch Code:** `EXP-2026-0001`
- **Authorized International Buyer:** `Nordic Specialty Coffee Traders AS (Oslo, Norway)` (`BUY-INT-001`)
- **Total Certified Weight (`RN-08`):** `2,430.00 kg` (`100.00%` traced across 2 origin farms)
- **SCA Cupping Score (`RN-10`):** `86.75 points` ($\ge 84.0$ Specialty Export Grade)
- **Water Footprint (`RN-10`):** `3.68 m³/ton` (`3.68 L/kg` — `3,402.00 L` direct irrigation + `5,540.40 L` satellite precipitation)
- **Deforestation-Free Status (`RN-09`):** `CERTIFIED` (`0` PostGIS `ST_Intersects` overlaps against `forest_reserves`)
- **SHA-256 Digital Signature:** `effeecfbc3cf15788c20312abde376696fa336ecfb06d614bd020e16b5dc8124`

### JSON Certificate Payload (`docs/samples/sample_traceability_certificate_EXP-2026-0001.json`)

```json
{
  "certificate_id": "CERT-EXP-2026-0001-2B70B697",
  "batch_id": "6c0d6229-9c21-51a4-93f0-e4b49c42c10e",
  "batch_code": "EXP-2026-0001",
  "issued_at": "2026-11-03T12:35:14.234567Z",
  "issuer": "AgroSense Café Certification Authority",
  "buyer_id": "f4c76e84-5509-5c63-918f-3a511e61430a",
  "buyer_name": "Nordic Specialty Coffee Traders AS (Oslo, Norway)",
  "total_weight_kg": 2430.0,
  "cupping_score": 86.75,
  "water_footprint": {
    "direct_irrigation_liters": 3402.0,
    "satellite_rain_liters": 5540.4,
    "total_water_liters": 8942.4,
    "liters_per_kg": 3.68,
    "m3_per_ton": 3.68
  },
  "farms": [
    {
      "farm_id": "2c851f71-8c8c-5d9a-846c-f31f0a5c8811",
      "farm_code": "FIN-0001",
      "farm_name": "Finca El Mirador del Café (Pitalito, Huila)",
      "contributed_kg": "1350.00",
      "share_percentage": "55.56",
      "geojson_polygon": {
        "type": "Polygon",
        "coordinates": [
          [
            [-76.051, 1.853],
            [-76.049, 1.853],
            [-76.049, 1.855],
            [-76.051, 1.855],
            [-76.051, 1.853]
          ]
        ]
      }
    },
    {
      "farm_id": "8e10d5e0-6e89-53b2-9f4e-771b40d91a20",
      "farm_code": "FIN-0002",
      "farm_name": "Hacienda La Esperanza (Chinchiná, Caldas)",
      "contributed_kg": "1080.00",
      "share_percentage": "44.44",
      "geojson_polygon": {
        "type": "Polygon",
        "coordinates": [
          [
            [-75.605, 4.981],
            [-75.603, 4.981],
            [-75.603, 4.983],
            [-75.605, 4.983],
            [-75.605, 4.981]
          ]
        ]
      }
    }
  ],
  "certificate_hash": "effeecfbc3cf15788c20312abde376696fa336ecfb06d614bd020e16b5dc8124"
}
```
