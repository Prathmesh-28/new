resource "aws_db_subnet_group" "headroom" {
  name       = "headroom-${var.environment}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-db-subnet-group"
  })
}

resource "aws_db_instance" "headroom" {
  identifier              = "headroom-${var.environment}-db"
  engine                  = "postgres"
  engine_version          = "16.4"
  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  max_allocated_storage   = var.db_allocated_storage
  backup_retention_period = var.db_backup_retention_days
  multi_az                = var.db_multi_az
  publicly_accessible     = false
  storage_encrypted       = true
  db_subnet_group_name    = aws_db_subnet_group.headroom.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  username                = "postgres"
  password                = random_password.db_password.result
  skip_final_snapshot     = true

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-db"
  })
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}
