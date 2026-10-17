#!/usr/bin/env python3
"""Извлекает программу, таблицы и продукты из cycle1.xlsm в src/data/*.js и tests/golden.json.

Запуск: python3 -I tools/extract_program.py cycle1.xlsm
Зависимостей нет (только стандартная библиотека).
"""
import collections
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
ROOT = Path(__file__).resolve().parent.parent

EX_IDS = {
    "Присед": "squat",
    "Жим лежа": "bench",
    "Становая тяга": "deadlift",
    "Присед на груди": "front_squat",
    "Жим гантелей": "db_bench",
    "Разгибание с гантелью из-за головы": "db_tri_ext",
    "Наклоны": "good_morning",
    "Жим стоя": "ohp",
    "Присед в широкой постановке": "wide_squat",
    "Французский жим": "french_press",
    "Бицепс стоя": "bb_curl",
}
# (шаг: процент, повторы, подходы) -> столбцы вес/повторы/подходы/процент
STEP_COLS = [("G", "H", "I", "J"), ("K", "L", "M", "N"), ("O", "P", "Q", "R"),
             ("S", "T", "U", "V"), ("W", "X", "Y", "Z"), ("AA", "AB", "AC", "AD")]
MICROCYCLES = 12


class Book:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        root = ET.fromstring(self.z.read("xl/sharedStrings.xml"))
        self.ss = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])) for si in root.findall("m:si", NS)]
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))}
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        self.paths = {s.get("name"): "xl/" + rels[s.get(RNS)].lstrip("/").replace("xl/", "")
                      for s in wb.find("m:sheets", NS)}

    def sheet(self, name):
        """-> {row: {col: value}} (кэшированные значения)."""
        rows = collections.defaultdict(dict)
        root = ET.fromstring(self.z.read(self.paths[name]))
        for row in root.find("m:sheetData", NS):
            for c in row:
                v = c.find("m:v", NS)
                if v is None or v.text is None:
                    continue
                val = self.ss[int(v.text)] if c.get("t") == "s" else v.text
                m = re.match(r"([A-Z]+)(\d+)", c.get("r"))
                rows[int(m.group(2))][m.group(1)] = val
        return rows


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def extract_program(book):
    s = book.sheet("1 в день")
    slots = collections.OrderedDict()   # (day, exId, load) -> slot
    notes = {}
    golden = {"pm": {}, "microcycles": [], "exercises": []}
    for mc in range(MICROCYCLES):
        base = 4 + 56 * mc
        hdr = 2 + 56 * mc
        golden["microcycles"].append({
            "tonnage": num(s[hdr].get("AE")), "kpsh": num(s[hdr].get("AJ")),
            "oi": num(s[hdr].get("AG")), "intFB": num(s[hdr].get("AI")),
            "timeDays": num(s[hdr].get("AK")),
        })
        for d in range(3):
            start = base + 9 * d
            day_row = start + 8
            for r in range(start, start + 8):
                x = s.get(r, {})
                name = x.get("D")
                if not name or name not in EX_IDS:
                    continue
                steps = []
                for w, p, u, pc in STEP_COLS:
                    pct = num(x.get(pc))
                    if pct:
                        steps.append([round(pct, 4), int(float(x[p])), int(float(x[u]))])
                if not steps:
                    continue
                key = (d + 1, EX_IDS[name], x.get("B"))
                slot = slots.setdefault(key, {
                    "day": d + 1, "exId": EX_IDS[name], "load": x.get("B"),
                    "group": x.get("C"), "k": num(x.get("E")), "mult": int(num(x.get("F")) or 1),
                    "profile": [None] * MICROCYCLES})
                slot["profile"][mc] = steps
                if mc == 0 and x.get("AL"):
                    notes[d + 1] = x["AL"]
                g = {"mc": mc + 1, "day": d + 1, "exId": EX_IDS[name], "pm": num(x.get("AH")),
                     "weights": [num(x.get(w)) for w, *_ in STEP_COLS][:len(steps)],
                     "tonnage": num(x.get("AE")), "kpsh": num(x.get("AJ")),
                     "intFB": num(x.get("AI")), "oi": num(x.get("AG")), "timeDays": num(x.get("AK"))}
                golden["exercises"].append(g)
            golden.setdefault("days", []).append({
                "mc": mc + 1, "day": d + 1,
                "tonnage": num(s[day_row].get("AE")), "kpsh": num(s[day_row].get("AJ")),
                "oi": num(s[day_row].get("AG")), "intFB": num(s[day_row].get("AI")),
                "avgK": num(s[day_row].get("E")), "timeDays": num(s[day_row].get("AK"))})
        golden["pm"][mc + 1] = {"squat": num(s[base].get("AH")), "bench": num(s[base + 1].get("AH")),
                                "deadlift": num(s[base + 9].get("AH"))}
    # коэффициент ПМ производных упражнений: берём из первого микроцикла
    return list(slots.values()), notes, golden


def extract_tables(book):
    f = book.sheet("F")
    int_table = [[round(float(f[r]["A"]), 4), round(float(f[r]["B"]), 6)]
                 for r in range(1, 102) if "A" in f[r] and "B" in f[r]]
    cols = ["P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB"]
    k_thr = [float(f[20][c]) for c in cols]
    time_rows = [[float(f[r]["O"]), [float(f[r][c]) for c in cols]] for r in range(21, 34)]
    return {"INT_TABLE": int_table, "TIME_K": k_thr, "TIME_ROWS": time_rows,
            "WARMUP_MIN": float(f[37]["V"]), "TIME_CORR": float(f[35]["T"])}


def extract_foods(book):
    s = book.sheet("Прод")
    foods, group = [], None
    for r in sorted(s):
        x = s[r]
        if x.get("B") and not x.get("C"):
            group = x["B"]
        elif x.get("C") and x.get("D") is not None:
            if group in ("Напитки алкогольные", "Моя группа"):
                continue
            n = lambda c: round(num(x.get(c)) or 0, 2)
            foods.append([group, x["C"].strip(), n("D"), n("E"), n("F"), n("G"), n("H")])
    return foods


def write_js(path, name, obj, comment):
    path.write_text(f"// {comment}\n// Файл создаётся скриптом tools/extract_program.py, руками не править.\n"
                    f"export const {name} = {json.dumps(obj, ensure_ascii=False)};\n", encoding="utf-8")


def main():
    book = Book(sys.argv[1] if len(sys.argv) > 1 else ROOT / "cycle1.xlsm")
    slots, notes, golden = extract_program(book)
    write_js(ROOT / "src/data/program.js", "BASE_SLOTS", slots, "Программа «1 в день»: слоты по дням, профиль нагрузки по 12 микроциклам")
    write_js(ROOT / "src/data/notes.js", "DAY_NOTES", notes, "Заметки к дням из первого микроцикла")
    t = extract_tables(book)
    out = "// Таблицы из листа «F». Создаётся скриптом tools/extract_program.py.\n" + "".join(
        f"export const {k} = {json.dumps(v)};\n" for k, v in t.items())
    (ROOT / "src/data/tables.js").write_text(out, encoding="utf-8")
    foods = extract_foods(book)
    write_js(ROOT / "src/data/foods.js", "FOODS", foods, "База продуктов на 100 г: [группа, название, белки, жиры, углеводы, ккал, ГИ]")
    (ROOT / "tests/golden.json").write_text(json.dumps(golden, ensure_ascii=False), encoding="utf-8")
    print(len(slots), "слотов,", len(foods), "продуктов")


if __name__ == "__main__":
    main()
