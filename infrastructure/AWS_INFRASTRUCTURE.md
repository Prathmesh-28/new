# AWS Infrastructure

Complete Terraform-based infrastructure for Headroom multi-tenant SaaS platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CloudFront CDN                           │
│              (Static assets, caching layer)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ↓                         ↓
┌───────────────────┐   ┌──────────────────┐
│   Vercel          │   │  AWS API         │
│   (React SPA)     │   │  Gateway         │
└─────────────────┬─┘   │  (REST/GraphQL)  │
                  │     └────────┬─────────┘
                  │              │
                  └──────────────┼──────────────┐
                                 │              │
                    ┌────────────┴────────────┐ │
                    │   ECS Fargate Cluster  │ │
                    │  (Container Orchestration)
                    │  ┌──────────────────┐  │ │
                    │  │ Forecast Service │  │ │
                    │  │ (Python)        │  │ │
                    │  └──────────────────┘  │ │
                    │  ┌──────────────────┐  │ │
                    │  │ Credit Service   │  │ │
                    │  │ (Node.js)        │  │ │
                    │  └──────────────────┘  │ │
                    │  ┌──────────────────┐  │ │
                    │  │ Capital Service  │  │ │
                    │  │ (Node.js)        │  │ │
                    │  └──────────────────┘  │ │
                    └────────────┬───────────┘ │
                                 │             │
                  ┌──────────────┴──────────┐  │
                  │   VPC Private Networks │  │
                  │  ┌────────────────────┐│  │
                  │  │ RDS PostgreSQL     ││  │
                  │  │ (Multi-AZ)         ││  │
                  │  └────────────────────┘│  │
                  │  ┌────────────────────┐│  │
                  │  │ ElastiCache Redis  ││  │
                  │  │ (Session + Cache)  ││  │
                  │  └────────────────────┘│  │
                  │  ┌────────────────────┐│  │
                  │  │ SQS + SNS          ││  │
                  │  │ (Event Bus)        ││  │
                  │  └────────────────────┘│  │
                  │  ┌────────────────────┐│  │
                  │  │ S3 + Secrets Manager││  │
                  │  │ (Documents/Config) ││  │
                  │  └────────────────────┘│  │
                  └────────────────────────┘  │
                                              │
                           ┌──────────────────┘
                           ↓
                    ┌────────────────┐
                    │   Monitoring   │
                    │  Datadog +     │
                    │  PagerDuty     │
                    └────────────────┘
```

## Infrastructure as Code (Terraform)

### File Structure

```
infrastructure/
├─ terraform/
│  ├─ main.tf              # VPC, ECS cluster, ALB
│  ├─ database.tf          # RDS PostgreSQL
│  ├─ cache.tf             # ElastiCache Redis
│  ├─ services.tf          # ECS task definitions
│  ├─ api_gateway.tf       # API Gateway (REST/GraphQL)
│  ├─ s3.tf                # S3 buckets
│  ├─ secret_manager.tf    # AWS Secrets Manager
│  ├─ monitoring.tf        # CloudWatch, Datadog
│  ├─ variables.tf         # Input variables
│  ├─ outputs.tf           # Output values
│  └─ versions.tf          # Terraform & provider versions
├─ scripts/
│  ├─ init-terraform.sh    # Initialize Terraform backend
│  ├─ deploy-prod.sh       # Production deployment
│  └─ deploy-staging.sh    # Staging deployment
└─ README.md
```

## Prerequisites

```bash
# Install Terraform
brew install terraform

# Install AWS CLI v2
brew install awscliv2

# Configure AWS credentials
aws configure

# Set AWS profile (optional)
export AWS_PROFILE=headroom-prod
```

## Deployment

### 1. Initialize Terraform Backend (First Time Only)

```bash
cd infrastructure/terraform

# Create S3 bucket for Terraform state
aws s3api create-bucket \
  --bucket headroom-terraform-state \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket headroom-terraform-state \
  --versioning-configuration Status=Enabled

# Initialize Terraform
terraform init
```

### 2. Plan Deployment

```bash
# Validate configuration
terraform validate

