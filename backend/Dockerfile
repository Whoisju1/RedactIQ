FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Copy dependency files
COPY pyproject.toml .
# In a real environment with uv.lock, we'd copy that too
# COPY uv.lock .

# Install dependencies using uv
RUN uv sync --no-cache

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Start FastAPI using uv
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
