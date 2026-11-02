[![DevSecOps](https://github.com/Mujakkir-Pathan/devboard/actions/workflows/devsecops.yml/badge.svg?branch=mega-project)](https://github.com/Mujakkir-Pathan/devboard/actions/workflows/devsecops.yml)
[![Terraform Checks](https://github.com/Mujakkir-Pathan/devboard/actions/workflows/terraform-ci.yml/badge.svg?branch=mega-project)](https://github.com/Mujakkir-Pathan/devboard/actions/workflows/terraform-ci.yml)

# DevBoard: three-tier ticket tracking with an AI assistant

DevBoard is a kanban-style project tracker built as a real three-tier
application, with a **React** frontend, **Go** API, and **Postgres** database,
plus an **AI assistant** microservice that streams project summaries and answers
grounded in your actual tasks.

It runs locally with one command, ships a full **DevSecOps CI pipeline**
(quality gates, SHA-tagged images, GitOps commit), and has a complete
**GitOps path to AWS EKS** (Terraform, ArgoCD, Envoy Gateway, OpenTelemetry).

**Highlights**

- Kanban boards, task lists, project dashboard, full-text task search
- AI assistant with streaming (SSE) summaries and Q&A grounded in your project's tasks, self-hosted via Ollama
- One-command local setup with `make up` (Docker Compose, no Node/Go/Python/Postgres install needed)
- DevSecOps pipeline: lint, tests, GitLeaks, dependency and image scanning, Sonar, hadolint
- GitOps delivery: CI commits image tags into `k8s/` and `helm/`, ArgoCD syncs to EKS, CI never touches the cluster
- Production-shaped EKS guide: Terraform, TLS, AWS Secrets Manager, distributed tracing, Grafana/Loki/Tempo

---

## Architecture

### Local: Docker Compose

```mermaid
flowchart LR
    B["Browser<br/>localhost:8080"] --> FE["frontend<br/>Vite preview :4173"]
    FE -->|"/api/* → strip prefix"| BE["backend (Go/Gin)<br/>:8080"]
    FE -->|"/api/ai/* → strip prefix"| AI["ai-service (Flask)<br/>:3005"]
    AI -->|"fetch task context"| BE
    AI -->|"stream answer (SSE)"| OLL["Ollama<br/>on your host :11434"]
    BE --> PG[("Postgres 16<br/>:5432")]
```

The frontend container's Vite preview server is the single entry point: it
serves the UI and proxies `/api/*` to the Go backend and `/api/ai/*` to the
ai-service (dropping the prefix, because the backend mounts its routes at the
root). Compose puts all four containers on one network so they find each other
by service name.

### On AWS EKS

```mermaid
flowchart TB
    U["User · HTTPS"] --> NLB["Envoy Gateway (Gateway API → AWS NLB)"]
    NLB -->|"/"| FE["frontend"]
    NLB -->|"/api/ai/*"| AI["ai-service"]
    subgraph eks["EKS cluster"]
        FE -->|"/api/*"| BE["backend"]
        AI -->|"task context"| BE
        AI -->|"SSE"| OLL["Ollama (in-cluster)"]
        BE --> PG[("Postgres")]
        ESO["External Secrets Operator"] --> SEC["Secret"]
        BE -.reads.- SEC
    end
    SM["AWS Secrets Manager"] --> ESO
```

- **Routing**: one hostname, `/` serves the UI, `/api/ai/*` reaches the
  ai-service, everything else under `/api` hits the backend.
- **Secrets**: no credentials in Git. AWS Secrets Manager → External Secrets
  Operator → Kubernetes Secret → backend and Postgres.
- **Observability** (not shown above): all three tiers emit OTLP to the
  OpenTelemetry Collector → **Tempo** (traces), **Loki** (logs),
  **Prometheus** (metrics) → **Grafana** dashboards and alerts.
- **Delivery**: ArgoCD watches this repo (`mega-project`). Raw manifests
  (`k8s/`) and a Helm chart (`helm/devboard/`) are two interchangeable paths.

### CI/CD: DevSecOps + GitOps

```mermaid
flowchart LR
    P["git push<br/>mega-project"] --> G["DevSecOps gates<br/>lint · tests · gitleaks<br/>dep-scan · hadolint · sonar"]
    G -->|"pass"| D["docker-push<br/>3 images, SHA tag"]
    D --> B["gitops-bump<br/>new tags committed into<br/>k8s/ + helm/devboard/values.yaml"]
    B --> A["ArgoCD auto-sync<br/>self-heal + prune"]
    A --> K["EKS<br/>rolling update"]
```

CI never talks to the cluster; it only writes to Git. Full walkthrough:
[`gitops/14-cicd.md`](gitops/14-cicd.md).

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, React Router, TanStack Query, Vite 8, Tailwind 4 |
| Backend | Go 1.25, Gin, `lib/pq`, OpenTelemetry (`otelgin`) |
| Database | PostgreSQL 16 (schema + seed in `init/postgres/`) |
| AI | Python 3.12 / Flask, OpenAI-compatible client, Ollama (`llama3.2:1b`), SSE streaming |
| Local run | Docker Compose + Make |
| CI | GitHub Actions (`devsecops.yml` orchestrator, reusable workflow jobs) |
| IaC | Terraform (VPC, EKS, IAM, S3 remote state) |
| CD | ArgoCD (app-of-apps), Envoy Gateway (Gateway API → NLB), Helm |
| Secrets | AWS Secrets Manager + External Secrets Operator |
| Observability | OpenTelemetry → Collector → Tempo / Loki / Prometheus → Grafana |

---

## Quick start (local)

**You need:** Docker (with Compose). Nothing else, no Node, Go, Python, or
Postgres on your machine.

```bash
git clone https://github.com/Mujakkir-Pathan/devboard.git
cd devboard
make setup    # creates .env from .env.example (first time only)
make up       # builds & starts postgres, backend, ai-service, frontend
```

Open **http://localhost:8080**. You should see the DevBoard dashboard with
example tasks. (On first load a brief error can appear while the backend
starts; refresh.)

```bash
make smoke    # curl all the health endpoints
make logs     # follow the logs
make down     # stop everything
make reset    # wipe the database and start fresh
```

No `make`? Run the Compose commands directly:

```bash
cp .env.example .env
docker compose up --build
```

| Service    | URL / endpoint                     | Notes                                  |
| ---------- | ---------------------------------- | -------------------------------------- |
| Frontend   | http://localhost:8080              | the app; proxies `/api` + `/api/ai`    |
| Backend    | http://localhost:8081/health       | Go API (UI reaches it via `/api`)      |
| ai-service | http://localhost:3005/health       | AI microservice (UI reaches it via `/api/ai`) |
| Postgres   | localhost:5432                     | `devboard` / `devboard`                |

### The AI assistant locally

The app is fully usable without a model, only the AI chat needs one. To
enable it, run Ollama on your machine:

```bash
ollama serve
ollama pull llama3.2:1b
```

`ai-service` reaches it at `http://host.docker.internal:11434/v1` (the
`.env.example` default). Using a different OpenAI-compatible provider? Set
`MODEL_API_BASE` / `MODEL_NAME` (and `MODEL_API_KEY`) in `.env`. Without a
model the chat panel shows an error; everything else works.

---

## The manual way (do it by hand to understand it)

Run all commands from the repo root. Start the pieces one by the one, the hard
way, so you can see exactly what Compose does for you later. (This path skips
`ai-service`, but Compose in Part 2 runs it.)

### Step 1: Create a network

Containers only find each other by name on the **same network**:

```bash
docker network create devboard-net
```

### Step 2: Build the images

Frontend and backend are *our* code, so we build an image for each. Postgres is
the official image, so there is nothing to build.

```bash
docker build -t devboard-frontend ./frontend
docker build -t devboard-backend ./backend
```

The first build downloads base images and compiles code (a few minutes); later
builds are much faster.

### Step 3: Run the database

Named `postgres`, the exact name the backend looks for. The volume mount loads
the example data on first start.

```bash
docker run -d --name postgres --network devboard-net \
  -e POSTGRES_USER=devboard \
  -e POSTGRES_PASSWORD=devboard \
  -e POSTGRES_DB=devboard \
  -v "$PWD/init/postgres":/docker-entrypoint-initdb.d:ro \
  -p 5432:5432 \
  postgres:16-alpine
```

### Step 4: Run the backend

`POSTGRES_URL` uses the container name `postgres`, which is how service
discovery works on the shared network.

```bash
docker run -d --name backend --network devboard-net \
  -e PORT=8080 \
  -e POSTGRES_URL="postgres://devboard:devboard@postgres:5432/devboard?sslmode=disable" \
  -p 8081:8080 \
  devboard-backend
```

### Step 5: Run the frontend

Serves on 4173 in the container, mapped to 8080 on your machine:

```bash
docker run -d --name frontend --network devboard-net \
  -p 8080:4173 \
  devboard-frontend
```

### Step 6: Open it and check

**http://localhost:8080** should show the dashboard. From the terminal:

```bash
curl http://localhost:8081/health                      # backend says OK
curl "http://localhost:8080/api/tasks?project_id=1"    # app → backend → database
```

### Step 7: Stop and clean up

```bash
docker rm -f frontend backend postgres
docker network rm devboard-net
```

### The one thing to remember: names

The backend finds the database as `postgres` (see `POSTGRES_URL`); the
frontend finds the backend as `backend` (see `frontend/vite.config.js`). Those
container **names must match**, and they only resolve because everything sits
on the `devboard-net` network. That's the typing and ordering Compose handles
for you.

---

## Settings live in `.env`

All changeable values live in one file, created from the committed template:

```bash
cp .env.example .env     # or: make setup
```

`.env.example` stays in git; your real `.env` is gitignored, so secrets never
get committed.

| Variable | Default | What it controls |
|----------|---------|------------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `devboard` | database credentials (backend gets them via `POSTGRES_URL`) |
| `POSTGRES_HOST_PORT` | `5432` | host port for Postgres |
| `BACKEND_PORT` / `BACKEND_HOST_PORT` | `8080` / `8081` | container port / host port for the Go API |
| `FRONTEND_HOST_PORT` | `8080` | host port for the UI |
| `AI_HOST_PORT` | `3005` | host port for ai-service |
| `MODEL_API_BASE` | `http://host.docker.internal:11434/v1` | any OpenAI-compatible `/v1` endpoint |
| `MODEL_NAME` | `llama3.2:1b` | model to use |
| `MODEL_API_KEY` | *(empty)* | only needed for hosted providers |
| `IMAGE_TAG` | `latest` | image tag for local builds |

---

## Development & tests

Each tier develops independently, and Compose can supply the rest:

```bash
# Frontend (hot reload; needs backend on :8080 + ai-service on :3005)
#   for `npm run dev`, set BACKEND_HOST_PORT=8080 in .env first, then:
cd frontend
npm install --legacy-peer-deps
npm run dev            # http://localhost:5173, same /api + /api/ai proxies

# Backend
cd backend
go test ./...
go vet ./... && go fmt ./...

# ai-service
cd ai-service
pip install -r requirements.txt pytest
python -m pytest
```

Quality commands used by CI (run them before pushing):

| Tier | Commands |
|------|----------|
| frontend | `npm run lint` (ESLint), `npm run test` (Vitest) |
| backend | `go test ./...`, `go vet`, `gofmt` |
| ai-service | `python -m pytest` |
| workflows | `yamllint .github/workflows` |

---

## Project structure

```
.
├── README.md                you are here
├── Deploy.md                EKS runbook: bare AWS account → HTTPS, command-by-command
├── Makefile                 make setup / up / down / logs / ps / reset / smoke
├── docker-compose.yml       local stack: postgres + backend + ai-service + frontend
├── .env.example             settings template (copy to .env)
│
├── frontend/                React app (Vite, Tailwind). Serves the UI, proxies /api
├── backend/                 Go API (Gin): main.go, tracing.go, tests
├── ai-service/              Flask AI microservice: SSE streaming, Prometheus metrics
├── init/postgres/           schema + seed data, loaded on first database start
│
├── k8s/                     raw Kubernetes manifests (ArgoCD app path #1)
├── helm/devboard/           Helm chart for the same app (ArgoCD app path #2)
│
├── gitops/                  everything ArgoCD owns
│   ├── README.md            the 15-chapter EKS mega-project guide + cost model
│   ├── 01..15-*.md          prerequisites → Terraform → Gateway → ArgoCD →
│   │                        secrets → manifests/Helm → AI → observability →
│   │                        instrumentation → debugging → CI/CD → cleanup
│   ├── argocd/              Application manifests (app-of-apps + platform/)
│   ├── gateway/             GatewayClass
│   ├── external-secrets/    ClusterSecretStore
│   ├── cert-manager/        ClusterIssuers
│   ├── ollama/              shared in-cluster model server
│   └── observability/       collector configs, chart values, dashboards, alerts
│
├── terraform/               EKS + VPC + IAM, S3 remote state
│   └── bootstrap/           the state bucket (local state, run once)
├── ansible/                 provision a dedicated deploy/dev machine
├── scripts/deploy.sh        one-shot EKS deploy (preflight → platform → app)
│
└── .github/workflows/       DevSecOps pipeline (see gitops/14-cicd.md)
```

---

## API reference

The browser calls everything as `/api/...`; the frontend container strips the
prefix before proxying.

### backend (Go)

| Method | Path                      | What it does                       |
| ------ | ------------------------- | ---------------------------------- |
| GET    | `/projects`               | list projects                      |
| POST   | `/projects`               | create a project                   |
| GET    | `/tasks?project_id=N`     | list tasks in a project            |
| POST   | `/tasks`                  | create a task                      |
| PATCH  | `/tasks/:id`              | update a task (e.g. change status) |
| GET    | `/search?q=&project_id=N` | search tasks by title              |
| GET    | `/health`                 | health check                       |

### ai-service (Python), via `/api/ai`

| Method | Path             | What it does                                            |
| ------ | ---------------- | ------------------------------------------------------- |
| GET    | `/`              | service index (name, model, endpoints)                  |
| GET    | `/health`        | health + model name                                     |
| GET    | `/model/check`   | is the model server reachable / model ready?            |
| POST   | `/summarise`     | SSE: 4 to 6 sentence project summary grounded in tasks  |
| POST   | `/ask`           | SSE: question answering grounded in tasks               |

`POST` bodies: `{"project_id": 1}` and, for `/ask`, `{"question": "..."}`.

---

## CI/CD: DevSecOps + GitOps

Pushing to `mega-project` runs
[`.github/workflows/devsecops.yml`](.github/workflows/devsecops.yml):

1. **Gates (parallel)**: code quality (Checkstyle/ESLint, yamllint, gofmt/vet),
   tests (Go, Vitest, Pytest with MySQL/Postgres services), GitLeaks, hadolint,
   dependency & image scanning, Sonar.
2. **Build and push**: once every gate passes, the three service images are
   pushed to Docker Hub tagged with the commit SHA.
3. **GitOps bump**: new SHA tags are written into `k8s/` and
   `helm/devboard/values.yaml` and committed back (`ci: deploy … [skip ci]`).
   ArgoCD, watching this branch, syncs the change to the cluster.

Full walk-through: [`gitops/14-cicd.md`](gitops/14-cicd.md). The steps below
configure the secrets the pipeline needs.

### How to Install and Set Up SonarQube on EC2

To run your own self-hosted SonarQube server on your AWS EC2 instance:

1. **Start the SonarQube Container**:
   Ensure Docker is installed on your EC2 instance, then run:
   ```bash
   docker run -itd --name SonarQube-Server -p 9000:9000 sonarqube:community
   ```
2. **Access the Web Interface**:
   - Make sure port `9000` is open in your **AWS EC2 Security Group** inbound rules.
   - Access `http://<YOUR_EC2_PUBLIC_IP>:9000` in your browser.
   - Log in using default credentials: Username: `admin` / Password: `admin` (you will be prompted to change it)

### How to configure SonarQube Secrets

To enable SonarQube scanning in your GitHub Actions pipeline:

1. **Get the Host URL**:
   - If using a self-hosted instance, your `SONAR_HOST_URL` is the URL where SonarQube is hosted (e.g., `http://your-sonarqube-ip:9000`).
   - If using SonarCloud, use `https://sonarcloud.io`.
2. **Generate a SonarQube Token**:
   - In SonarQube: Go to your **Profile (User Icon) > My Account > Security**.
   - Under **Generate Tokens**, enter a token name, select the **User Token** type, and click **Generate**.
   - Copy the generated token string.
3. **Add Secrets to GitHub**:
   - Go to your GitHub Repository settings.
   - Navigate to **Settings > Secrets and variables > Actions**.
   - Add two Repository Secrets:
     - `SONAR_TOKEN`: Paste the SonarQube token you copied.
     - `SONAR_HOST_URL`: Paste your SonarQube server URL.

### How to configure Docker Hub Credentials

To allow the CI pipeline to build and push images to Docker Hub:

1. Navigate to **Settings > Secrets and variables > Actions**.
2. Under the **Variables** tab, add:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username (`mujakkirpathan`).
3. Under the **Secrets** tab, add:
   - `DOCKERHUB_TOKEN`: A Personal Access Token (PAT) generated from Docker Hub with **Read & Write**.

---

## Deploying to EKS

Two entry points, same destination:

- **[`Deploy.md`](Deploy.md)**: flat command-by-command runbook, bare AWS
  account → HTTPS on your own domain.
- **[`gitops/README.md`](gitops/README.md)**: the 15-chapter guide with the
  why behind each step, plus the cost model of about $330/month. Do
  [`gitops/15-cleanup.md`](gitops/15-cleanup.md) when you're done).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Page loads, tasks show an error | backend still starting → refresh, or `make logs` |
| AI chat returns an error | no model running, start Ollama and pull `llama3.2:1b`, or check `MODEL_API_BASE` in `.env` |
| `port is already allocated` | another service owns the port → change `*_HOST_PORT` in `.env`, `make down && make up` |
| Database in a weird state | `make reset` (drops the volume, re-seeds) |
| Compose won't start | `.env` missing → `make setup` (or `cp .env.example .env`) |
| Changed `docker-compose.yml` / env vars | recreate: `make down && make up` |

---

## License

See the repository owner for licensing terms.
