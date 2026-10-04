export function validGroup(payload, id) {
  return payload?.groupId===id && Array.isArray(payload.lessons) && payload.lessons.length>0;
}
export function validCatalogue(payload) {
  return Array.isArray(payload?.groups) && payload.groups.length>0
    && payload.groups.every(group=>typeof group.id==='string' && typeof group.name==='string' && Array.isArray(group.faculties));
}
export async function fetchData(url, validate, timeoutMs=15000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {cache:'no-cache', signal:controller.signal});
    if (!response.ok) throw new Error('Не удалось загрузить данные. Попробуйте ещё раз.');
    const data = await response.json();
    if (!validate(data)) throw new Error('Не удалось прочитать расписание. Сохранённые данные не изменены.');
    return {data, cached:response.headers?.get('X-MGTU-Cache')==='offline'};
  } finally { clearTimeout(timer); }
}
