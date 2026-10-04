#!/usr/bin/env python3
"""Public MGTU group catalogue and schedules."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
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
TERM_START = "2026-09-01"
TERM_END = "2026-12-27"


class NoSchedule(RuntimeError):
    """The selected source group currently has no classes."""


class UnsupportedSchedule(RuntimeError):
    """The source redirects to a different timetable format."""


def source_dates(text: str) -> list[str]:
    result = []
    for day, month, year in re.findall(r"(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)", text):
        year = int(year) if len(year) == 4 else 2000 + int(year)
        result.append(datetime(year, int(month), int(day)).date().isoformat())
    return sorted(set(result))


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
    selected = [re.sub(r"^Группа\s+", "", n.direct_text().lstrip("*")) for n in root.descendants("h2")]
    if not any(re.match(re.escape(normalize(group["name"])) + r"(?:\s|$)", name) for name in selected):
        raise RuntimeError(f"Источник вернул другую группу вместо {group['name']}")
    parity_nodes = {n.attrs.get("id"): n for n in root.descendants("div") if n.attrs.get("id") in {"nechet", "chet"}}
    contexts = []
    if parity_nodes:
        if set(parity_nodes) != {"nechet", "chet"}:
            raise RuntimeError("Не найдены обе недели; формат источника не поддерживается")
        contexts = [(parity_nodes[key], value) for key, value in (("nechet", "odd"), ("chet", "even"))]
    else:
        contexts = [(root, "all")]
    lessons = []
    for context, parity in contexts:
        panels = [n for n in context.descendants("div") if "panel" in n.classes]
        for panel in panels:
            heading = first_descendant(panel, class_name="panel-title")
            body = first_descendant(panel, class_name="panel-body")
            if heading is None or body is None:
                raise RuntimeError("Неизвестная структура дня занятий")
            dates = source_dates(heading.text())
            if dates:
                if len(dates) != 1:
                    raise UnsupportedSchedule("В источнике указан диапазон дат; требуется отдельный обработчик")
                weekday = (datetime.fromisoformat(dates[0]).weekday() + 1) % 7
            elif heading.text().lower() in DAY_NUMBERS and parity != "all":
                weekday = DAY_NUMBERS[heading.text().lower()]
            else:
                raise UnsupportedSchedule(f"Неизвестный день: {heading.text()}")
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
                    if re.search(r"(?:https?://|www\.)", candidate["title"], re.I):
                        raise UnsupportedSchedule("Расписание в источнике содержит ссылку на внешнюю таблицу")
                    if candidate["kind"] == "unknown" and candidates[0]["kind"] == "lab":
                        candidate["kind"] = "lab"
                    lesson = {"weekday": weekday, "pair": pair, "time": lesson_time,
                              "parity": parity, **candidate,
                              "subgroup": index + 1 if len(candidates) > 1 else None}
                    explicit_dates = dates or source_dates(candidate["title"])
                    if explicit_dates:
                        if re.search(r"\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})\s*(?:[-–—]|по)\s*\d", candidate["title"]):
                            raise UnsupportedSchedule("У занятия указан диапазон дат; требуется отдельный обработчик")
                        lesson["dates"] = explicit_dates
                        lesson["parity"] = "all"
                    suffix = "-" + ",".join(explicit_dates) if explicit_dates else ""
                    lesson["id"] = f"{group['id']}-{stable_id(parity, weekday, pair, lesson)}-{lesson['subgroup'] or 'all'}{suffix}"
                    lessons.append(lesson)
    lessons = [x for x in lessons if not x.get("dates") or any(TERM_START <= day <= TERM_END for day in x["dates"])]
    if not lessons:
        raise NoSchedule("В источнике нет занятий на текущий учебный период")
    # A dated class can be copied into both source week tabs. It occurs once.
    dated_seen = set()
    unique = []
    for lesson in lessons:
        if lesson.get("dates"):
            identity = tuple(str(lesson.get(key, "")) for key in ("dates", "pair", "time", "room", "kind", "title", "teacher", "subgroup"))
            if identity in dated_seen:
                continue
            dated_seen.add(identity)
        unique.append(lesson)
    lessons = unique
    if len({x["id"] for x in lessons}) != len(lessons):
        raise RuntimeError("Повторяющиеся занятия; требуется проверка источника")
    return sorted(lessons, key=lambda x: (x["parity"], x.get("dates", []), x["weekday"], x["pair"], x["subgroup"] or 0, x["title"]))


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
        clean = {key: value for key, value in group.items() if key not in {"error", "connectionState"}}
        return {**clean, "available": True, "connectionState": "ready", "checkedAt": stamp, "subgroups": sorted({x["subgroup"] for x in lessons if x["subgroup"]})}
    except Exception as error:
        state = "empty" if isinstance(error, NoSchedule) else "unsupported" if isinstance(error, UnsupportedSchedule) else "error"
        return {**group, "available": path.exists(), "connectionState": state, "checkedAt": stamp, "error": str(error)}


def gradual_targets(groups: list[dict], batch_size: int, now: datetime | None = None) -> set[str]:
    """Refresh every connected group; try a bounded, fair batch of other groups."""
    now = now or datetime.now(timezone.utc)
    targets = {g["id"] for g in groups if g.get("available")}
    pools = {}
    for group in groups:
        if group["id"] in targets:
            continue
        try:
            checked = datetime.fromisoformat(group.get("checkedAt", ""))
        except ValueError:
            checked = None
        if checked is not None and now - checked < timedelta(days=7):
            continue
        faculty = (group.get("faculties") or [""])[0]
        pools.setdefault(faculty, []).append(group)
    for pool in pools.values():
        pool.sort(key=lambda g: (bool(g.get("checkedAt")), g.get("checkedAt", ""), -int(g["id"])))
    # Round robin prevents one large faculty from occupying the entire batch.
    added = 0
    while pools and added < batch_size:
        for faculty in sorted(list(pools)):
            group = pools[faculty].pop(0)
            targets.add(group["id"])
            added += 1
            if not pools[faculty]:
                del pools[faculty]
            if added == batch_size:
                break
    return targets


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--groups", help="Comma separated IDs; absent means all groups")
    args.add_argument("--catalogue-only", action="store_true")
    args.add_argument("--ready-only", action="store_true", help="Refresh only groups already connected")
    args.add_argument("--batch-size", type=int, help="Refresh connected groups and attempt this many new groups")
    args.add_argument("--cached-catalogue", action="store_true", help="Reuse downloaded catalogue for a selected-group retry")
    options = args.parse_args()
    if options.batch_size is not None and (options.batch_size < 1 or options.groups or options.ready_only):
        args.error("--batch-size must be positive and cannot be combined with --groups / --ready-only")
    old_path = DATA / "catalogue.json"
    groups = json.loads(old_path.read_text())["groups"] if options.cached_catalogue else catalogue()
    old = {g["id"]: g for g in json.loads(old_path.read_text()).get("groups", [])} if old_path.exists() else {}
    groups = [{**old.get(g["id"], {}), **g} for g in groups]
    targets = set(options.groups.split(",")) if options.groups else (gradual_targets(groups, options.batch_size) if options.batch_size is not None else ({g["id"] for g in groups if g.get("available")} if options.ready_only else None))
    if targets is not None and targets - {g["id"] for g in groups}:
        args.error("Unknown group IDs: " + ",".join(sorted(targets - {g["id"] for g in groups})))
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
    failures = [g for g in selected if g["id"] in updated and updated[g["id"]].get("error") and (g.get("available") or updated[g["id"]]["connectionState"] == "error")] if not options.catalogue_only else []
    print(f"Catalogue: {len(groups)}; ready: {sum(g.get('available', False) for g in groups)}; checked this run: {len(selected) if not options.catalogue_only else 0}; errors: {len(failures)}")
    # Other groups still update when one group fails. Workflow reports partial failure.
    if failures and not options.catalogue_only:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
