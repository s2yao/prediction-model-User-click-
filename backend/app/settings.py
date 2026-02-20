from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # Security: Only record/execute on allowed hosts.
    allowed_hosts: list[str] = Field(default_factory=lambda: ["localhost:3000"])
    # Sessionization idle gap (ms)
    idle_gap_ms: int = 15_000
    # Coarse DOM mutation sample interval (ms)
    dom_mutation_sample_ms: int = 1000
    # Max stored events in memory
    max_events: int = 20_000


settings = Settings()
