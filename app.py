from flask import Flask, render_template, request, jsonify, send_file
from pymongo import MongoClient, DESCENDING
from datetime import datetime, timedelta, timezone
from gtts import gTTS
import io, os

app = Flask(__name__)

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(MONGO_URI)
db = client["BuilderType"]
scores    = db["scores"]
snapshots = db["winner_snapshots"]
lb_meta   = db["lb_meta"]

# Indexes
scores.create_index([("wpm", DESCENDING)])
scores.create_index([("timestamp", DESCENDING)])
scores.create_index([("round_start", DESCENDING), ("wpm", DESCENDING)])
scores.create_index([("round_start", DESCENDING), ("timestamp", DESCENDING)])

scores.create_index(
    [("session_id", 1), ("name", 1)],
    unique=True,
    partialFilterExpression={"session_id": {"$exists": True}, "name": {"$exists": True}}
)
snapshots.create_index([("saved_at", DESCENDING)])

LB_INTERVAL = timedelta(minutes=1)
ROUND_MINUTES = 15
ROUND_INTERVAL = timedelta(minutes=ROUND_MINUTES)


def _iso_utc(dt):
    """Serialize UTC datetime consistently for client parsing."""
    return dt.replace(microsecond=0).isoformat() + "Z"


def _slot_bounds(dt):
    slot_minute = (dt.minute // ROUND_MINUTES) * ROUND_MINUTES
    start = dt.replace(minute=slot_minute, second=0, microsecond=0)
    return start, start + ROUND_INTERVAL


def _parse_round_start(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed.replace(second=0, microsecond=0)
    except ValueError:
        return None


def _round_query(round_start):
    round_end = round_start + ROUND_INTERVAL
    return {
        "$or": [
            {"round_start": round_start},
            {
                "$and": [
                    {"round_start": {"$exists": False}},
                    {"timestamp": {"$gte": round_start, "$lt": round_end}}
                ]
            }
        ]
    }


def _round_summary(round_start):
    q = _round_query(round_start)
    attempts = scores.count_documents(q)
    winner = scores.find_one(
        q,
        {"_id": 0, "name": 1, "wpm": 1, "accuracy": 1, "timestamp": 1},
        sort=[("wpm", DESCENDING), ("timestamp", 1)]
    )
    if winner and "timestamp" in winner:
        winner["timestamp"] = _iso_utc(winner["timestamp"])

    round_end = round_start + ROUND_INTERVAL
    return {
        "round_start": _iso_utc(round_start),
        "round_end": _iso_utc(round_end),
        "attempts": attempts,
        "winner": winner,
    }

def _get_lb_meta():
    doc = lb_meta.find_one({"_id": "global"})
    if not doc:
        now = datetime.utcnow()
        doc = {"_id": "global", "last_refresh": now, "next_refresh": now + LB_INTERVAL}
        lb_meta.insert_one(doc)
    return doc

def _bump_lb_meta():
    now = datetime.utcnow()
    lb_meta.update_one(
        {"_id": "global"},
        {"$set": {"last_refresh": now, "next_refresh": now + LB_INTERVAL}},
        upsert=True
    )
    return now


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/leaderboard")
def leaderboard_display():
    return render_template("leaderboard.html")


@app.route("/api/submit", methods=["POST"])
def submit_score():
    data = request.get_json()
    name      = data.get("name", "").strip()
    session_id = str(data.get("session_id", "")).strip()
    wpm       = data.get("wpm", 0)
    accuracy  = data.get("accuracy", 0)
    errors    = data.get("errors", 0)
    correct   = data.get("correct", 0)
    paragraph = data.get("paragraph", 0)

    if not name or not (1 <= len(name) <= 30):
        return jsonify({"error": "Invalid name"}), 400
    if not session_id or len(session_id) > 80:
        return jsonify({"error": "Invalid session_id"}), 400
    if not isinstance(wpm, (int, float)) or wpm < 0:
        return jsonify({"error": "Invalid WPM"}), 400

    now = datetime.utcnow()
    round_start, round_end = _slot_bounds(now)

    doc = {
        "session_id": session_id,
        "name":      name,
        "wpm":       int(wpm),
        "accuracy":  int(accuracy),
        "errors":    int(errors),
        "correct":   int(correct),
        "paragraph": int(paragraph),
        "timestamp": now,
        "round_start": round_start,
        "round_end": round_end,
    }
    result = scores.update_one(
        {"session_id": session_id, "name": name},
        {
            "$set": doc,
            "$setOnInsert": {"created_at": now}
        },
        upsert=True,
    )

    rank = scores.count_documents({"wpm": {"$gt": int(wpm)}}) + 1
    status = 201 if result.upserted_id else 200
    return jsonify({"rank": rank, "updated": not bool(result.upserted_id)}), status


@app.route("/api/leaderboard/status", methods=["GET"])
def leaderboard_status():
    """Tells clients how many seconds until the next global refresh."""
    meta = _get_lb_meta()
    now  = datetime.utcnow()
    secs_until = max(0, int((meta["next_refresh"] - now).total_seconds()))
    due = secs_until == 0

    last_refresh = meta["last_refresh"]

    # If it's due, bump timer globally and expose the new refresh point.
    if due:
        last_refresh = _bump_lb_meta()
        secs_until = int(LB_INTERVAL.total_seconds())

    return jsonify({
        "due":          due,
        "secs_until":   secs_until,
        "last_refresh": _iso_utc(last_refresh)
    })


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    sort_by = request.args.get("sort", "top")
    round_start = _parse_round_start(request.args.get("round_start"))

    q = {}
    if request.args.get("round_start"):
        if not round_start:
            return jsonify({"error": "Invalid round_start"}), 400
        q = _round_query(round_start)

    if sort_by == "recent":
        top = list(
            scores.find(q, {"_id": 0, "name": 1, "wpm": 1, "accuracy": 1, "timestamp": 1})
                  .sort("timestamp", DESCENDING)
        )
    else:
        top = list(
            scores.find(q, {"_id": 0, "name": 1, "wpm": 1, "accuracy": 1, "timestamp": 1})
                  .sort("wpm", DESCENDING)
        )
    for entry in top:
        entry["timestamp"] = _iso_utc(entry["timestamp"])
    return jsonify(top)


@app.route("/api/rounds", methods=["GET"])
def round_slots():
    now = datetime.utcnow()
    current_start, _ = _slot_bounds(now)

    try:
        limit = int(request.args.get("limit", 24))
    except (TypeError, ValueError):
        limit = 24
    limit = max(1, min(limit, 96))

    starts = scores.distinct("round_start")
    starts = [s for s in starts if isinstance(s, datetime)]
    starts.sort(reverse=True)

    rounds = [_round_summary(s) for s in starts[:limit]]

    current_exists = any(r["round_start"] == _iso_utc(current_start) for r in rounds)
    if not current_exists:
        rounds.insert(0, _round_summary(current_start))
        rounds = rounds[:limit]

    return jsonify({
        "round_minutes": ROUND_MINUTES,
        "current_round_start": _iso_utc(current_start),
        "rounds": rounds,
    })


@app.route("/api/reset", methods=["POST"])
def reset_leaderboard():
    """Wipe all scores and snapshots, reset the global timer."""
    scores.delete_many({})
    snapshots.delete_many({})
    _bump_lb_meta()
    return jsonify({"reset": True}), 200


@app.route("/api/winners/snapshot", methods=["POST"])
def save_winner_snapshot():
    now = datetime.utcnow()
    latest = snapshots.find_one({}, {"_id": 0, "winners": 1, "saved_at": 1}, sort=[("saved_at", DESCENDING)])
    if latest and (now - latest["saved_at"]).total_seconds() < 15:
        latest["saved_at"] = _iso_utc(latest["saved_at"])
        return jsonify({"saved": False, **latest}), 200

    top3 = list(
        scores.find({}, {"_id": 0, "name": 1, "wpm": 1, "accuracy": 1})
              .sort("wpm", DESCENDING)
              .limit(3)
    )
    if not top3:
        return jsonify({"saved": False}), 200
    saved_at = now
    doc = {"winners": top3, "saved_at": saved_at}
    snapshots.insert_one(doc)
    return jsonify({"saved": True, "winners": top3, "saved_at": _iso_utc(saved_at)}), 201


@app.route("/api/winners/latest", methods=["GET"])
def latest_winners():
    snap = snapshots.find_one({}, {"_id": 0}, sort=[("saved_at", DESCENDING)])
    if not snap:
        top3 = list(
            scores.find({}, {"_id": 0, "name": 1, "wpm": 1, "accuracy": 1})
                  .sort("wpm", DESCENDING)
                  .limit(3)
        )
        return jsonify({"winners": top3, "saved_at": None})
    snap["saved_at"] = _iso_utc(snap["saved_at"])
    return jsonify(snap)


@app.route("/api/tts", methods=["GET"])
def tts():
    text = request.args.get("text", "").strip()
    if not text or len(text) > 500:
        return jsonify({"error": "Invalid text"}), 400
    try:
        mp3_fp = io.BytesIO()
        gTTS(text=text, lang="en", tld="co.in", slow=False).write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        data = mp3_fp.read()
        response = app.response_class(data, mimetype="audio/mpeg")
        response.headers["Content-Length"] = len(data)
        response.headers["Accept-Ranges"] = "none"
        response.headers["Cache-Control"] = "no-store"
        return response
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
