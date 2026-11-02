# AgroSense Café Documentation

This repository contains the Docusaurus documentation site for AgroSense Café.
Maintain and publish documentation here; application code remains in the
[AgroSense Café API repository](https://github.com/AgroSense-Riwi/API).

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
<https://gen-lang-client-0936632479.web.app/> using Firebase Hosting (project
`gen-lang-client-0936632479`, see `.firebaserc` and `firebase.json`). The
workflow in `.github/workflows/deploy.yml` builds the site and deploys it to the
`live` channel after changes are pushed to `main`; it can also be started
manually from the GitHub Actions tab.

The deploy step needs the repository secret `FIREBASE_SERVICE_ACCOUNT`: the JSON
key of a Google Cloud service account with the **Firebase Hosting Admin** role on
that project. Without the secret the workflow only builds the site and shows a
warning. Never commit the key to the repository.
