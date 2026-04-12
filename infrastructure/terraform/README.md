# Headroom AWS Terraform Infrastructure

This directory contains the Terraform configuration for the Headroom AWS environment.

## What This Includes

- VPC with public and private subnets
- Internet Gateway for public access
- ECS cluster for microservices
- RDS PostgreSQL database (Multi-AZ)
- ElastiCache Redis cluster
- Security groups for ECS, RDS, and Redis
- IAM roles for ECS execution and tasks
- CloudWatch log group for ECS

## How to Use

1. Configure your AWS credentials

```bash
aws configure
```

2. Create a Terraform state bucket

```bash
aws s3api create-bucket \
  --bucket headroom-terraform-state \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket headroom-terraform-state \
  --versioning-configuration Status=Enabled
```

3. Initialize Terraform

```bash
cd infrastructure/terraform
terraform init
```

4. Create a plan

```bash
terraform plan -var-file="../production.tfvars"
```

5. Apply the plan

```bash
terraform apply -var-file="../production.tfvars"
```

## Notes

- Terraform now includes ECR repositories for each service and an Application Load Balancer for path-based routing.
- After `terraform apply`, use the `alb_dns_name`, `forecast_url`, `credit_url`, `capital_url`, and `api_gateway_url` outputs to reach the services.
- The API Gateway front door is configured for `/forecast`, `/credit`, and `/capital` routes.
- Optional custom domain support is available via `api_gateway_custom_domain` and `api_gateway_custom_domain_hosted_zone_id` variables.
- Optional API key protection is available via `api_gateway_api_key_enabled`.
- When `api_gateway_custom_domain` is set, Terraform validates the hosted zone ID and creates ACM DNS validation records automatically.
- Use secure handling for sensitive variables.
