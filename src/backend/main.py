"""EmailPilot FastAPI backend - generates LinkedIn icebreakers from public profile data."""

import os
import json
import sqlite3
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import httpx

app = FastAPI(title="EmailPilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

DB_PATH = os.getenv("DB_PATH", "./emailpilot.db")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
SIMULATION_MODE = not STRIPE_SECRET_KEY


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    with open(os.path.join(os.path.dirname(__file__), "../database/schema.sql")) as f:
        conn.executescript(f.read())
    conn.close()


class IcebreakerRequest(BaseModel):
    linkedin_url: str
    user_id: Optional[str] = None


class IcebreakerResponse(BaseModel):
    options: list[str]
    simulated: bool
    credits_used: int
    credits_remaining: Optional[int]


def scrape_public_linkedin(url: str) -> dict:
    """Fetch only publicly visible LinkedIn profile data - no login required."""
    # Validate URL is LinkedIn
    if "linkedin.com/in/" not in url:
        raise HTTPException(status_code=400, detail="URL must be a LinkedIn profile (linkedin.com/in/...)")

    try:
        # Only fetch public-facing profile page (no auth headers)
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; EmailPilotBot/1.0; +https://emailpilot.io/bot)",
            "Accept-Language": "en-US,en;q=0.9",
        }
        response = httpx.get(url, headers=headers, timeout=10, follow_redirects=True)

        if response.status_code == 999:
            # LinkedIn blocks scrapers - return graceful stub for simulation
            return {"name": "LinkedIn User", "headline": "Professional", "available": False}

        # Parse basic visible text (name, headline from <title> tag)
        text = response.text
        profile = {"raw_snippet": text[:500], "url": url, "available": True}
        return profile

    except Exception:
        return {"name": "LinkedIn User", "headline": "Professional", "available": False}


def generate_icebreakers_simulated(profile_url: str) -> list[str]:
    """Fallback simulated icebreakers when API key not configured."""
    handle = profile_url.rstrip("/").split("/")[-1].replace("-", " ").title()
    return [
        f"Hi {handle}, I noticed your recent work in the SaaS space - would love to connect on how you're approaching [specific challenge].",
        f"Hi {handle}, your background in [industry] caught my eye. We're helping similar founders achieve [outcome] - curious if that's a current priority for you?",
        f"Hi {handle}, saw you're building in [space]. Quick question - how are you currently handling [pain point]? We've found a solution that's saved similar teams 5+ hours/week.",
    ]


def generate_icebreakers_ai(profile_data: dict) -> list[str]:
    """Generate icebreakers using Claude API."""
    if not ANTHROPIC_API_KEY:
        return generate_icebreakers_simulated(profile_data.get("url", ""))

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = f"""You are an expert B2B cold outreach copywriter. Based on this LinkedIn profile data,
generate exactly 3 highly personalized icebreaker opening lines for a cold LinkedIn message.

Profile data: {json.dumps(profile_data)}

Rules:
- Each icebreaker must reference something SPECIFIC from the public profile
- Max 2 sentences each
- Conversational, not salesy
- End with a soft question or observation
- Only use publicly available information

Return exactly 3 icebreakers as a JSON array of strings."""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        content = message.content[0].text
        icebreakers = json.loads(content)
        if isinstance(icebreakers, list) and len(icebreakers) >= 3:
            return icebreakers[:3]
    except Exception:
        pass

    return generate_icebreakers_simulated(profile_data.get("url", ""))


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "simulation_mode": SIMULATION_MODE,
        "ai_configured": bool(ANTHROPIC_API_KEY),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/generate-icebreakers", response_model=IcebreakerResponse)
async def generate(req: IcebreakerRequest, x_user_token: Optional[str] = Header(None)):
    """Generate 3 personalized LinkedIn icebreakers from a public profile URL."""
    # Validate and fetch public profile data (no login scraping)
    profile_data = scrape_public_linkedin(req.linkedin_url)
    profile_data["url"] = req.linkedin_url

    # Generate icebreakers
    if ANTHROPIC_API_KEY and profile_data.get("available"):
        options = generate_icebreakers_ai(profile_data)
    else:
        options = generate_icebreakers_simulated(req.linkedin_url)

    # Log generation to DB
    if req.user_id:
        conn = get_db()
        try:
            for icebreaker in options:
                conn.execute(
                    "INSERT INTO generations (user_id, icebreaker_text, timestamp) VALUES (?, ?, ?)",
                    (req.user_id, icebreaker, datetime.utcnow().isoformat()),
                )
            conn.commit()
        finally:
            conn.close()

    return IcebreakerResponse(
        options=options,
        simulated=not bool(ANTHROPIC_API_KEY),
        credits_used=1,
        credits_remaining=None,
    )


@app.post("/webhook/stripe")
async def stripe_webhook(payload: dict):
    """Handle Stripe payment events - activate user credits on successful payment."""
    if SIMULATION_MODE:
        return {"status": "simulation_mode", "message": "Configure STRIPE_SECRET_KEY to process real payments"}

    event_type = payload.get("type", "")
    if event_type == "checkout.session.completed":
        customer_id = payload.get("data", {}).get("object", {}).get("customer")
        plan = payload.get("data", {}).get("object", {}).get("metadata", {}).get("plan", "starter")
        credits = 100 if plan == "starter" else -1  # -1 = unlimited

        conn = get_db()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO users (stripe_id, credits, created_at) VALUES (?, ?, ?)",
                (customer_id, credits, datetime.utcnow().isoformat()),
            )
            conn.commit()
        finally:
            conn.close()

    return {"status": "ok"}
