from flask import Flask, jsonify
from threading import Thread

app = Flask("")


@app.route("/")
def home():
    return "Hello, I am alive"


@app.route("/health")
def health():
    return jsonify({"status": "ok", "message": "I am alive"}), 200


def run():
    app.run(host="0.0.0.0", port=8080)


def keep_alive():
    t = Thread(target=run)
    t.start()
