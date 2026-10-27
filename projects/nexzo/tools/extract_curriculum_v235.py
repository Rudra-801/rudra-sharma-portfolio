#!/usr/bin/env python3
"""Extract the MRIIRS CSE 2023-27 curriculum booklet into browser-ready JSON."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}
SEM_RE = re.compile(r"SEMESTER\s*[-–]?\s*(VIII|VII|VI|IV|V|III|II|I)\b", re.I)
SEM_RE_REVERSED = re.compile(r"\b(VIII|VII|VI|IV|V|III|II|I)\s*[-–]?\s*SEMESTER\b", re.I)
CODE_RE = re.compile(r"^[A-Z0-9.]+(?:-[A-Z0-9.]+)+\**$", re.I)
UNIT_RE = re.compile(r"^\s*UNIT\s*[-–:]?\s*([IVX]+|\d+)\s*[:.\-–]?\s*(.*)$", re.I)


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()


def number(value: str):
    raw = clean(value).replace("#", "")
    try:
        return float(raw) if "." in raw else int(raw)
    except ValueError:
        return raw


def semester_from(text: str):
    match = SEM_RE.search(clean(text))
    if not match:
        match = SEM_RE_REVERSED.search(clean(text))
    return ROMAN.get(match.group(1).upper()) if match else None


def scheme_courses(document: Document):
    courses = {}
    semester = None
    # The first large tables are the authoritative study-scheme tables. Later
    # tables are course outcomes/assessment matrices and are ignored here.
    for table in document.tables:
        for row in table.rows:
            cells = [clean(cell.text) for cell in row.cells]
            if not cells:
                continue
            marker = semester_from(" ".join(dict.fromkeys(cells)))
            if marker:
                semester = marker
                continue
            if semester is None or len(cells) < 3:
                continue
            code = cells[1].replace(" ", "").strip("*")
            title = cells[2]
            if not CODE_RE.match(code) or not title or title.lower() in {"title of course", "subject"}:
                continue
            # Course outcome rows use codes such as BCS-DS-405.1; they are not
            # curriculum courses.
            if re.search(r"\.\d+$", code):
                continue
            key = f"{semester}:{code.upper()}"
            if key in courses:
                continue
            courses[key] = {
                "id": re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-"),
                "semesterSuggested": semester,
                "type": cells[0] or "Elective",
                "code": code.upper(),
                "title": title,
                "prerequisiteTitle": cells[3] if len(cells) > 3 and cells[3].upper() != "NIL" else "",
                "prerequisiteCode": cells[4].replace(" ", "") if len(cells) > 4 else "",
                "hours": {
                    "lecture": number(cells[5]) if len(cells) > 5 else "",
                    "tutorial": number(cells[6]) if len(cells) > 6 else "",
                    "practical": number(cells[7]) if len(cells) > 7 else "",
                    "total": number(cells[8]) if len(cells) > 8 else "",
                },
                "marks": {
                    "continuous": number(cells[9]) if len(cells) > 9 else "",
                    "endSemester": number(cells[10]) if len(cells) > 10 else "",
                    "total": number(cells[11]) if len(cells) > 11 else "",
                },
                "examDuration": cells[12] if len(cells) > 12 else "",
                "credits": number(cells[13]) if len(cells) > 13 else "",
                "units": [],
                "outcomes": [],
                "experiments": [],
            }
    return courses


def paragraph_texts(document: Document):
    return [(clean(paragraph.text), paragraph.style.name) for paragraph in document.paragraphs]


def attach_detailed_content(document: Document, courses: dict):
    paragraphs = paragraph_texts(document)
    code_to_rows = {}
    for row in courses.values():
        code_to_rows.setdefault(row["code"], []).append(row)

    current = None
    current_unit = None
    collecting_experiments = False

    def resolve_course(text: str):
        upper = text.upper().replace(" ", "")
        for code, rows in code_to_rows.items():
            compact = code.replace(" ", "")
            if upper.startswith(compact + ":") or upper.startswith(compact + "-") or upper == compact:
                # Prefer the course whose suggested semester is closest to the
                # current document section; duplicate codes remain supported.
                return rows[0]
        return None

    stop_labels = ("TEXT BOOK", "TEXTBOOK", "REFERENCE BOOK", "WEBLINK", "ASSESSMENT TOOL", "COURSE ARTICULATION")
    for text, style in paragraphs:
        if not text:
            continue
        course = resolve_course(text)
        if course and (style.startswith("Heading") or text == text.upper() or ":" in text):
            current = course
            current_unit = None
            collecting_experiments = False
            continue
        if not current:
            continue
        match = UNIT_RE.match(text)
        if match:
            label = match.group(1).upper()
            title = clean(match.group(2)) or f"Unit {label}"
            current_unit = {"label": f"Unit {label}", "title": title, "topics": []}
            current["units"].append(current_unit)
            collecting_experiments = False
            continue
        upper = text.upper()
        if upper.startswith(stop_labels):
            current_unit = None
            collecting_experiments = False
            continue
        if re.match(rf"^{re.escape(current['code'])}\.\d+\s*[:.-]", text, re.I):
            statement = re.sub(r"^[^:.-]+(?:\.\d+)?\s*[:.-]\s*", "", text).strip()
            if statement and statement not in current["outcomes"]:
                current["outcomes"].append(statement[:700])
            continue
        if "LIST OF EXPERIMENT" in upper or "LIST OF PRACTICAL" in upper:
            collecting_experiments = True
            current_unit = None
            continue
        if collecting_experiments:
            if len(current["experiments"]) < 30 and not upper.startswith(stop_labels):
                current["experiments"].append(text[:800])
            continue
        if current_unit and len(current_unit["topics"]) < 30:
            topic = re.sub(r"^\d+(?:\.\d+)*[.)]?\s*", "", text).strip(" ,-;")
            if topic and len(topic) > 2 and topic not in current_unit["topics"]:
                current_unit["topics"].append(topic[:1000])

    # Remove obvious duplicate units/topics introduced by repeated headers.
    for course in courses.values():
        seen = set()
        units = []
        for unit in course["units"]:
            signature = (unit["label"].lower(), unit["title"].lower())
            if signature in seen:
                continue
            seen.add(signature)
            unit["topics"] = list(dict.fromkeys(unit["topics"]))
            units.append(unit)
        course["units"] = units
        course["outcomes"] = list(dict.fromkeys(course["outcomes"]))[:8]
        course["experiments"] = list(dict.fromkeys(course["experiments"]))[:30]


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract_curriculum_v235.py INPUT.docx OUTPUT.json")
    source, destination = Path(sys.argv[1]), Path(sys.argv[2])
    document = Document(source)
    courses = scheme_courses(document)
    attach_detailed_content(document, courses)
    rows = sorted(courses.values(), key=lambda row: (row["semesterSuggested"], row["code"], row["title"]))
    payload = {
        "schemaVersion": 235,
        "institution": "Manav Rachna International Institute of Research and Studies",
        "programme": "B.Tech Computer Science and Engineering",
        "curriculum": "CSE Core 2023-27",
        "source": "Curriculum Booklet CSE-Core 23-27_FINAL V1 As per new Scheme",
        "semesterIsSuggestionOnly": True,
        "courses": rows,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with_units = sum(bool(row["units"]) for row in rows)
    print(json.dumps({"courses": len(rows), "withUnits": with_units, "semesters": sorted({row['semesterSuggested'] for row in rows}), "output": str(destination)}))


if __name__ == "__main__":
    main()
