resource "aws_api_gateway_rest_api" "headroom" {
  name        = "headroom-${var.environment}-api"
  description = "Headroom API Gateway for service routing"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

locals {
  api_target_uri = "http://${aws_lb.headroom.dns_name}"
}

resource "aws_api_gateway_resource" "forecast" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  parent_id   = aws_api_gateway_rest_api.headroom.root_resource_id
  path_part   = "forecast"
}

resource "aws_api_gateway_resource" "forecast_proxy" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  parent_id   = aws_api_gateway_resource.forecast.id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "forecast_any" {
  rest_api_id     = aws_api_gateway_rest_api.headroom.id
  resource_id     = aws_api_gateway_resource.forecast.id
  http_method     = "ANY"
  authorization   = "NONE"
  api_key_required = var.api_gateway_api_key_enabled
}

resource "aws_api_gateway_integration" "forecast_any" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  resource_id = aws_api_gateway_resource.forecast.id
  http_method = aws_api_gateway_method.forecast_any.http_method
  type        = "HTTP_PROXY"
  uri         = "${local.api_target_uri}:8001/forecast"
  passthrough_behavior = "WHEN_NO_MATCH"
  connection_type      = "INTERNET"
}

resource "aws_api_gateway_method" "forecast_proxy_any" {
  rest_api_id     = aws_api_gateway_rest_api.headroom.id
  resource_id     = aws_api_gateway_resource.forecast_proxy.id
  http_method     = "ANY"
  authorization   = "NONE"
  api_key_required = var.api_gateway_api_key_enabled
}

resource "aws_api_gateway_integration" "forecast_proxy_any" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  resource_id = aws_api_gateway_resource.forecast_proxy.id
  http_method = aws_api_gateway_method.forecast_proxy_any.http_method
  type        = "HTTP_PROXY"
  uri         = "${local.api_target_uri}:8001/forecast/{proxy}"
  request_parameters = {
    "integration.request.path.proxy" = "method.request.path.proxy"
  }
  passthrough_behavior = "WHEN_NO_MATCH"
  connection_type      = "INTERNET"
}

resource "aws_api_gateway_resource" "credit" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  parent_id   = aws_api_gateway_rest_api.headroom.root_resource_id
  path_part   = "credit"
}

resource "aws_api_gateway_resource" "credit_proxy" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  parent_id   = aws_api_gateway_resource.credit.id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "credit_any" {
  rest_api_id     = aws_api_gateway_rest_api.headroom.id
  resource_id     = aws_api_gateway_resource.credit.id
  http_method     = "ANY"
  authorization   = "NONE"
  api_key_required = var.api_gateway_api_key_enabled
}

resource "aws_api_gateway_integration" "credit_any" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  resource_id = aws_api_gateway_resource.credit.id
  http_method = aws_api_gateway_method.credit_any.http_method
  type        = "HTTP_PROXY"
  uri         = "${local.api_target_uri}:8002/credit"
  passthrough_behavior = "WHEN_NO_MATCH"
  connection_type      = "INTERNET"
}

resource "aws_api_gateway_method" "credit_proxy_any" {
  rest_api_id     = aws_api_gateway_rest_api.headroom.id
  resource_id     = aws_api_gateway_resource.credit_proxy.id
  http_method     = "ANY"
  authorization   = "NONE"
  api_key_required = var.api_gateway_api_key_enabled
}

resource "aws_api_gateway_integration" "credit_proxy_any" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  resource_id = aws_api_gateway_resource.credit_proxy.id
  http_method = aws_api_gateway_method.credit_proxy_any.http_method
  type        = "HTTP_PROXY"
  uri         = "${local.api_target_uri}:8002/credit/{proxy}"
  request_parameters = {
    "integration.request.path.proxy" = "method.request.path.proxy"
  }
  passthrough_behavior = "WHEN_NO_MATCH"
  connection_type      = "INTERNET"
}

resource "aws_api_gateway_resource" "capital" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  parent_id   = aws_api_gateway_rest_api.headroom.root_resource_id
  path_part   = "capital"
}

resource "aws_api_gateway_resource" "capital_proxy" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  parent_id   = aws_api_gateway_resource.capital.id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "capital_any" {
  rest_api_id     = aws_api_gateway_rest_api.headroom.id
  resource_id     = aws_api_gateway_resource.capital.id
  http_method     = "ANY"
  authorization   = "NONE"
  api_key_required = var.api_gateway_api_key_enabled
}

