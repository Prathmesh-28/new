resource "aws_s3_bucket" "headroom" {
  bucket = "headroom-${var.environment}-documents-${random_string.bucket_suffix.result}"

  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-documents"
  })
}

resource "random_string" "bucket_suffix" {
  length  = 8
  lower   = true
  upper   = false
  numeric = true
  special = false
}

resource "aws_s3_bucket_versioning" "headroom" {
  bucket = aws_s3_bucket.headroom.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "headroom" {
  bucket = aws_s3_bucket.headroom.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "headroom" {
  bucket = aws_s3_bucket.headroom.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "headroom" {
  bucket = aws_s3_bucket.headroom.id

  rule {
    id     = "archive_old_documents"
    status = "Enabled"

    filter {
      prefix = "exports/"
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555  # 7 years
    }
  }
}