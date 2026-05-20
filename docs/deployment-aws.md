# AWS Free Tier Deployment

## Recommendation

Use one small EC2 instance for the Node/Express application and Amazon RDS for PostgreSQL. Keep the database private in the VPC and expose only HTTP/HTTPS to the application server.

## Current AWS Free Tier Notes

As of the official AWS pages checked on 2026-05-20:

- Amazon RDS Free Tier supports `db.t3.micro` and `db.t4g.micro` for PostgreSQL under the current Free Plan/credits model.
- Legacy accounts created before July 15, 2025 may continue to use eligible RDS free tier resources for up to 12 months after sign-up.
- AWS Free Plan accounts can expire after 6 months or when credits are exhausted.
- EC2 documentation still describes 750 hours/month of select EC2 instances and up to $200 in Free Tier credits for new customers.

Because AWS aggregates usage across regions and unused usage does not roll over, the production plan must include a billing alarm before anything is left running.

## Proposed Minimal Architecture

1. EC2 instance
   - Amazon Linux.
   - Node.js runtime.
   - Nginx reverse proxy.
   - Pineflow app served by `npm start` after `npm run build`.
2. RDS PostgreSQL
   - Single-AZ.
   - Free-tier eligible micro class where available.
   - Public access disabled.
   - Security group allows PostgreSQL only from the EC2 security group.
3. Secrets
   - `DATABASE_URL`, `PINEFLOW_OWNER_KEY`, and `PORT` stored as environment variables.
   - Do not commit `.env`.
4. Cost controls
   - Enable AWS Budgets before launch.
   - Keep only one EC2 instance and one RDS instance running.
   - Avoid Multi-AZ, NAT Gateway, provisioned IOPS, large storage, and extra regions.

## First Deployment Checklist

1. Create AWS Budget alert.
2. Create RDS PostgreSQL in the same region as EC2.
3. Create EC2 instance and security groups.
4. Pull the GitHub repository on EC2.
5. Set environment variables.
6. Run `npm ci`, `npm run build`, and `npm start`.
7. Put Nginx in front of port `3001`.
8. Add HTTPS with a certificate after the domain is chosen.

## Links

- AWS RDS Free Tier: https://aws.amazon.com/rds/free/
- AWS Free Tier Terms: https://aws.amazon.com/free/terms/
- EC2 Getting Started: https://aws.amazon.com/ec2/getting-started/
