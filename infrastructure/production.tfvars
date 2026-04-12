environment = "production"
aws_region = "us-east-1"
terraform_state_bucket = "headroom-terraform-state"

vpc_cidr = "10.0.0.0/16"
az_count = 2

db_instance_class = "db.t3.medium"
db_allocated_storage = 50
db_backup_retention_days = 7
db_multi_az = true

redis_node_type = "cache.t3.micro"
redis_num_cache_nodes = 1

forecast_service_cpu = 512
forecast_service_memory = 1024
forecast_service_desiredCount = 2

credit_service_cpu = 512
credit_service_memory = 1024
credit_service_desiredCount = 2

capital_service_cpu = 512
capital_service_memory = 1024
capital_service_desiredCount = 2

api_gateway_custom_domain = ""
api_gateway_custom_domain_hosted_zone_id = ""
api_gateway_api_key_enabled = false

plaid_client_id = ""
plaid_secret = ""
quickbooks_client_id = ""
quickbooks_secret = ""
xero_client_id = ""
xero_secret = ""

datadog_enabled = false
datadog_api_key = ""

tags = {
  Project = "Headroom"
  Environment = "Production"
}
