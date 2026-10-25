from fastapi import APIRouter

from app.providers import selected_registry
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health/live", response_model=HealthResponse)
def live() -> HealthResponse:
    registry = selected_registry()
    return HealthResponse(
        analysis_available=all(
            registry.entries.get(name, {}).get("available", False)
            for name in ("sentiment", "aspects")
        )
    )
