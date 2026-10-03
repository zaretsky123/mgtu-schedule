#!/usr/bin/env python3
"""Public MGTU group catalogue and schedules."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import re
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import urllib.request

from schedule_parser import (TreeParser, Node, DAY_NUMBERS, first_descendant,
                             candidate_from_cells, stable_id, normalize)

BASE = "https://local.mkgtu.ru/raspisnew/print.php"
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "university-data"


def download(url: str) -> str:
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MGTU public schedule reader"})
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.read().decode("utf-8")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise RuntimeError("Download failed")


def tree(document: str) -> Node:
    parser = TreeParser()
    parser.feed(document)
    return parser.root


def links(root: Node, parameter: str) -> dict[str, str]:
    result = {}
    for node in root.descendants("a"):
        query = parse_qs(urlparse(node.attrs.get("href", "")).query)
        name = node.text()
        if parameter in query and name and name != "*":
            result[query[parameter][0]] = name
    return result


def catalogue() -> list[dict]:
    faculties = links(tree(download(BASE)), "id_fakult")
    if not faculties:
        raise RuntimeError("В источнике нет списка факультетов")
    groups = {}
    def faculty(item):
        fid, name = item
        return fid, name, links(tree(download(f"{BASE}?id_fakult={fid}")), "id_grupp")
    with ThreadPoolExecutor(max_workers=4) as pool:
        for fid, faculty_name, found in pool.map(faculty, faculties.items()):
            for gid, name in found.items():
                group = groups.setdefault(gid, {"id": gid, "name": name.lstrip("*"), "faculties": [], "source": f"{BASE}?id_grupp={gid}"})
                if faculty_name not in group["faculties"]:
                    group["faculties"].append(faculty_name)
    if len(groups) < 50:
        raise RuntimeError(f"Подозрительно мало групп: {len(groups)}")
    return sorted(groups.values(), key=lambda g: (g["name"], int(g["id"])))


def parse_schedule(document: str, group: dict) -> list[dict]:
    root = tree(document)
    # Check the selected group, not a coincidental occurrence in the group menu.
    selected = [n.direct_text().lstrip("*") for n in root.descendants("h2")]
    if not any(re.match(re.escape(normalize(group["name"])) + r"(?:\s|$)", name) for name in selected):
        raise RuntimeError(f"Источник вернул другую группу вместо {group['name']}")
    parity_nodes = {n.attrs.get("id"): n for n in root.descendants("div") if n.attrs.get("id") in {"nechet", "chet"}}
    if set(parity_nodes) != {"nechet", "chet"}:
        raise RuntimeError("Не найдены обе недели; формат источника не поддерживается")
    lessons = []
    for source_parity, parity in (("nechet", "odd"), ("chet", "even")):
        panels = [n for n in parity_nodes[source_parity].descendants("div") if "panel" in n.classes]
        for panel in panels:
            heading = first_descendant(panel, class_name="panel-title")
            body = first_descendant(panel, class_name="panel-body")
            if heading is None or body is None or heading.text().lower() not in DAY_NUMBERS:
                continue
            weekday = DAY_NUMBERS[heading.text().lower()]
            for row in (n for n in body.descendants("div") if "row" in n.classes):
                cells = [n for n in row.children if isinstance(n, Node) and n.tag == "div"]
                if not cells:
                    continue
                pair_node = first_descendant(cells[0], tag="b")
                time_node = first_descendant(cells[0], tag="small")
                if pair_node is None or time_node is None:
                    continue
                number = re.search(r"\d+", pair_node.text())
                if number is None:
                    continue
                if len(cells) < 3 or len(cells) % 2 != 1:
                    raise RuntimeError("Неизвестная структура строки занятия")
                pair = int(number[0])
                times = re.findall(r"(\d{1,2}):(\d{2})", time_node.text())
                if len(times) != 2:
                    raise RuntimeError(f"Неизвестное время: {time_node.text()}")
                lesson_time = "–".join(f"{int(h):02}:{m}" for h, m in times)
                candidates = [candidate_from_cells(cells[i], cells[i + 1]) for i in range(1, len(cells), 2)]
                if len(candidates) > 1 and all(c == candidates[0] for c in candidates):
                    candidates = candidates[:1]
                for index, candidate in enumerate(candidates):
                    if not candidate["title"]:
                        continue
                    if candidate["kind"] == "unknown" and candidates[0]["kind"] == "lab":
                        candidate["kind"] = "lab"
                    lesson = {"weekday": weekday, "pair": pair, "time": lesson_time,
                              "parity": parity, **candidate,
                              "subgroup": index + 1 if len(candidates) > 1 else None}
                    lesson["id"] = f"{group['id']}-{stable_id(parity, weekday, pair, lesson)}-{lesson['subgroup'] or 'all'}"
                    lessons.append(lesson)
    if not lessons:
        raise RuntimeError("В источнике нет занятий; последняя успешная версия сохранена")
    if len({x["id"] for x in lessons}) != len(lessons):
        raise RuntimeError("Повторяющиеся занятия; требуется проверка источника")
    return sorted(lessons, key=lambda x: (x["parity"], x["weekday"], x["pair"], x["subgroup"] or 0, x["title"]))


def atomic_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)


def update(group: dict) -> dict:
    stamp = datetime.now(timezone.utc).isoformat()
    path = DATA / "groups" / f"{group['id']}.json"
    try:
        lessons = parse_schedule(download(group["source"]), group)
        old = json.loads(path.read_text()) if path.exists() else {}
        # Last check is recorded in the catalogue. Unchanged lesson files keep their timestamp.
        if old.get("lessons") != lessons:
            atomic_json(path, {"group": group["name"], "groupId": group["id"], "source": group["source"], "updatedAt": stamp, "lessons": lessons})
        clean = {key: value for key, value in group.items() if key != "error"}
        return {**clean, "available": True, "checkedAt": stamp, "subgroups": sorted({x["subgroup"] for x in lessons if x["subgroup"]})}
    except Exception as error:
        return {**group, "available": path.exists(), "checkedAt": stamp, "error": str(error)}


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--groups", help="Comma separated IDs; absent means all groups")
    args.add_argument("--catalogue-only", action="store_true")
    args.add_argument("--ready-only", action="store_true", help="Refresh only groups already connected to the pilot")
    args.add_argument("--cached-catalogue", action="store_true", help="Reuse downloaded catalogue for a selected-group retry")
    options = args.parse_args()
    old_path = DATA / "catalogue.json"
    groups = json.loads(old_path.read_text())["groups"] if options.cached_catalogue else catalogue()
    old = {g["id"]: g for g in json.loads(old_path.read_text()).get("groups", [])} if old_path.exists() else {}
    groups = [{**old.get(g["id"], {}), **g} for g in groups]
    targets = set(options.groups.split(",")) if options.groups else ({g["id"] for g in groups if g.get("available")} if options.ready_only else None)
    selected = [g for g in groups if targets is None or g["id"] in targets]
    if not options.catalogue_only:
        updated = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(update, g): g for g in selected}
            for future in as_completed(futures):
                group = future.result()
                updated[group["id"]] = group
                print(f"{group['name']}: {group.get('error', 'OK')}", flush=True)
        groups = [updated.get(g["id"], g) for g in groups]
    atomic_json(old_path, {"checkedAt": datetime.now(timezone.utc).isoformat(), "groups": groups})
    failures = [g for g in groups if g.get("error") and (targets is None or g["id"] in targets)]
    print(f"Catalogue: {len(groups)}; ready: {sum(g.get('available', False) for g in groups)}; errors: {len(failures)}")
    # Other groups still update when one group fails. Workflow reports partial failure.
    if failures and not options.catalogue_only:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
