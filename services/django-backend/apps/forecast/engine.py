from datetime import date, timedelta
from decimal import Decimal


def generate_forecast_datapoints(transactions: list, window_days: int = 90) -> list:
    """
    Generate 90-day cash flow forecast datapoints from transaction history.

    Algorithm:
    1. Compute average daily cash change from the last 30 transactions
    2. Project linearly with confidence bands (best +15%, downside -25%)
    3. Confidence degrades by 0.1% per day over the horizon
    """
    if not transactions:
        return []

    recent = transactions[:30]
    avg_daily = sum(float(t.amount) for t in recent) / max(len(recent), 1)
    today = date.today()
    datapoints = []

    for day in range(1, window_days + 1):
        base = avg_daily * day
        datapoints.append({
            "date": (today + timedelta(days=day)).isoformat(),
            "best_case": round(base * 1.15, 2),
            "expected_case": round(base, 2),
            "downside_case": round(base * 0.75, 2),
            "confidence_level": round(max(0.1, 0.65 - day * 0.001), 4),
        })

    return datapoints
