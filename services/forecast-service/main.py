import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.pool import SimpleConnectionPool
from pydantic import BaseModel
from pydantic_settings import BaseSettings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings from environment variables"""
    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", 5432))
    db_name: str = os.getenv("DB_NAME", "headroom")
    db_user: str = os.getenv("DB_USER", "postgres")
    db_password: str = os.getenv("DB_PASSWORD", "postgres")
    
    environment: str = os.getenv("ENVIRONMENT", "development")
    service_name: str = "forecast-service"
    service_port: int = 8001


settings = Settings()

# Database connection pool
db_pool = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager"""
    # Startup
    global db_pool
    try:
        db_pool = SimpleConnectionPool(
            1, 5,
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
            user=settings.db_user,
            password=settings.db_password
        )
        logger.info("✅ Database pool initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database pool: {e}")
        raise
    
    yield
    
    # Shutdown
    if db_pool:
        db_pool.closeall()
        logger.info("✅ Database pool closed")


app = FastAPI(
    title="Headroom Forecast Service",
    description="90-day cash flow forecasting engine",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Models ====================

class ForecastRequest(BaseModel):
    """Request to generate a forecast"""
    tenant_id: str
    window_days: int = 90


class ForecastDatapoint(BaseModel):
    """Single forecast datapoint"""
    date: str
    best_case: float
    expected_case: float
    downside_case: float
    confidence_level: float


class ForecastResponse(BaseModel):
    """Forecast generation response"""
    forecast_id: str
    tenant_id: str
    status: str
    days_forecasted: int
    datapoints: list[ForecastDatapoint]


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    environment: str
    timestamp: str


# ==================== Database Functions ====================

def get_db_connection():
    """Get a connection from the pool"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection pool not initialized"
        )
    return db_pool.getconn()


def return_db_connection(conn):
    """Return a connection to the pool"""
    if db_pool and conn:
        db_pool.putconn(conn)


# ==================== Helper Functions ====================

def get_tenant_transactions(conn, tenant_id: str):
    """Fetch transactions for a tenant"""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT 
                date,
                amount,
                category,
                is_recurring,
                frequency,
                confidence_score
            FROM transactions
            WHERE tenant_id = %s
            ORDER BY date DESC
            LIMIT 1000
        """, (tenant_id,))
        
        rows = cursor.fetchall()
        return [
            {
                'date': row[0],
                'amount': row[1],
                'category': row[2],
                'is_recurring': row[3],
                'frequency': row[4],
                'confidence_score': row[5]
            }
            for row in rows
        ]
    finally:
        cursor.close()


def generate_forecast_datapoints(transactions: list, window_days: int = 90):
    """
    Generate forecast datapoints based on transactions
    
    Algorithm:
    1. Categorize transactions
    2. Detect recurring patterns
    3. Calculate confidence bands
    4. Generate 90-day projections
    """
    if not transactions:
        logger.warning("No transactions available for forecasting")
        return []
    
    # Simple mock implementation for now
    # TODO: Replace with actual ML model
    datapoints = []
    today = datetime.now()
    
    # Calculate average daily balance change
    recent_sum = sum(t['amount'] for t in transactions[:30])
    avg_daily_change = recent_sum / 30 if transactions else 0
    
    for day_offset in range(1, window_days + 1):
        forecast_date = today + timedelta(days=day_offset)
        
        # Generate simple linear projection with variance
        base_projection = avg_daily_change * day_offset
        
        # Confidence bands: best (+15%), expected (0%), downside (-25%)
        datapoints.append({
            'date': forecast_date.isoformat(),
            'best_case': base_projection * 1.15,
            'expected_case': base_projection,
            'downside_case': base_projection * 0.75,
            'confidence_level': 0.65 - (day_offset * 0.001)  # Confidence decreases over time
        })
    
    return datapoints


