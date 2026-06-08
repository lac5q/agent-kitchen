#!/usr/bin/env python3
"""
Vast.ai Serverless Embedding Runner
Spins up serverless endpoint, runs embeddings, tears down
Usage: python3 vast-serverless-embed.py [options]
"""

import os
import sys
import logging
from typing import List

# Optional local venv override for machines that keep the Vast SDK elsewhere.
site_packages = os.environ.get("KNOWLEDGE_VENV_SITE_PACKAGES")
if site_packages:
    sys.path.insert(0, site_packages)

try:
    from vastai import Serverless
except ImportError:
    print("Installing vastai SDK...")
    os.system("pip3 install vastai")
    from vastai import Serverless

import asyncio  # noqa: E402
import httpx  # noqa: E402

log_dir = os.environ.get("SERVERLESS_EMBED_LOG_DIR", os.path.join(os.path.dirname(__file__), "logs"))
os.makedirs(log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(log_dir, "serverless-embed.log")),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

class VastServerlessEmbedder:
    def __init__(self):
        self.client = None
        self.endpoint = None
        self.api_key = os.environ.get('VAST_API_KEY') or os.path.expanduser('~/.config/vastai/vast_api_key')
        
    async def __aenter__(self):
        await self.initialize()
        return self
        
    async def __aexit__(self, _exc_type, _exc_val, _exc_tb):
        await self.cleanup()
        
    async def initialize(self):
        """Initialize Vast.ai Serverless client"""
        log.info("Initializing Vast.ai Serverless...")
        
        if not self.api_key:
            raise ValueError("VAST_API_KEY not found")
            
        self.client = Serverless(self.api_key)
        
        # Create or get endpoint
        log.info("Creating serverless endpoint...")
        self.endpoint = await self.client.get_endpoint("clip-vit-l-14-embeddings")
        
        if not self.endpoint:
            # Create new endpoint
            log.info("Creating new endpoint...")
            self.endpoint = await self.client.create_endpoint(
                name="clip-vit-l-14-embeddings",
                model="clip-ViT-L-14",
                gpu_class="RTX_4090",
                min_replicas=0,  # Scale to zero when idle
                max_replicas=1,
                warmup_timeout=300,  # 5 min warmup
                idle_timeout=300,    # Scale down after 5 min idle
            )
            
        log.info("Endpoint ready")
        
    async def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for list of texts"""
        if not self.endpoint:
            raise RuntimeError("Not initialized")
            
        log.info(f"Generating embeddings for {len(texts)} texts...")
        
        # Send to serverless endpoint
        response = await self.endpoint.request(
            "/v1/embeddings",
            {
                "input": texts,
                "model": "clip-ViT-L-14"
            }
        )
        
        # Parse response
        embeddings = []
        for item in response.get("data", []):
            embeddings.append(item["embedding"])
            
        log.info(f"Generated {len(embeddings)} embeddings")
        return embeddings
        
    async def cleanup(self):
        """Clean up resources"""
        if self.client:
            try:
                await self.client.close()
                log.info("Client closed")
            except Exception:
                pass

async def run_batch_embedding():
    """Run batch embedding job"""
    log.info("=== Vast.ai Serverless Batch Embedding ===")
    
    async with VastServerlessEmbedder() as embedder:
        # Test embedding
        test_texts = ["Test embedding for Vast.ai Serverless"]
        embeddings = await embedder.embed(test_texts)
        log.info(f"Test embedding dimensions: {len(embeddings[0])}")
        
        # Run QMD embed
        log.info("Running QMD embeddings...")
        os.system("qmd embed -f")
        
        # Test mem0
        log.info("Testing mem0...")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:3201/v1/memories",
                json={
                    "messages": [{"role": "user", "content": "Serverless embedding test"}],
                    "user_id": "serverless-test"
                }
            )
            if response.status_code == 200:
                log.info("✓ mem0 test passed")
            else:
                log.warning("✗ mem0 test failed")
                
    log.info("=== Batch Complete ===")

if __name__ == "__main__":
    asyncio.run(run_batch_embedding())
