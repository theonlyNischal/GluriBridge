"""
Tavily API client. Field names verified directly against Tavily's current
OpenAPI spec (docs.tavily.com/documentation/api-reference/endpoint/search),
not guessed. NOT tested against a live call — this sandbox has no network
access to api.tavily.com. Smoke-test this yourself with a real key before
trusting it in the pipeline.
"""
import requests

TAVILY_SEARCH_URL = "https://api.tavily.com/search"


class TavilyClient:
    def __init__(self, api_key: str, timeout: int = 20):
        self.api_key = api_key
        self.timeout = timeout

    def search(self, query: str, max_results: int = 5, search_depth: str = "basic",
               topic: str = "general", country: str = "indonesia",
               include_raw_content: bool = True) -> dict:
        """
        Calls Tavily's real /search endpoint. Returns the raw response dict
        (query, answer, results[], response_time, ...). Raises requests
        exceptions on network/HTTP failure — caller decides whether to retry.

        include_raw_content=True by default because org-name extraction
        (see news_matching.py) needs more than the short `content` snippet
        to work reliably — this costs more on Tavily's side, tune down if
        budget is a concern.
        """
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {
            "query": query,
            "max_results": max_results,
            "search_depth": search_depth,
            "topic": topic,
            "country": country,
            "include_raw_content": include_raw_content,
        }
        resp = requests.post(TAVILY_SEARCH_URL, json=payload, headers=headers, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()
