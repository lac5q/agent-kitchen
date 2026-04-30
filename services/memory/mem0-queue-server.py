"""
Mem0 Queue Server - FastAPI wrapper with request queuing.
Sits in front of mem0-server and buffers requests when it's down.
Run with: uvicorn mem0-queue-server:app --host 0.0.0.0 --port 3201
"""

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
import httpx

# Import queue logic
from mem0_queue import Mem0Queue  # Note: file is mem0-queue.py, module is mem0_queue

app = FastAPI(title="Mem0 Queue Server", version="1.0.0")

# Initialize queue
queue = Mem0Queue(db_path="logs/queue.db")

MEM0_URL = "http://localhost:3202"  # Backend mem0 server runs on 3202


class MemorySaveRequest(BaseModel):
    text: str
    agent_id: str = "shared"


class MemorySearchRequest(BaseModel):
    query: str
    agent_id: Optional[str] = ""
    limit: Optional[int] = 5


class QueueStatus(BaseModel):
    queued: int
    oldest: Optional[str]
    recent_replays: dict


# ---------------------------------------------------------------------------
# Memory Endpoints (with queuing)
# ---------------------------------------------------------------------------

@app.post("/memory/add")
async def memory_add(req: MemorySaveRequest):
    """Save memory (queued if backend is down)."""
    try:
        # Try direct call first
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{MEM0_URL}/memory/add",
                json={"text": req.text, "agent_id": req.agent_id},
                timeout=30
            )
            if response.status_code == 200:
                return response.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        # Queue the request
        queue.queue_request("/memory/add", "POST", {"text": req.text, "agent_id": req.agent_id})
        return {"status": "queued", "message": "Server down, will retry later"}

    raise HTTPException(status_code=503, detail="Backend unavailable")


@app.get("/memory/search")
async def memory_search(q: str, agent_id: Optional[str] = "", limit: Optional[int] = 5):
    """Search memories (fails gracefully if backend down)."""
    try:
        params = {"q": q, "limit": limit}
        if agent_id:
            params["agent_id"] = agent_id

        async with httpx.AsyncClient() as client:
            response = await client.get(f"{MEM0_URL}/memory/search", params=params, timeout=30)
            if response.status_code == 200:
                return response.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        return {"error": "Server unavailable", "results": [], "queued": False}

    raise HTTPException(status_code=503, detail="Backend unavailable")


@app.get("/memory/all")
async def memory_all(agent_id: Optional[str] = "shared"):
    """Get all memories for agent."""
    try:
        params = {"agent_id": agent_id} if agent_id else {}
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{MEM0_URL}/memory/all", params=params, timeout=30)
            if response.status_code == 200:
                return response.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        return {"error": "Server unavailable", "memories": []}

    raise HTTPException(status_code=503, detail="Backend unavailable")


# ---------------------------------------------------------------------------
# Queue Management Endpoints
# ---------------------------------------------------------------------------

@app.get("/queue/status")
async def get_queue_status() -> QueueStatus:
    """Get queue status."""
    status = queue.get_queue_status()
    return QueueStatus(**status)


@app.post("/queue/clear")
async def clear_queue():
    """Clear all queued requests."""
    return queue.clear_queue()


@app.get("/queue/replay")
async def trigger_replay():
    """Trigger immediate replay of queued requests."""
    queue._replay_queued()
    return {"status": "replay_triggered"}


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check with queue status."""
    backend_healthy = False
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{MEM0_URL}/health", timeout=5)
            backend_healthy = response.status_code == 200
    except:
        pass

    queue_status = queue.get_queue_status()

    return {
        "status": "ok" if backend_healthy else "degraded",
        "backend": "connected" if backend_healthy else "disconnected",
        "queue": queue_status
    }


# ---------------------------------------------------------------------------
# Cleanup on shutdown
# ---------------------------------------------------------------------------

@app.on_event("shutdown")
async def shutdown_event():
    queue.stop()
