import asyncio
from collections import deque


class GenerationQueue:
    def __init__(self):
        self._condition = asyncio.Condition()
        self._waiting = deque()
        self._active_request_id: str | None = None

    async def acquire(self, request_id: str) -> dict:
        async with self._condition:
            position = len(self._waiting) + (1 if self._active_request_id else 0) + 1
            self._waiting.append(request_id)

            while self._waiting[0] != request_id or self._active_request_id is not None:
                await self._condition.wait()

            self._waiting.popleft()
            self._active_request_id = request_id
            self._condition.notify_all()
            return {
                "queued_ahead": max(0, position - 1),
                "active_request_id": request_id,
            }

    async def release(self, request_id: str):
        async with self._condition:
            if self._active_request_id == request_id:
                self._active_request_id = None
            else:
                try:
                    self._waiting.remove(request_id)
                except ValueError:
                    pass
            self._condition.notify_all()

    async def snapshot(self) -> dict:
        async with self._condition:
            return {
                "active_request_id": self._active_request_id,
                "waiting_count": len(self._waiting),
                "queue": list(self._waiting),
            }


generation_queue = GenerationQueue()
