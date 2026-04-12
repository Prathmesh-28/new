resource "aws_cloudwatch_metric_alarm" "forecast_cpu_high" {
  alarm_name          = "headroom-${var.environment}-forecast-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors forecast service CPU utilization"
  alarm_actions       = var.datadog_enabled ? [aws_sns_topic.datadog[0].arn] : []

  dimensions = {
    ClusterName = aws_ecs_cluster.headroom.name
    ServiceName = aws_ecs_service.forecast.name
  }

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-forecast-cpu-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "credit_cpu_high" {
  alarm_name          = "headroom-${var.environment}-credit-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors credit service CPU utilization"
  alarm_actions       = var.datadog_enabled ? [aws_sns_topic.datadog[0].arn] : []

  dimensions = {
    ClusterName = aws_ecs_cluster.headroom.name
    ServiceName = aws_ecs_service.credit.name
  }

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-credit-cpu-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "capital_cpu_high" {
  alarm_name          = "headroom-${var.environment}-capital-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors capital service CPU utilization"
  alarm_actions       = var.datadog_enabled ? [aws_sns_topic.datadog[0].arn] : []

  dimensions = {
    ClusterName = aws_ecs_cluster.headroom.name
    ServiceName = aws_ecs_service.capital.name
  }

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-capital-cpu-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "db_cpu_high" {
  alarm_name          = "headroom-${var.environment}-db-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors database CPU utilization"
  alarm_actions       = var.datadog_enabled ? [aws_sns_topic.datadog[0].arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.headroom.identifier
  }

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-db-cpu-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  alarm_name          = "headroom-${var.environment}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = var.datadog_enabled ? [aws_sns_topic.datadog[0].arn] : []

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.redis.cluster_id
  }

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-redis-cpu-alarm"
  })
}

resource "aws_sns_topic" "datadog" {
  count = var.datadog_enabled ? 1 : 0

  name = "headroom-${var.environment}-datadog"

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-datadog-sns"
  })
}

resource "aws_sns_topic_subscription" "datadog" {
  count = var.datadog_enabled ? 1 : 0

  topic_arn = aws_sns_topic.datadog[0].arn
  protocol  = "https"
  endpoint  = "https://app.datadoghq.com/intake/webhook/sns?api_key=${var.datadog_api_key}"
}