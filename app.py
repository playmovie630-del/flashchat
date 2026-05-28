import os

from flask import Flask, render_template, request, jsonify, session
from uuid import uuid4
from time import time
from threading import Lock

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = "replace-this-with-a-secure-random-key"

rooms = {}
user_room = {}
waiting = []
lock = Lock()

SESSION_TIMEOUT = 12 * 60 * 60


def get_user_id():
    if "uid" not in session:
        session["uid"] = uuid4().hex
    return session["uid"]


def cleanup():
    now = time()
    stale = now - SESSION_TIMEOUT
    with lock:
        for room_id in list(rooms):
            room = rooms[room_id]
            if room["last_activity"] < stale:
                for uid in (room["a"], room["b"]):
                    user_room.pop(uid, None)
                rooms.pop(room_id, None)
        waiting[:] = [item for item in waiting if item["created_at"] >= stale]


def make_room(a, b):
    room_id = uuid4().hex
    room = {
        "a": a,
        "b": b,
        "messages": [],
        "last_activity": time(),
    }
    rooms[room_id] = room
    user_room[a] = room_id
    user_room[b] = room_id
    return room_id, room


def room_for_user(uid):
    room_id = user_room.get(uid)
    if room_id:
        return room_id, rooms.get(room_id)
    return None, None


def build_response(room, uid, since):
    messages = [
        {
            "author": "me" if msg["sender"] == uid else "them",
            "text": msg["text"],
            "at": msg["at"],
        }
        for msg in room["messages"]
        if msg["at"] > since
    ]
    return {
        "status": "connected",
        "roomId": user_room.get(uid),
        "messages": messages,
    }


@app.route("/")
def index():
    get_user_id()
    return render_template("index.html")


@app.route("/join", methods=["POST"])
def join():
    uid = get_user_id()
    cleanup()

    with lock:
        if uid in waiting:
            waiting[:] = [item for item in waiting if item["uid"] != uid]
        room_id, room = room_for_user(uid)
        if room:
            return jsonify(build_response(room, uid, 0))
        if waiting:
            partner = waiting.pop(0)["uid"]
            room_id, room = make_room(partner, uid)
            return jsonify(build_response(room, uid, 0))
        waiting.append({"uid": uid, "created_at": time()})
        return jsonify({"status": "waiting"})


@app.route("/poll", methods=["GET"])
def poll():
    uid = get_user_id()
    since = float(request.args.get("since", 0))
    cleanup()

    room_id, room = room_for_user(uid)
    if not room:
        return jsonify({"status": "waiting"})
    return jsonify(build_response(room, uid, since))


@app.route("/send", methods=["POST"])
def send_message():
    uid = get_user_id()
    text = request.json.get("text", "").strip()
    if not text:
        return jsonify({"status": "error", "message": "Message is empty."}), 400

    room_id, room = room_for_user(uid)
    if not room:
        return jsonify({"status": "error", "message": "You are not connected."}), 400

    msg = {"sender": uid, "text": text, "at": time()}
    with lock:
        room["messages"].append(msg)
        room["last_activity"] = time()
        if len(room["messages"]) > 200:
            room["messages"].pop(0)

    return jsonify({"status": "ok"})


@app.route("/leave", methods=["POST"])
def leave():
    uid = get_user_id()
    with lock:
        if uid in waiting:
            waiting[:] = [item for item in waiting if item["uid"] != uid]
        room_id = user_room.pop(uid, None)
        if room_id and room_id in rooms:
            room = rooms[room_id]
            partner = room["a"] if room["b"] == uid else room["b"]
            user_room.pop(partner, None)
            rooms.pop(room_id, None)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("DEBUG", "false").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
