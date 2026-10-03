import unittest
from update_university import parse_schedule

GROUP = {"id": "42", "name": "ТЕСТ-11"}

def cell(title, room="301", kind="info"):
    return f'<div><span class="label-default">а.{room}</span><span class="label-{kind}">тип</span></div><div>{title}<em>Иванов И.И.</em></div>'

def document(cells, heading="ТЕСТ-11 ОФО"):
    row = f'<div class="row"><div><b>2.</b><small>10:15-11:45</small></div>{cells}</div>'
    panel = f'<div class="panel"><h3 class="panel-title">Вторник</h3><div class="panel-body">{row}</div></div>'
    return f'<h2>{heading}</h2><div id="nechet">{panel}</div><div id="chet">{panel}</div>'

class UniversityParserTests(unittest.TestCase):
    def test_retains_both_subgroups_and_source_time(self):
        lessons = parse_schedule(document(cell("Химия") + cell("Физика", "401")), GROUP)
        self.assertEqual(len(lessons), 4)
        self.assertEqual({x["subgroup"] for x in lessons}, {1, 2})
        self.assertEqual({x["time"] for x in lessons}, {"10:15–11:45"})

    def test_common_class_once_and_no_personal_exclusion(self):
        lessons = parse_schedule(document(cell("География", kind="success")), GROUP)
        self.assertEqual(len(lessons), 2)
        self.assertTrue(all(x["subgroup"] is None for x in lessons))

    def test_empty_subgroup_is_not_replaced_with_other_subgroup(self):
        lessons = parse_schedule(document(cell("Латинский язык") + cell("")), GROUP)
        self.assertTrue(all(x["subgroup"] == 1 for x in lessons))

    def test_identical_shared_columns_are_deduplicated(self):
        lessons = parse_schedule(document(cell("Физика") * 2), GROUP)
        self.assertEqual(len(lessons), 2)
        self.assertTrue(all(x["subgroup"] is None for x in lessons))

    def test_wrong_group_rejected_even_when_menu_contains_group(self):
        source = '<a href="?id_grupp=42">ТЕСТ-11</a>' + document(cell("Химия"), "ДРУГАЯ-11 ОФО")
        with self.assertRaises(RuntimeError): parse_schedule(source, GROUP)

if __name__ == '__main__': unittest.main()
