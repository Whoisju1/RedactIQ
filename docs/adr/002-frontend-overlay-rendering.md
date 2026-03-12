# 002 - Absolute Frontend Overlay Rendering vs Baked Image Rendering

## Status
Accepted

## Context
When a user reviews a document in the Redaction Workspace, they need to see the original document with colored boxes highlighting detected PII. 

We considered two approaches:
1.  **Baked Image Rendering**: The backend uses PyMuPDF to draw colored rectangles onto the PDF and sends a static PNG of the *already highlighted* page to the frontend.
2.  **Absolute Frontend Overlay**: The backend sends a clean PNG of the document page, and separately sends JSON coordinates of the PII. The frontend renders the clean image and draws HTML `div` elements on top of it using absolute positioning.

## Decision
We chose **Approach 2: Absolute Frontend Overlay**. 

## Consequences

**Positive:**
*   **Interactivity**: Because the highlights are HTML elements, we can easily attach event listeners (like hover states, tooltips showing confidence scores, and click-to-dismiss buttons). 
*   **Performance**: The backend doesn't need to re-render the PNG every time the user dismisses an entity or draws a new box.
*   **Flexibility**: The user can toggle visibility of specific PII types (e.g., hide all "PERSON" highlights) instantly via frontend state without making a backend request.

**Negative:**
*   Requires precise coordinate mapping between PyMuPDF's internal coordinate system and the browser's DOM pixel grid.