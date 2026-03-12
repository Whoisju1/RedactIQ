# SYSTEM INITIALIZATION: REDACTIQ MASTER PROJECT CONTEXT

## PROJECT OVERVIEW
RedactIQ is a self-hosted, intelligent document redaction platform that automatically detects and highlights personally identifiable information (PII) across PDFs, Word documents, and images. It provides an intuitive review-and-redact workflow for individuals handling sensitive documents. The application ensures zero data leakage by processing everything locally and structurally removing redacted content from the exported output files.

## TECH STACK
* **Frontend:** Next.js 14 (App Router)
* **Backend:** Python 3.11 with FastAPI
* **Database:** SQLite (with SQLAlchemy ORM and Alembic for migrations)
* **Auth:** None (Strictly local, single-user deployment)
* **Infrastructure:** Docker & Docker Compose
* **Core Engines:**
  * NLP Engine: Microsoft Presidio
  * OCR Engine: Tesseract OCR
  * PDF Processing & Redaction: PyMuPDF (fitz)

## ARCHITECTURE SUMMARY
* **Architectural Pattern:** Modular Monolith (Local-First).
* **Component Inventory:**
  * Next.js Frontend UI (Browser interface, document uploads, Redaction Workspace)
  * FastAPI Backend (Coordinates logic, exposes REST endpoints)
  * Ingestion Worker (Validates files, runs Tesseract OCR)
  * Analyzer Engine (Presidio NLP entity recognition)
  * Redaction Engine (PyMuPDF deep text removal and visual overlay)
  * Local State DB (SQLite tracking batch states)
* **Communication Patterns:** The Next.js frontend makes asynchronous REST API calls to the FastAPI backend strictly over `localhost`.
* **Key Architectural Constraints:** Absolutely NO external network calls or cloud APIs are permitted. All document processing, OCR, and NLP must happen entirely within the local Docker containers. 

## DATA MODEL REFERENCE
* **Document:** `id` (UUID, PK), `filename` (String), `file_path` (String), `status` (Enum: QUEUED, PROCESSING, READY_FOR_REVIEW, REDACTING, COMPLETED, ERROR), `page_count` (Integer), `created_at` (Timestamp).
* **DetectedEntity:** `id` (UUID, PK), `document_id` (FK to Document), `entity_type` (String, e.g., 'SSN'), `text_value` (String), `page_number` (Integer), `bounding_box` (JSON), `confidence` (Float), `is_dismissed` (Boolean, default False).
* **ManualRedaction:** `id` (UUID, PK), `document_id` (FK to Document), `type` (Enum: TEXT, RECTANGLE), `page_number` (Integer), `bounding_box` (JSON), `created_at` (Timestamp).

## VERIFICATION COMMANDS
Whenever you create or modify code, use these exact commands to test your work:
* **Run Local Environment:** `docker-compose up --build`
* **Run Backend Tests:** `docker-compose exec backend pytest`
* **Run Frontend Linting:** `docker-compose exec frontend npm run lint`