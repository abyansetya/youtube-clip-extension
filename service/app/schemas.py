from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ResolveRequest(BaseModel):
    url: str = Field(min_length=1, description="YouTube watch/shorts URL")


class DownloadRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str = Field(min_length=1, description="YouTube watch/shorts URL")
    format_id: str = Field(
        alias="formatId",
        description='Format id from /api/resolve, e.g. "video:1080", "video:best", "audio:best-audio"',
    )
    start: Optional[float] = Field(
        default=None, ge=0, description="Trim start in seconds"
    )
    end: Optional[float] = Field(
        default=None, gt=0, description="Trim end in seconds"
    )


class ResolvedFormat(BaseModel):
    id: str
    kind: Literal["video", "audio"]
    label: str
    container: str
    height: Optional[int] = None
    codec: Optional[str] = None
    note: Optional[str] = None


class ResolveResponse(BaseModel):
    videoId: str
    title: str
    duration: float
    formats: list[ResolvedFormat]
    error: Optional[str] = None


class JobResponse(BaseModel):
    jobId: str
    status: str
    progress: float
    message: Optional[str] = None
    filename: Optional[str] = None
    error: Optional[str] = None


class DownloadCreated(BaseModel):
    jobId: str