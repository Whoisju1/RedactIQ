import pytest
from engines.analyzer import AnalyzerEngineWrapper
from engines.ocr import OCREngineWrapper

def test_presidio_identifies_ssn():
    """
    Verify Presidio identifies an SSN in a sample string.
    """
    analyzer = AnalyzerEngineWrapper()
    text = "The user's social security number is 123-45-6789."
    results = analyzer.analyze_text(text=text, entities=["SSN"])
    
    # Check if SSN was found
    ssn_found = any(result.entity_type == "SSN" for result in results)
    assert ssn_found, "Presidio failed to identify SSN in text"

def test_tesseract_import():
    """
    Verify Tesseract wrapper can be instantiated (imports work).
    """
    try:
        ocr = OCREngineWrapper()
        assert ocr is not None
    except Exception as e:
        pytest.fail(f"OCREngineWrapper failed to initialize: {e}")
