# 001 - Local-First Architecture

## Status
Accepted

## Context
RedactIQ handles highly sensitive documents containing Personally Identifiable Information (PII). Users require an absolute guarantee that their documents will not be intercepted, logged, or retained by third-party cloud providers or API services during the redaction process.

## Decision
We will enforce a strict "Local-First" architectural constraint. The entire application (Frontend, API, NLP inference, OCR, and Document Processing) will run locally on the user's hardware via Docker containers. Absolutely no external API calls (e.g., OpenAI, Google Cloud Vision, AWS Comprehend) will be permitted for core document processing. 

## Consequences

**Positive:**
*   Absolute data privacy and zero data leakage.
*   Application works completely offline.
*   No recurring API costs for document processing.

**Negative:**
*   Processing speed is bound by the user's local hardware constraints.
*   Docker image size is significantly larger because ML models (spaCy) and binaries (Tesseract) must be packaged into the container.
*   NLP accuracy (via local Presidio/spaCy) may be slightly lower than state-of-the-art LLMs, requiring more manual review from the user.