# RedactIQ

RedactIQ is a self-hosted, intelligent document redaction platform designed for maximum privacy. It automatically detects and highlights personally identifiable information (PII) across documents, providing an intuitive review-and-redact workflow. The application ensures zero data leakage by processing everything locally.

## Features

*   **Local-First Architecture**: All processing happens entirely within local Docker containers. No external network calls or cloud APIs are used, ensuring absolute data privacy.
*   **Automatic PII Detection**: Integrates Microsoft Presidio NLP to identify entities like Social Security Numbers, phone numbers, and emails.
*   **OCR Integration**: Uses Tesseract OCR to process scanned PDFs and images.
*   **Interactive Workspace**: Review detected PII, draw manual redactions, and dismiss false positives with an intuitive interface.
*   **Batch Processing Mode**: Upload and process multiple files sequentially, with a one-click option to download a consolidated ZIP of redacted PDFs.
*   **Secure Export**: Final outputs have the text permanently removed and covered with solid black boxes using PyMuPDF.

## Tech Stack

*   **Frontend**: Next.js 14 (App Router), Tailwind CSS
*   **Backend**: Python 3.11, FastAPI
*   **Package Management**: `uv` (Backend), `npm` (Frontend)
*   **Database**: SQLite (SQLAlchemy ORM)
*   **Core Engines**: PyMuPDF (`fitz`), Microsoft Presidio, spaCy, Tesseract OCR
*   **Infrastructure**: Docker, Docker Compose

## Prerequisites

*   Docker
*   Docker Compose (v2)

## Getting Started

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd redactiq
    ```

2.  **Build and start the application**:
    ```bash
    docker compose up --build
    ```

3.  **Access the Application**:
    *   Frontend UI: [http://localhost:3000](http://localhost:3000)
    *   Backend API Docs (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)

## Project Structure

*   `/frontend`: Next.js 14 application.
*   `/backend`: FastAPI application and data processing logic.
*   `/docs`: Architecture Decision Records (ADRs) and additional documentation.
*   `docker-compose.yml`: Local deployment configuration.

## Development

### Backend Management with `uv`
The backend uses `uv` for lightning-fast dependency management.
To add a new dependency:
```bash
docker compose exec backend uv add <package-name>
```

### Database Management
To clear the database and start fresh (useful during development):
```bash
docker compose exec backend uv run python clear_db.py
```

## Documentation

For technical decisions and architectural context, please refer to the `docs/adr` directory.