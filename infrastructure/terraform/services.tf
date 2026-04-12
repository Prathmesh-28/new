resource "aws_ecs_cluster" "headroom" {
  name = "headroom-${var.environment}-cluster"
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-cluster"
  })
}

resource "aws_ecr_repository" "forecast" {
  name                 = "headroom-forecast-${var.environment}"
  image_tag_mutability = "MUTABLE"
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-forecast-ecr"
  })
}

resource "aws_ecr_repository" "credit" {
  name                 = "headroom-credit-${var.environment}"
  image_tag_mutability = "MUTABLE"
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-credit-ecr"
  })
}

resource "aws_ecr_repository" "capital" {
  name                 = "headroom-capital-${var.environment}"
  image_tag_mutability = "MUTABLE"
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-capital-ecr"
  })
}

resource "aws_lb" "headroom" {
  name               = "headroom-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-alb"
  })
}

resource "aws_lb_target_group" "forecast" {
  name        = "headroom-forecast-tg-${var.environment}"
  port        = 8001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.headroom.id
  target_type = "ip"
  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }
}

resource "aws_lb_target_group" "credit" {
  name        = "headroom-credit-tg-${var.environment}"
  port        = 8002
  protocol    = "HTTP"
  vpc_id      = aws_vpc.headroom.id
  target_type = "ip"
  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }
}

resource "aws_lb_target_group" "capital" {
  name        = "headroom-capital-tg-${var.environment}"
  port        = 8003
  protocol    = "HTTP"
  vpc_id      = aws_vpc.headroom.id
  target_type = "ip"
  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.headroom.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "forecast" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.forecast.arn
  }
  condition {
    path_pattern {
      values = ["/forecast", "/forecast/*"]
    }
  }
}

resource "aws_lb_listener_rule" "credit" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.credit.arn
  }
  condition {
    path_pattern {
      values = ["/credit", "/credit/*"]
    }
  }
}

resource "aws_lb_listener_rule" "capital" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 30
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.capital.arn
  }
  condition {
    path_pattern {
      values = ["/capital", "/capital/*"]
    }
  }
}

resource "aws_ecs_task_definition" "forecast" {
  family                   = "headroom-forecast-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.forecast_service_cpu
  memory                   = var.forecast_service_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "forecast-service"
      image     = "${aws_ecr_repository.forecast.repository_url}:${var.environment}"
      essential = true
      portMappings = [
        {
          containerPort = 8001
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "DB_HOST", value = aws_db_instance.headroom.address }
        { name = "DB_PORT", value = "5432" }
        { name = "DB_NAME", value = "headroom" }
        { name = "DB_USER", value = "postgres" }
        { name = "DB_PASSWORD", value = random_password.db_password.result }
        { name = "REDIS_HOST", value = aws_elasticache_cluster.redis.cache_nodes[0].address }
        { name = "REDIS_PORT", value = "6379" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.headroom.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "forecast"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "forecast" {
  name            = "headroom-forecast-${var.environment}"
  cluster         = aws_ecs_cluster.headroom.id
  task_definition = aws_ecs_task_definition.forecast.arn
  desired_count   = var.forecast_service_desiredCount
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.forecast.arn
    container_name   = "forecast-service"
    container_port   = 8001
  }
}

resource "aws_ecs_task_definition" "credit" {
  family                   = "headroom-credit-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.credit_service_cpu
  memory                   = var.credit_service_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "credit-service"
      image     = "${aws_ecr_repository.credit.repository_url}:${var.environment}"
      essential = true
      portMappings = [
        {
          containerPort = 8002
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "DB_HOST", value = aws_db_instance.headroom.address }
        { name = "DB_PORT", value = "5432" }
        { name = "DB_NAME", value = "headroom" }
        { name = "DB_USER", value = "postgres" }
        { name = "DB_PASSWORD", value = random_password.db_password.result }
        { name = "REDIS_HOST", value = aws_elasticache_cluster.redis.cache_nodes[0].address }
        { name = "REDIS_PORT", value = "6379" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.headroom.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "credit"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "credit" {
  name            = "headroom-credit-${var.environment}"
  cluster         = aws_ecs_cluster.headroom.id
  task_definition = aws_ecs_task_definition.credit.arn
  desired_count   = var.credit_service_desiredCount
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.credit.arn
    container_name   = "credit-service"
    container_port   = 8002
  }
}

resource "aws_ecs_task_definition" "capital" {
  family                   = "headroom-capital-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.capital_service_cpu
  memory                   = var.capital_service_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "capital-service"
      image     = "${aws_ecr_repository.capital.repository_url}:${var.environment}"
      essential = true
      portMappings = [
        {
          containerPort = 8003
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "DB_HOST", value = aws_db_instance.headroom.address }
        { name = "DB_PORT", value = "5432" }
        { name = "DB_NAME", value = "headroom" }
        { name = "DB_USER", value = "postgres" }
        { name = "DB_PASSWORD", value = random_password.db_password.result }
        { name = "REDIS_HOST", value = aws_elasticache_cluster.redis.cache_nodes[0].address }
        { name = "REDIS_PORT", value = "6379" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.headroom.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "capital"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "capital" {
  name            = "headroom-capital-${var.environment}"
  cluster         = aws_ecs_cluster.headroom.id
  task_definition = aws_ecs_task_definition.capital.arn
  desired_count   = var.capital_service_desiredCount
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.capital.arn
    container_name   = "capital-service"
    container_port   = 8003
  }
}

resource "aws_cloudwatch_log_group" "headroom" {
  name              = "/ecs/headroom-${var.environment}"
  retention_in_days = 14
}
