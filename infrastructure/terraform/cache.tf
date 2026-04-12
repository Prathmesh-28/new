resource "aws_elasticache_subnet_group" "headroom" {
  name      = "headroom-${var.environment}-cache-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-cache-subnet-group"
  })
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "headroom-${var.environment}-redis"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.headroom.name
  security_group_ids   = [aws_security_group.redis.id]
  engine_version       = "7.0"
  port                 = 6379
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-redis"
  })
}
