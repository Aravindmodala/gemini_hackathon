"""
Google Cloud authentication utilities.

The GenAI SDK handles Gemini API auth automatically via ADC.
This module is retained for any tools that need direct Vertex AI
access (e.g. LyriaTool uses google.auth for the predict endpoint).
"""
