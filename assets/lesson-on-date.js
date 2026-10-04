// Dates in the official session timetable take precedence over weekly recurrence.
export function lessonOccursOn(lesson, date, parity) {
  if (Array.isArray(lesson.dates)) {
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return lesson.dates.includes(key);
  }
  return lesson.weekday===date.getDay() && lesson.parity===parity;
}