resource "aws_api_gateway_integration" "capital_any" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  resource_id = aws_api_gateway_resource.capital.id
  http_method = aws_api_gateway_method.capital_any.http_method
  type        = "HTTP_PROXY"
  uri         = "${local.api_target_uri}:8003/capital"
  passthrough_behavior = "WHEN_NO_MATCH"
  connection_type      = "INTERNET"
}

resource "aws_api_gateway_method" "capital_proxy_any" {
  rest_api_id     = aws_api_gateway_rest_api.headroom.id
  resource_id     = aws_api_gateway_resource.capital_proxy.id
  http_method     = "ANY"
  authorization   = "NONE"
  api_key_required = var.api_gateway_api_key_enabled
}

resource "aws_api_gateway_integration" "capital_proxy_any" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  resource_id = aws_api_gateway_resource.capital_proxy.id
  http_method = aws_api_gateway_method.capital_proxy_any.http_method
  type        = "HTTP_PROXY"
  uri         = "${local.api_target_uri}:8003/capital/{proxy}"
  request_parameters = {
    "integration.request.path.proxy" = "method.request.path.proxy"
  }
  passthrough_behavior = "WHEN_NO_MATCH"
  connection_type      = "INTERNET"
}

resource "aws_api_gateway_deployment" "headroom" {
  rest_api_id = aws_api_gateway_rest_api.headroom.id
  stage_name  = var.environment

  depends_on = [
    aws_api_gateway_integration.forecast_any,
    aws_api_gateway_integration.forecast_proxy_any,
    aws_api_gateway_integration.credit_any,
    aws_api_gateway_integration.credit_proxy_any,
    aws_api_gateway_integration.capital_any,
    aws_api_gateway_integration.capital_proxy_any,
  ]
}

resource "aws_api_gateway_api_key" "headroom" {
  count = var.api_gateway_api_key_enabled ? 1 : 0

  name        = "headroom-${var.environment}-key"
  description = "API key for Headroom API Gateway"
  enabled     = true
}

resource "aws_api_gateway_usage_plan" "headroom" {
  count = var.api_gateway_api_key_enabled ? 1 : 0

  name = "headroom-${var.environment}-usage-plan"

  api_stages {
    api_id = aws_api_gateway_rest_api.headroom.id
    stage  = aws_api_gateway_deployment.headroom.stage_name
  }

  throttle_settings {
    burst_limit = 100
    rate_limit  = 50
  }

  quota_settings {
    limit  = 10000
    period = "MONTH"
  }
}

resource "aws_api_gateway_usage_plan_key" "headroom" {
  count = var.api_gateway_api_key_enabled ? 1 : 0

  key_id        = aws_api_gateway_api_key.headroom[0].id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.headroom[0].id
}

resource "aws_acm_certificate" "api_gateway" {
  count = var.api_gateway_custom_domain != "" ? 1 : 0

  domain_name       = var.api_gateway_custom_domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_gateway_certificate_validation" {
  count   = var.api_gateway_custom_domain != "" ? 1 : 0
  zone_id = var.api_gateway_custom_domain_hosted_zone_id
  name    = aws_acm_certificate.api_gateway[0].domain_validation_options[0].resource_record_name
  type    = aws_acm_certificate.api_gateway[0].domain_validation_options[0].resource_record_type
  ttl     = 300
  records = [aws_acm_certificate.api_gateway[0].domain_validation_options[0].resource_record_value]
}

resource "aws_acm_certificate_validation" "api_gateway" {
  count               = var.api_gateway_custom_domain != "" ? 1 : 0
  certificate_arn     = aws_acm_certificate.api_gateway[0].arn
  validation_record_fqdns = [aws_route53_record.api_gateway_certificate_validation[0].fqdn]
}

resource "aws_api_gateway_domain_name" "headroom" {
  count = var.api_gateway_custom_domain != "" ? 1 : 0

  domain_name = var.api_gateway_custom_domain
  certificate_arn = aws_acm_certificate_validation.api_gateway[0].certificate_arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "headroom" {
  count = var.api_gateway_custom_domain != "" ? 1 : 0

  api_id      = aws_api_gateway_rest_api.headroom.id
  stage_name  = var.environment
  domain_name = aws_api_gateway_domain_name.headroom[0].domain_name
}

resource "aws_route53_record" "api_gateway_alias" {
  count   = var.api_gateway_custom_domain != "" ? 1 : 0
  zone_id = var.api_gateway_custom_domain_hosted_zone_id
  name    = var.api_gateway_custom_domain
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.headroom[0].regional_domain_name
    zone_id                = aws_api_gateway_domain_name.headroom[0].regional_zone_id
    evaluate_target_health = false
  }
}
