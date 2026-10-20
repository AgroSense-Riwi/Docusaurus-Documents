# AgroSense Café Documentation

This repository contains the Docusaurus documentation site for AgroSense Café.
Maintain and publish documentation here; application code remains in the
[AgroSense Café application repository](https://github.com/Pbyte5/AgroSense-Caf-IoT-Monitoring-and-Traceability-Framework).

## Requirements

- Node.js 20 or newer
- npm

## Install and run locally

From the repository root:

```bash
npm ci
npm run start
```

The development site is served at <http://localhost:3000>. Changes are
reflected automatically while the development server is running.

## Build

```bash
npm run build
```

The static site is generated in `build/`. The `build/` directory,
`node_modules/`, and `.docusaurus/` are local/generated files and are not
committed.

## Preview with Docker

With Docker Compose installed, run:

```bash
docker compose up --build -d
```

Open <http://localhost:8080>. To use a different host port, set `DOCS_PORT` in
a `.env` file (for example, `DOCS_PORT=8081`). Stop the container with:

```bash
docker compose down
```

## Publish

The site is published at
<https://pbyte5.github.io/AgroSense-Documents/> using GitHub Pages. The workflow
in `.github/workflows/deploy.yml` builds and deploys the site after changes are
pushed to `main`; it can also be started manually from the GitHub Actions tab.
Configure the repository's Pages source as **GitHub Actions** in its settings.
