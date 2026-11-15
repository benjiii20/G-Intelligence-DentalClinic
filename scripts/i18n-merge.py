"""Merge a flat chunk {"a.b.c": ["Deutsch", "English"]} into src/i18n/de.json and en.json.

Keeps both files in sync (identical keys).
Usage: python scripts/i18n-merge.py chunk.json [--glossary]
"""
import json
import os
import sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "i18n")
chunk = json.load(open(sys.argv[1], encoding="utf-8"))
gloss = "--glossary" in sys.argv
names = ["de.json", "en.json"]
paths = [os.path.join(root, "glossary", n) if gloss else os.path.join(root, n) for n in names]
for i, p in enumerate(paths):
    data = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
    for key, pair in chunk.items():
        node = data
        parts = key.split(".")
        for part in parts[:-1]:
            if not isinstance(node.get(part), dict):
                node[part] = {}
            node = node[part]
        node[parts[-1]] = pair[i]
    with open(p, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
print("merged", len(chunk), "keys")
