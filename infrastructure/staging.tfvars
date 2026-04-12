environment = "staging"
aws_region = "us-east-1"
terraform_state_bucket = "headroom-terraform-state"

vpc_cidr = "10.0.0.0/16"
az_count = 2

db_instance_class = "db.t3.micro"
db_allocated_storage = 20
db_backup_retention_days = 3
db_multi_az = false

redis_node_type = "cache.t3.micro"
redis_num_cache_nodes = 1

forecast_service_cpu = 512
forecast_service_memory = 1024
forecast_service_desiredCount = 1

credit_service_cpu = 512
credit_service_memory = 1024
credit_service_desiredCount = 1

capital_service_cpu = 512
capital_service_memory = 1024
capital_service_desiredCount = 1

tags = {
  Project = "Headroom"
  Environment = "Staging"
}
