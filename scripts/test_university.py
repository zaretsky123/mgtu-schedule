import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import update_university as importer
from update_university import parse_schedule, gradual_targets, UnsupportedSchedule

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

    def test_session_uses_specific_date_instead_of_weekly_repetition(self):
        source = '<h2>ТЕСТ-11 ЗФО</h2><div class="panel"><h3 class="panel-title">16.11.2026</h3><div class="panel-body"><div class="row"><div><b>2.</b><small>9:40-11:10</small></div>' + cell("Физика", kind="success") + '</div></div></div>'
        lessons = parse_schedule(source, GROUP)
        self.assertEqual(len(lessons), 1)
        self.assertEqual(lessons[0]["dates"], ["2026-11-16"])
        self.assertEqual(lessons[0]["weekday"], 1)
        self.assertEqual(lessons[0]["parity"], "all")

    def test_date_written_in_subject_is_not_a_weekly_class(self):
        lessons = parse_schedule(document(cell("Биология 03.10.26")), GROUP)
        self.assertEqual(len(lessons), 1)
        self.assertTrue(all(x["dates"] == ["2026-10-03"] for x in lessons))

    def test_previous_year_session_is_not_published_as_current_schedule(self):
        with self.assertRaises(importer.NoSchedule):
            parse_schedule(document(cell("Биология 03.10.25")), GROUP)

    def test_external_table_is_not_imported_as_a_subject(self):
        with self.assertRaises(UnsupportedSchedule):
            parse_schedule(document(cell("Расписание: https://example.org/table")), GROUP)

    def test_missing_week_and_unknown_day_are_rejected(self):
        with self.assertRaises(RuntimeError):
            parse_schedule(document(cell("Физика")).replace('id="chet"', 'id="broken"'), GROUP)
        with self.assertRaises(UnsupportedSchedule):
            parse_schedule(document(cell("Физика")).replace('Вторник', 'Новый формат'), GROUP)

    def test_failure_preserves_last_good_file_and_success_clears_error(self):
        with TemporaryDirectory() as directory, patch.object(importer, "DATA", Path(directory)):
            group = {**GROUP, "source": "https://example.org", "available": True}
            target = Path(directory) / 'groups/42.json'
            target.parent.mkdir()
            target.write_text('{"old":"untouched"}')
            with patch.object(importer, "download", side_effect=TimeoutError('source offline')):
                result = importer.update(group)
            self.assertTrue(result["available"])
            self.assertEqual(result["connectionState"], 'error')
            self.assertEqual(target.read_text(), '{"old":"untouched"}')
            with patch.object(importer, "download", return_value=document(cell("Физика"))):
                result = importer.update(result)
            self.assertNotIn('error', result)
            self.assertEqual(result['connectionState'], 'ready')
            self.assertEqual(len(json.loads(target.read_text())['lessons']), 2)

    def test_gradual_batch_covers_faculties_and_advances_without_retrying_recent_failures(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        groups = [{'id':str(i), 'faculties':[fac], 'available':False} for i,fac in ((1,'А'),(2,'А'),(3,'Б'),(4,'Б'))]
        groups += [{'id':'9', 'available':True}, {'id':'10', 'faculties':['В'], 'available':False, 'checkedAt':now.isoformat()}]
        first = gradual_targets(groups, 2, now)
        self.assertEqual(first, {'9','2','4'})
        for g in groups:
            if g['id'] in first: g['checkedAt'] = now.isoformat()
        self.assertEqual(gradual_targets(groups, 2, now), {'9','1','3'})
        self.assertIn('10', gradual_targets(groups, 5, now + timedelta(days=8)))

if __name__ == '__main__': unittest.main()