# Format code
terraform fmt -recursive

# Create plan
terraform plan -out=tfplan -var-file="production.tfvars"
```

### 3. Apply Infrastructure

```bash
# Apply (requires manual approval)
terraform apply tfplan

# View outputs
terraform output
```

## Environment Configuration

### production.tfvars

```hcl
environment = "production"
aws_region  = "us-east-1"

# Networking
vpc_cidr = "10.0.0.0/16"
az_count = 3

# Optional API Gateway custom domain
api_gateway_custom_domain = "api.yourdomain.com"
api_gateway_custom_domain_hosted_zone_id = "Z1234567890ABC"

# Database
db_instance_class = "db.r6i.xlarge"
db_allocated_storage = 100
db_backup_retention_days = 30
db_multi_az = true

# Cache
redis_node_type = "cache.r6g.xlarge"
redis_num_cache_nodes = 3

# ECS Services
forecast_service_cpu    = 1024
forecast_service_memory = 2048
forecast_service_desiredCount = 3

credit_service_cpu      = 512
credit_service_memory   = 1024
credit_service_desiredCount = 2

capital_service_cpu     = 512
capital_service_memory  = 1024
capital_service_desiredCount = 2

# OAuth Integrations (sensitive - set via environment variables)
plaid_client_id = ""
plaid_secret = ""
quickbooks_client_id = ""
quickbooks_secret = ""
xero_client_id = ""
xero_secret = ""

# Monitoring
datadog_enabled = true
datadog_api_key = ""

tags = {
  Project     = "Headroom"
  Environment = "Production"
  ManagedBy   = "Terraform"
}
}
```

## Key AWS Services

### RDS PostgreSQL

```
- Multi-AZ deployment for high availability
- Automated backups (30-day retention)
- Read replicas for horizontal scaling
- Parameter groups for custom configuration
- Enhanced monitoring with CloudWatch
- Encryption at rest (AWS KMS)
- Encryption in transit (SSL/TLS)
```

### ElastiCache Redis

```
- 3-node cluster (Multi-AZ)
- Automatic failover
- Parameter groups for custom settings
- Encryption in transit
- Subnet group in private VPC
- Security groups restrict to ECS only
```

### ECS Fargate

```
- Serverless container orchestration
- Auto Fargate Spot for cost optimization
- Application Load Balancer with target groups
- Service auto-scaling based on metrics
- CloudWatch Logs integration
- Container Image Registry (ECR)
```

### API Gateway

```
- REST API endpoints
+- HTTP proxy integration to Application Load Balancer
+- `/forecast`, `/credit`, and `/capital` routing
+- Optional custom domain via ACM and Route53
+- CORS configuration
+- CloudWatch metrics
+- X-Ray tracing for performance
```

### API Gateway URL

After deployment, use the API Gateway URL output from Terraform to call the gateway front door. This is the recommended public ingress for service routing and authentication.

If `api_gateway_api_key_enabled` is true, pass `x-api-key: <key>` on calls to the gateway.

### S3

```
- Document storage (audit logs, exports)
- Versioning enabled
- Server-side encryption (AES-256)
- Public access blocked
- Lifecycle policies for archival
- CloudFront integration for caching
```

### Secrets Manager

```
- Store OAuth tokens (Plaid, QuickBooks, Xero)
- API keys and credentials
- Database passwords
- Automatic rotation policies
- Audit logging in CloudTrail
```

## Post-Deployment Steps

### 1. Initialize Database

```bash
# SSH into bastion host or using AWS Session Manager
aws ssm start-session --target $(aws ec2 describe-instances --filters "Name=tag:Name,Values=headroom-bastion" --query "Instances[0].InstanceId" --output text)

# Inside bastion:
psql -h <RDS_ENDPOINT> -U postgres -d headroom < src/db/schema.sql
psql -h <RDS_ENDPOINT> -U postgres -d headroom < src/db/seed.sql
```

### 2. Configure Monitoring

```bash
# Add Datadog API key to Secrets Manager
aws secretsmanager create-secret \
  --name /headroom/datadog/api-key \
  --secret-string "DATADOG_API_KEY_HERE"

