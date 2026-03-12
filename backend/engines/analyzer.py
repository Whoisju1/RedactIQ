from presidio_analyzer import AnalyzerEngine

class AnalyzerEngineWrapper:
    def __init__(self, default_score_threshold=0.4):
        self.engine = AnalyzerEngine(default_score_threshold=default_score_threshold)

    def analyze_text(self, text: str, entities=None, language="en"):
        """
        Analyze text to find PII entities.
        """
        results = self.engine.analyze(text=text, entities=entities, language=language)
        return results
