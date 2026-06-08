#!/usr/bin/env python3
"""Local embedding server using clip-ViT-L-14 on Mac GPU (Metal)"""

import os
import sys
from typing import List, Union

from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

# Optional local venv override for machines that keep sentence-transformers elsewhere.
site_packages = os.environ.get("KNOWLEDGE_VENV_SITE_PACKAGES")
if site_packages:
    sys.path.insert(0, site_packages)

from sentence_transformers import SentenceTransformer  # noqa: E402

app = FastAPI()
print("Loading clip-ViT-L-14 model on Mac GPU...")
model = SentenceTransformer("clip-ViT-L-14")
print("Model loaded successfully!")

class EmbeddingRequest(BaseModel):
    input: Union[str, List[str], List[dict]]
    model: str = "clip-ViT-L-14"

@app.post("/v1/embeddings")
async def create_embeddings(request: EmbeddingRequest):
    texts = []
    if isinstance(request.input, str):
        texts = [request.input]
    elif isinstance(request.input, list):
        if len(request.input) > 0 and isinstance(request.input[0], dict):
            texts = [item.get("text", "") for item in request.input if item.get("type") == "text"]
        else:
            texts = request.input
    
    embeddings = model.encode(texts)
    
    return {
        "data": [
            {
                "embedding": emb.tolist(),
                "index": i,
                "object": "embedding"
            }
            for i, emb in enumerate(embeddings)
        ],
        "model": request.model,
        "object": "list",
        "usage": {
            "prompt_tokens": sum(len(t.split()) for t in texts),
            "total_tokens": sum(len(t.split()) for t in texts)
        }
    }

@app.get("/v1/models")
async def list_models():
    return {
        "data": [
            {
                "id": "clip-ViT-L-14",
                "object": "model",
                "owned_by": "sentence-transformers"
            }
        ],
        "object": "list"
    }

@app.get("/health")
async def health():
    return {"status": "ok", "model": "clip-ViT-L-14"}

if __name__ == "__main__":
    port = int(os.environ.get("EMBEDDING_PORT", 8002))
    print(f"Starting local embedding server on port {port}...")
    uvicorn.run(app, host=os.environ.get("MEMROOS_BIND_HOST", "127.0.0.1"), port=port)
