"""Shared HTML parser for the official MGTU timetable; no personal overrides."""
from __future__ import annotations
import hashlib
import html as html_module
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

DAY_NUMBERS = {
    "понедельник": 1,
    "вторник": 2,
    "среда": 3,
    "четверг": 4,
    "пятница": 5,
    "суббота": 6,
    "воскресенье": 0,
}

KIND_BY_LABEL = {
    "label-success": "lecture",
    "label-danger": "seminar",
    "label-warning": "practice",
    "label-info": "lab",
}

def normalize(value: str) -> str:
    return " ".join(html_module.unescape(value).replace("\xa0", " ").split())

@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["Node | str"] = field(default_factory=list)
    parent: "Node | None" = None

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())

    def descendants(self, tag: str | None = None) -> list["Node"]:
        found: list[Node] = []
        for child in self.children:
            if isinstance(child, Node):
                if tag is None or child.tag == tag:
                    found.append(child)
                found.extend(child.descendants(tag))
        return found

    def text(self) -> str:
        parts: list[str] = []
        for child in self.children:
            parts.append(child if isinstance(child, str) else child.text())
        return normalize(" ".join(parts))

    def direct_text(self) -> str:
        return normalize(" ".join(c for c in self.children if isinstance(c, str)))

class TreeParser(HTMLParser):
    VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, {key: value or "" for key, value in attrs}, parent=self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in self.VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)

def first_descendant(node: Node, *, tag: str | None = None, class_name: str | None = None) -> Node | None:
    for child in node.descendants(tag):
        if class_name is None or class_name in child.classes:
            return child
    return None

def parse_meta(meta: Node) -> tuple[str, str]:
    room = ""
    kind = "unknown"
    for span in meta.descendants("span"):
        if "label-default" in span.classes:
            room = re.sub(r"^а\.\s*", "", span.text(), flags=re.IGNORECASE)
        for label_class, mapped_kind in KIND_BY_LABEL.items():
            if label_class in span.classes:
                kind = mapped_kind
    return normalize(room), kind

def parse_subject(subject: Node) -> tuple[str, str]:
    title = subject.direct_text()
    teacher_node = first_descendant(subject, tag="em")
    teacher = teacher_node.text() if teacher_node else ""
    return title, teacher

def candidate_from_cells(meta: Node, subject: Node) -> dict[str, str]:
    room, kind = parse_meta(meta)
    title, teacher = parse_subject(subject)
    return {"room": room, "kind": kind, "title": title, "teacher": teacher}

def stable_id(parity: str, weekday: int, pair: int, lesson: dict[str, object]) -> str:
    identity = "|".join(str(lesson.get(key, "")) for key in ("title", "teacher", "room", "kind"))
    suffix = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:8]
    return f"{parity}-{weekday}-{pair}-{suffix}"
