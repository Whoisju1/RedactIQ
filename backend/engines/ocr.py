import pytesseract
from PIL import Image

class OCREngineWrapper:
    def __init__(self, tesseract_cmd: str = None):
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    def extract_text(self, image_path: str) -> str:
        """
        Extract text from an image using Tesseract.
        """
        try:
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            # For this MVP, we'll re-raise or log the error
            raise RuntimeError(f"Failed to extract text from image: {e}")
