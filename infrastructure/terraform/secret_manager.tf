resource "aws_secretsmanager_secret" "db_password" {
  name                    = "headroom/${var.environment}/db-password"
  description             = "Database password for Headroom ${var.environment}"
  recovery_window_in_days = 0

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-db-password"
  })
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    password = random_password.db_password.result
  })
}

resource "aws_secretsmanager_secret" "oauth_tokens" {
  name                    = "headroom/${var.environment}/oauth-tokens"
  description             = "OAuth tokens for third-party integrations (Plaid, QuickBooks, Xero)"
  recovery_window_in_days = 30

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-oauth-tokens"
  })
}

resource "aws_secretsmanager_secret_version" "oauth_tokens" {
  secret_id = aws_secretsmanager_secret.oauth_tokens.id
  secret_string = jsonencode({
    plaid_client_id     = var.plaid_client_id != "" ? var.plaid_client_id : null
    plaid_secret        = var.plaid_secret != "" ? var.plaid_secret : null
    quickbooks_client_id = var.quickbooks_client_id != "" ? var.quickbooks_client_id : null
    quickbooks_secret   = var.quickbooks_secret != "" ? var.quickbooks_secret : null
    xero_client_id      = var.xero_client_id != "" ? var.xero_client_id : null
    xero_secret         = var.xero_secret != "" ? var.xero_secret : null
  })
}