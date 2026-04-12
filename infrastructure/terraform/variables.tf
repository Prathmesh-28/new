variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "staging"
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "terraform_state_bucket" {
  description = "S3 bucket for Terraform state"
  type        = string
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  type        = number
  default     = 2
}

variable "db_instance_class" {
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  type        = number
  default     = 50
}

variable "db_backup_retention_days" {
  type        = number
  default     = 7
}

variable "db_multi_az" {
  type        = bool
  default     = true
}

variable "redis_node_type" {
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  type        = number
  default     = 1
}

variable "forecast_service_cpu" {
  type        = number
  default     = 512
}

variable "forecast_service_memory" {
  type        = number
  default     = 1024
}

variable "forecast_service_desiredCount" {
  type        = number
  default     = 2
}

variable "credit_service_cpu" {
  type        = number
  default     = 512
}

variable "credit_service_memory" {
  type        = number
  default     = 1024
}

variable "credit_service_desiredCount" {
  type        = number
  default     = 2
}

variable "capital_service_cpu" {
  type        = number
  default     = 512
}

variable "capital_service_memory" {
  type        = number
  default     = 1024
}

variable "capital_service_desiredCount" {
  type        = number
  default     = 2
}

variable "tags" {
  type = map(string)
  default = {}
}

variable "api_gateway_custom_domain" {
  description = "Optional custom domain name for the API Gateway front door. Example: api.example.com"
  type        = string
  default     = ""
}

variable "api_gateway_custom_domain_hosted_zone_id" {
  description = "Route53 hosted zone ID for the custom API Gateway domain. Required when api_gateway_custom_domain is set."
  type        = string
  default     = ""

  validation {
    condition     = var.api_gateway_custom_domain == "" || var.api_gateway_custom_domain_hosted_zone_id != ""
    error_message = "Set api_gateway_custom_domain_hosted_zone_id when api_gateway_custom_domain is provided."
  }
}

variable "api_gateway_api_key_enabled" {
  description = "Enable API key authentication for the API Gateway routes."
  type        = bool
  default     = false
}

variable "plaid_client_id" {
  description = "Plaid client ID for bank connections"
  type        = string
  default     = ""
  sensitive   = true
}

variable "plaid_secret" {
  description = "Plaid secret for bank connections"
  type        = string
  default     = ""
  sensitive   = true
}

variable "quickbooks_client_id" {
  description = "QuickBooks client ID for accounting integration"
  type        = string
  default     = ""
  sensitive   = true
}

variable "quickbooks_secret" {
  description = "QuickBooks secret for accounting integration"
  type        = string
  default     = ""
  sensitive   = true
}

variable "xero_client_id" {
  description = "Xero client ID for accounting integration"
  type        = string
  default     = ""
  sensitive   = true
}

variable "xero_secret" {
  description = "Xero secret for accounting integration"
  type        = string
  default     = ""
  sensitive   = true
}

variable "datadog_enabled" {
  description = "Enable Datadog monitoring and alerting"
  type        = bool
  default     = false
}

variable "datadog_api_key" {
  description = "Datadog API key for monitoring integration"
  type        = string
  default     = ""
  sensitive   = true
}
