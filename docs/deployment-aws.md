# AWS EC2 Docker Deployment

## Target Shape

Pineflow is deployed on one AWS EC2 `t3.micro` instance with two Docker containers:

- `app`: Node/Express server that serves `/api` and the built Vite frontend.
- `postgres`: PostgreSQL container with a named Docker volume.

The operator manually creates, starts, stops, and terminates AWS resources. This document only defines the deployment flow and runtime layout.

## Why This Shape

This keeps early operations simple: one instance, one Docker Compose file, no RDS dependency, and no external database network exposure. The tradeoff is that database durability depends on the EC2 instance's EBS volume and explicit backups.

## Repository Artifacts

- `Dockerfile`: multi-stage app image build.
- `compose.prod.yml`: production Docker Compose topology.
- `.env.production.example`: production environment template.
- `server/schema.sql`: schema applied automatically when the app starts.
- `docs/deployment-aws.md`: this operating guide.

## Instance Assumptions

- EC2 instance class: `t3.micro`.
- OS: Amazon Linux or Ubuntu.
- Docker and Docker Compose plugin installed.
- Git installed.
- Security group exposes only:
  - `22/tcp` from the operator's IP.
  - `80/tcp` from the public internet while HTTP is used.
  - `443/tcp` after TLS is added.
- PostgreSQL port `5432` is not published to the host and must not be opened in the security group.

## First Deployment Flow

1. SSH into the instance.
2. Clone the repository:

   ```bash
   git clone https://github.com/pineful/pineflow.git
   cd pineflow
   ```

3. Create production environment:

   ```bash
   cp .env.production.example .env.production
   nano .env.production
   ```

4. Set strong values:

   ```bash
   POSTGRES_DB=pineflow
   POSTGRES_USER=pineflow
   POSTGRES_PASSWORD=<long-random-password>
   DATABASE_URL=postgres://pineflow:<long-random-password>@postgres:5432/pineflow
   PINEFLOW_OWNER_KEY=<long-random-owner-secret>
   ```

5. Build and start:

   ```bash
   docker compose -p pineflow -f compose.prod.yml up -d --build
   ```

6. Check status:

   ```bash
   docker compose -p pineflow -f compose.prod.yml ps
   docker compose -p pineflow -f compose.prod.yml logs -f app
   ```

7. Verify health from the instance:

   ```bash
   curl http://127.0.0.1/api/health
   ```

## Update Flow

1. SSH into the instance.
2. Pull latest code:

   ```bash
   cd pineflow
   git pull --ff-only
   ```

3. Rebuild and restart the application:

   ```bash
   docker compose -p pineflow -f compose.prod.yml up -d --build app
   ```

4. Confirm health and logs:

   ```bash
   docker compose -p pineflow -f compose.prod.yml ps
   docker compose -p pineflow -f compose.prod.yml logs --tail=100 app
   ```

PostgreSQL should stay running during normal app updates.

## Stop And Start Flow

Stop services without deleting data:

```bash
docker compose -p pineflow -f compose.prod.yml stop
```

Start services again:

```bash
docker compose -p pineflow -f compose.prod.yml start
```

Do not run `docker compose -p pineflow -f compose.prod.yml down -v` in production unless intentionally deleting the database volume.

## Backup Flow

Create a backup before deployments and before stopping or terminating the instance:

```bash
mkdir -p backups
docker compose -p pineflow -f compose.prod.yml exec postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f "/backups/pineflow-$(date +%Y%m%d-%H%M%S).dump"'
```

Copy backups off the instance regularly:

```bash
scp ec2-user@<instance-public-ip>:~/pineflow/backups/*.dump ./backups/
```

The Docker volume is not enough by itself. If the EC2 instance or attached EBS volume is deleted, the database can be lost.

## Restore Flow

1. Put the dump file in `./backups` on the instance.
2. Start PostgreSQL.
3. Restore:

   ```bash
   docker compose -p pineflow -f compose.prod.yml exec postgres \
     sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "/backups/<backup-file>.dump"'
   ```

## t3.micro Operating Notes

- Keep only the app and PostgreSQL containers on the instance.
- Avoid running heavy build jobs while traffic is active.
- Keep PostgreSQL memory conservative; `compose.prod.yml` sets `shared_buffers=128MB` and `max_connections=30`.
- Prefer swap only as a last resort, because it can hide memory pressure and slow the instance sharply.
- Watch disk usage because Docker images, logs, and database files share the instance storage.

## Future Hardening

- Put Nginx or Caddy in front of the app for HTTPS.
- Move PostgreSQL to RDS if durability and managed backups become more important than single-instance simplicity.
- Add user authentication and remove the single `PINEFLOW_OWNER_KEY` model.
- Add GitHub Actions to build the Docker image and deploy with a controlled script.

## AWS Cost Notes

AWS Free Tier and credit rules change over time. Before leaving the instance running, enable an AWS Budget alert and confirm that the chosen EC2 type, storage, data transfer, and account plan fit the current free or low-cost limits.

Official references:

- AWS Free Tier terms: https://aws.amazon.com/free/terms/
- EC2 getting started: https://aws.amazon.com/ec2/getting-started/
