output "vpc_id" {
  value = aws_vpc.headroom.id
}

output "db_endpoint" {
  value = aws_db_instance.headroom.address
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "alb_dns_name" {
  value = aws_lb.headroom.dns_name
}

output "forecast_url" {
  value = "http://${aws_lb.headroom.dns_name}/forecast"
}

output "credit_url" {
  value = "http://${aws_lb.headroom.dns_name}/credit"
}

output "capital_url" {
  value = "http://${aws_lb.headroom.dns_name}/capital"
}

output "api_gateway_url" {
  value = "https://${split(\":\", aws_api_gateway_rest_api.headroom.execution_arn)[5]}/${var.environment}"
}

output "api_gateway_custom_domain" {
  value = var.api_gateway_custom_domain != "" ? var.api_gateway_custom_domain : null
}

output "api_gateway_custom_url" {
  value = var.api_gateway_custom_domain != "" ? "https://${var.api_gateway_custom_domain}" : null
}

output "api_gateway_api_key" {
  value     = var.api_gateway_api_key_enabled ? aws_api_gateway_api_key.headroom[0].value : null
  sensitive = true
}

output "forecast_ecr_repository" {
  value = aws_ecr_repository.forecast.repository_url
}

output "credit_ecr_repository" {
  value = aws_ecr_repository.credit.repository_url
}

output "capital_ecr_repository" {
  value = aws_ecr_repository.capital.repository_url
}

output "forecast_service" {
  value = aws_ecs_service.forecast.id
}

output "credit_service" {
  value = aws_ecs_service.credit.id
}

output "capital_service" {
  value = aws_ecs_service.capital.id
}

output "s3_bucket_name" {
  value = aws_s3_bucket.headroom.bucket
}

output "s3_bucket_arn" {
  value = aws_s3_bucket.headroom.arn
}

output "secrets_manager_db_password_arn" {
  value = aws_secretsmanager_secret.db_password.arn
}

output "secrets_manager_oauth_tokens_arn" {
  value = aws_secretsmanager_secret.oauth_tokens.arn
}