# Deploy Datadog agent to ECS task definitions
# See monitoring.tf for agent configuration
```

### 3. Set Up CI/CD

```bash
# CodePipeline watches GitHub for pushes
# Automatically builds and deploys on main branch

# Manual trigger:
aws codepipeline start-pipeline-execution \
  --name headroom-main-pipeline
```

## Scaling Configuration

### Auto-Scaling Policies

```
Forecast Service:
- Min: 2 replicas
- Max: 10 replicas
- Target CPU: 70%
- Target Memory: 80%

Credit Service:
- Min: 1 replica
- Max: 5 replicas
- Target CPU: 75%

Capital Service:
- Min: 1 replica
- Max: 3 replicas
- Target CPU: 75%
```

## Cost Optimization

### Recommendations

1. **Use Fargate Spot** for non-critical services (up to 70% savings)
2. **RDS Reserved Instances** for multi-year commitment (40% savings)
3. **CloudFront caching** to reduce origin load
4. **S3 lifecycle policies** to transition old logs to Glacier
5. **Budget alerts** in AWS Cost Explorer

### Estimated Monthly Cost (Production)

```
RDS PostgreSQL (Multi-AZ)     ~$1,200
ElastiCache Redis              ~$400
ECS Fargate (3 services)       ~$800
API Gateway + Data Transfer    ~$300
S3 + CloudFront               ~$150
Monitoring + Other Services   ~$200
─────────────────────────────────
Total per month ~$3,000 (scales with usage)
```

## Disaster Recovery

### Backup Strategy

- **Database**: Automated daily snapshots (30-day retention)
- **Snapshots**: Cross-region replication to us-west-2
- **RTO**: 15 minutes (restore from snapshot)
- **RPO**: 1 hour (point-in-time recovery)

### Failover Process

```bash
# Automatic failover for RDS Multi-AZ within ~90 seconds
# ECS services automatically rebalance across AZs
# Application continues serving requests

# For catastrophic failure:
# 1. Promote read replica to master
# 2. Update DNS records (Route53)
# 3. Restart ECS services in alternate region
```

## Troubleshooting

### Common Issues

**"Cannot connect to RDS"**
```bash
# Check security group
aws ec2 describe-security-groups --group-ids sg-xxx

# Verify RDS endpoint
aws rds describe-db-instances --db-instance-identifier headroom-postgres
```

**"ECS tasks failing to start"**
```bash
# Check CloudWatch logs
aws logs tail /ecs/headroom-forecast --follow

# Check task definition
aws ecs describe-task-definition --task-definition headroom-forecast
```

**"High latency on API calls"**
```bash
# Check X-Ray traces
# Check RDS performance insights
# Check ElastiCache hit rate
aws elasticache describe-cache-clusters --show-cache-node-info
```

## Maintenance

### Regular Tasks

- [ ] Review CloudWatch alarms weekly
- [ ] Verify backups are occurring
- [ ] Update container images
- [ ] Patch OS vulnerabilities
- [ ] Review costs and optimization
- [ ] Audit IAM permissions

### Upgrade Process

```bash
# Example: Upgrade ECS task definitions

# 1. Create new task definition revision
aws ecs register-task-definition \
  --cli-input-json file://forecast-service-taskdef.json

# 2. Force new deployment
aws ecs update-service \
  --cluster headroom-prod \
  --service forecast-service \
  --force-new-deployment

# 3. Monitor rollout
aws ecs describe-services \
  --cluster headroom-prod \
  --services forecast-service
```

## Security Best Practices

✅ Implemented:
- VPC isolation (private subnets for databases)
- Security groups restrict traffic
- IAM roles with least privilege
- Secrets Manager for sensitive data
- KMS encryption for RDS
- SSL/TLS for data in transit
- VPC endpoints for AWS services
- CloudTrail logging for audit trail

Additional considerations:
- Web application firewall (AWS WAF) on API Gateway
- DDoS protection (AWS Shield Advanced)
- VPN for admin access
- Regular penetration testing
- Incident response playbooks
