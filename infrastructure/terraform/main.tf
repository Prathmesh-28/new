resource "aws_vpc" "headroom" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-vpc"
  })
}

resource "aws_internet_gateway" "headroom" {
  vpc_id = aws_vpc.headroom.id
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-igw"
  })
}

resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.headroom.id
  cidr_block              = cidrsubnet(aws_vpc.headroom.cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-public-${count.index}"
  })
}

resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.headroom.id
  cidr_block        = cidrsubnet(aws_vpc.headroom.cidr_block, 8, count.index + var.az_count)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-private-${count.index}"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.headroom.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.headroom.id
  }
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-public-rt"
  })
}

resource "aws_eip" "nat" {
  count = var.az_count
  vpc   = true
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-nat-${count.index}"
  })
}

resource "aws_nat_gateway" "headroom" {
  count         = var.az_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.headroom]
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-nat-${count.index}"
  })
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.headroom.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.headroom[0].id
  }
  tags = merge(var.tags, {
    Name = "headroom-${var.environment}-private-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

data "aws_availability_zones" "available" {}