def store_forecast(conn, tenant_id: str, datapoints: list):
    """Store forecast in database"""
    cursor = conn.cursor()
    try:
        # Create forecast record
        cursor.execute("""
            INSERT INTO forecasts (tenant_id, forecast_date, days_forecasted, status, generated_at)
            VALUES (%s, CURRENT_DATE, %s, 'complete', CURRENT_TIMESTAMP)
            RETURNING id
        """, (tenant_id, len(datapoints)))
        
        forecast_id = cursor.fetchone()[0]
        
        # Insert datapoints
        for dp in datapoints:
            cursor.execute("""
                INSERT INTO forecast_datapoints 
                (forecast_id, date, best_case, expected_case, downside_case, confidence_level)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                forecast_id,
                dp['date'],
                dp['best_case'],
                dp['expected_case'],
                dp['downside_case'],
                dp['confidence_level']
            ))
        
        conn.commit()
        logger.info(f"✅ Forecast {forecast_id} stored for tenant {tenant_id}")
        return str(forecast_id)
        
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Failed to store forecast: {e}")
        raise
    finally:
        cursor.close()


# ==================== API Endpoints ====================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        service=settings.service_name,
        environment=settings.environment,
        timestamp=datetime.now().isoformat()
    )


@app.post("/forecast/generate", response_model=ForecastResponse)
async def generate_forecast(request: ForecastRequest):
    """
    Generate a 90-day cash flow forecast for a tenant
    
    Algorithm:
    1. Fetch tenant's transactions
    2. Normalize and categorize
    3. Detect recurring patterns
    4. Generate projections (best, expected, downside)
    5. Store in database
    6. Return forecast with datapoints
    """
    logger.info(f"📊 Generating forecast for tenant {request.tenant_id}")
    
    conn = get_db_connection()
    try:
        # Fetch transactions
        transactions = get_tenant_transactions(conn, request.tenant_id)
        logger.info(f"  Fetched {len(transactions)} transactions")
        
        # Generate datapoints
        datapoints = generate_forecast_datapoints(transactions, request.window_days)
        logger.info(f"  Generated {len(datapoints)} datapoints")
        
        # Store forecast
        forecast_id = store_forecast(conn, request.tenant_id, datapoints)
        
        return ForecastResponse(
            forecast_id=forecast_id,
            tenant_id=request.tenant_id,
            status="complete",
            days_forecasted=request.window_days,
            datapoints=[ForecastDatapoint(**dp) for dp in datapoints]
        )
        
    except Exception as e:
        logger.error(f"❌ Forecast generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        return_db_connection(conn)


@app.get("/forecast/{forecast_id}")
async def get_forecast(forecast_id: str):
    """Get a previously generated forecast"""
    logger.info(f"🔍 Retrieving forecast {forecast_id}")
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Fetch forecast
        cursor.execute("""
            SELECT id, tenant_id, days_forecasted, generated_at, status
            FROM forecasts
            WHERE id = %s
        """, (forecast_id,))
        
        forecast = cursor.fetchone()
        if not forecast:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Forecast {forecast_id} not found"
            )
        
        # Fetch datapoints
        cursor.execute("""
            SELECT date, best_case, expected_case, downside_case, confidence_level
            FROM forecast_datapoints
            WHERE forecast_id = %s
            ORDER BY date
        """, (forecast_id,))
        
        datapoints = [
            {
                'date': row[0].isoformat(),
                'best_case': row[1],
                'expected_case': row[2],
                'downside_case': row[3],
                'confidence_level': row[4]
            }
            for row in cursor.fetchall()
        ]
        
        cursor.close()
        
        return {
            'forecast_id': str(forecast[0]),
            'tenant_id': str(forecast[1]),
            'days_forecasted': forecast[2],
            'generated_at': forecast[3].isoformat(),
            'status': forecast[4],
            'datapoints': datapoints
        }
        
    finally:
        return_db_connection(conn)


@app.get("/forecast/tenant/{tenant_id}/latest")
async def get_latest_forecast(tenant_id: str):
    """Get the most recent forecast for a tenant"""
    logger.info(f"🔍 Retrieving latest forecast for tenant {tenant_id}")
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id FROM forecasts
            WHERE tenant_id = %s
            ORDER BY generated_at DESC
            LIMIT 1
        """, (tenant_id,))
        
        result = cursor.fetchone()
        cursor.close()
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No forecast found for tenant {tenant_id}"
            )
        
        forecast_id = result[0]
        # Reuse get_forecast endpoint
        return await get_forecast(str(forecast_id))
        
    finally:
        return_db_connection(conn)


@app.post("/forecast/recalculate")
async def recalculate_forecast(tenant_id: str):
    """
    Trigger recalculation of forecast for a tenant
    This endpoint would typically be called:
    - On a schedule (daily)
    - When new transactions are added
    - When user adjusts parameters
    """
    logger.info(f"🔄 Triggering forecast recalculation for tenant {tenant_id}")
    
    return await generate_forecast(ForecastRequest(
        tenant_id=tenant_id,
        window_days=90
    ))


# ==================== Error Handlers ====================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Global HTTP exception handler"""
    logger.error(f"HTTP {exc.status_code}: {exc.detail}")
    return {
        'error': exc.detail,
        'status_code': exc.status_code,
        'timestamp': datetime.now().isoformat()
    }


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unexpected error: {exc}")
    return {
        'error': 'Internal server error',
        'status_code': 500,
        'timestamp': datetime.now().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.service_port,
        reload=settings.environment == "development",
        log_level="info"
    )
