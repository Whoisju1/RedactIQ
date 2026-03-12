# SYSTEM INITIALIZATION: REDACTIQ MASTER PROJECT CONTEXT

## PROJECT OVERVIEW
[cite_start]RedactIQ is a self-hosted, intelligent document redaction platform that automatically detects and highlights personally identifiable information (PII) across PDFs, Word documents, and images[cite: 29]. [cite_start]It provides an intuitive review-and-redact workflow for individuals handling sensitive documents[cite: 18]. [cite_start]The application ensures zero data leakage by processing everything locally and structurally removing redacted content from the exported output files[cite: 30, 35].

## TECH STACK
* [cite_start]**Frontend:** Next.js 14 (App Router) [cite: 45]
* [cite_start]**Backend:** Python 3.11 with FastAPI [cite: 45]
* **Package Management:** uv (for Python dependency management and resolving `pyproject.toml`)
* [cite_start]**Database:** SQLite (with SQLAlchemy ORM and Alembic for migrations) [cite: 52]
* [cite_start]**Auth:** None (Strictly local, single-user deployment) [cite: 52, 62]
* [cite_start]**Infrastructure:** Docker & Docker Compose [cite: 20]
* **Core Engines:**
  * [cite_start]NLP Engine: Microsoft Presidio [cite: 46]
  * [cite_start]OCR Engine: Tesseract OCR [cite: 47]
  * [cite_start]PDF Processing & Redaction: PyMuPDF (fitz) [cite: 72]

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
* [cite_start]**Key Architectural Constraints:** Absolutely NO external network calls or cloud APIs are permitted[cite: 43]. [cite_start]All document processing, OCR, and NLP must happen entirely within the local Docker containers[cite: 325, 326]. 

## DATA MODEL REFERENCE
* **Document:** `id` (UUID, PK), `filename` (String), `file_path` (String), `status` (Enum: QUEUED, PROCESSING, READY_FOR_REVIEW, REDACTING, COMPLETED, ERROR), `page_count` (Integer), `created_at` (Timestamp).
* **DetectedEntity:** `id` (UUID, PK), `document_id` (FK to Document), `entity_type` (String, e.g., 'SSN'), `text_value` (String), `page_number` (Integer), `bounding_box` (JSON), `confidence` (Float), `is_dismissed` (Boolean, default False).
* **ManualRedaction:** `id` (UUID, PK), `document_id` (FK to Document), `type` (Enum: TEXT, RECTANGLE), `page_number` (Integer), `bounding_box` (JSON), `created_at` (Timestamp).

## VERIFICATION COMMANDS
Whenever you create or modify code, use these exact commands to test your work:
* **Run Local Environment:** `docker-compose up --build`
* **Run Backend Tests:** `docker-compose exec backend uv run pytest`
* **Run Frontend Linting:** `docker-compose exec frontend npm run lint`

## GIT WORKFLOW
1. **Never commit without confirmation:** After completing a coding task, provide the verification commands and STOP. Ask the user, "Did the tests pass, and are you ready for me to commit these changes?"
2. **Conventional Commits:** Once the user confirms, execute `git add .` followed by `git commit -m "<type>(<scope>): <subject>"`. Use standard types like `feat`, `fix`, `chore`, `refactor`, or `test`.
3. Ensure commit messages are professional, concise, and accurately reflect the work completed.