#!/bin/bash

# Deploy to AWS production environment

set -e

ENVIRONMENT=${1:-staging}
AWS_REGION=${AWS_REGION:-us-east-1}

echo "🚀 Deploying Headroom to $ENVIRONMENT..."

# Check dependencies
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found. Install it first."; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "❌ Terraform not found. Install it first."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker not found. Install it first."; exit 1; }

# Build Docker images
echo "🐳 Building Docker images..."
docker build -t headroom-forecast:${ENVIRONMENT} -f services/forecast-service/Dockerfile services/forecast-service/
docker build -t headroom-credit:${ENVIRONMENT} -f services/credit-service/Dockerfile services/credit-service/
docker build -t headroom-capital:${ENVIRONMENT} -f services/capital-service/Dockerfile services/capital-service/

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Login to ECR
echo "🔑 Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Push images to ECR
echo "📤 Pushing Docker images to ECR..."
docker tag headroom-forecast:${ENVIRONMENT} $ECR_REGISTRY/headroom-forecast:${ENVIRONMENT}
docker push $ECR_REGISTRY/headroom-forecast:${ENVIRONMENT}

docker tag headroom-credit:${ENVIRONMENT} $ECR_REGISTRY/headroom-credit:${ENVIRONMENT}
docker push $ECR_REGISTRY/headroom-credit:${ENVIRONMENT}

docker tag headroom-capital:${ENVIRONMENT} $ECR_REGISTRY/headroom-capital:${ENVIRONMENT}
docker push $ECR_REGISTRY/headroom-capital:${ENVIRONMENT}

# Deploy infrastructure
echo "🏗️  Deploying infrastructure with Terraform..."
cd infrastructure/terraform

terraform init
terraform plan -var-file="../${ENVIRONMENT}.tfvars" -out=tfplan
terraform apply tfplan

cd ../..

# Update ECS services
echo "🚀 Updating ECS services..."
CLUSTER_NAME="headroom-${ENVIRONMENT}-cluster"

aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "headroom-forecast-${ENVIRONMENT}" \
  --force-new-deployment \
  --region "$AWS_REGION"

aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "headroom-credit-${ENVIRONMENT}" \
  --force-new-deployment \
  --region "$AWS_REGION"

aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "headroom-capital-${ENVIRONMENT}" \
  --force-new-deployment \
  --region "$AWS_REGION"

echo "✅ Deployment to $ENVIRONMENT complete!"
echo ""
echo "📊 Monitor deployment:"
echo "   https://console.aws.amazon.com/ecs/v2/clusters/headroom-${ENVIRONMENT}"
echo ""
echo "📊 Datadog dashboard:"
echo "   https://app.datadoghq.com"
