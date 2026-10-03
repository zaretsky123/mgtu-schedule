import {i as getReact, t as getDOM} from './framework-DjPHiq1u.js';
import Schedule from './page-University.js';

const React = getReact();
const {createElement: h, useState, useEffect, useRef} = React;
const storage = {
  read(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
const base = new URL('../university-data/', import.meta.url);
const memory = new Map();
const compact = text => text.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu, '');

async function fetchJSON(path) {
  const response = await fetch(new URL(path, base), {cache: 'no-cache'});
  if (!response.ok) throw new Error('Не удалось загрузить данные. Попробуйте ещё раз.');
  return response.json();
}

export function filterLessons(lessons, subgroup) {
  return lessons.filter(item => subgroup === 'all' || item.subgroup == null || item.subgroup === Number(subgroup));
}

function Dialog({title, onClose, children}) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input,button,select')?.focus();
    const key = event => {
      if (event.key === 'Escape') onClose?.();
      if (event.key !== 'Tab') return;
      const nodes = [...panel.current.querySelectorAll('button,input,select,a[href]')].filter(n => !n.disabled);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return h('div', {className: 'uni-backdrop', onClick: event => {if (event.target === event.currentTarget) onClose?.();}},
    h('section', {className: 'uni-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title, ref: panel},
      h('header', null, h('h2', null, title), onClose && h('button', {type: 'button', onClick: onClose, 'aria-label': 'Закрыть'}, '✕')),
      children));
}

function App() {
  const [catalogue, setCatalogue] = useState(null);
  const [catalogueError, setCatalogueError] = useState('');
  const [current, setCurrent] = useState(null);
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState('groups');
  const [query, setQuery] = useState('');
  const [faculty, setFaculty] = useState('all');
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [subgroup, setSubgroup] = useState('all');
  const request = useRef(0);

  async function choose(group) {
    const token = ++request.current;
    setLoading(group.id); setError('');
    try {
      let payload = memory.get(group.id);
      let cached = false;
      if (!payload) {
        try {
          payload = await fetchJSON(`groups/${group.id}.json`);
          if (!Array.isArray(payload.lessons) || payload.groupId !== group.id) throw new Error('Неверные данные группы');
          memory.set(group.id, payload);
          storage.write(`mgtu-data:${group.id}`, payload);
        } catch (failure) {
          payload = storage.read(`mgtu-data:${group.id}`);
          if (!payload || payload.groupId !== group.id || !Array.isArray(payload.lessons)) throw failure;
          cached = true;
        }
      }
      if (token !== request.current) return;
      const saved = storage.read(`mgtu-subgroup:${group.id}`, 'all');
      const subgroups = [...new Set(payload.lessons.map(x => x.subgroup).filter(Boolean))];
      setSubgroup(saved === 'all' || subgroups.includes(Number(saved)) ? saved : 'all');
      setCurrent(group); setData(payload); setOffline(cached); setDialog(null);
      storage.write('mgtu-group', group.id);
      document.title = `${group.name} · Расписание МГТУ`;
    } catch (failure) {
      if (token === request.current) setError(failure.message);
    } finally { if (token === request.current) setLoading(null); }
  }

  async function loadCatalogue() {
    setCatalogueError('');
    try {
      let list;
      try { list = await fetchJSON('catalogue.json'); storage.write('mgtu-catalogue', list); }
      catch (failure) { list = storage.read('mgtu-catalogue'); if (!list) throw failure; }
      if (!Array.isArray(list.groups)) throw new Error('Не удалось прочитать список групп');
      setCatalogue(list);
      const remembered = storage.read('mgtu-group');
      const group = list.groups.find(g => g.id === remembered && g.available);
      if (group) choose(group);
    } catch (failure) { setCatalogueError(failure.message); }
  }
  useEffect(() => { loadCatalogue(); }, []);

  const groups = catalogue?.groups ?? [];
  const faculties = [...new Set(groups.flatMap(g => g.faculties))].sort((a,b) => a.localeCompare(b, 'ru'));
  const matching = groups.filter(g => compact(g.name).includes(compact(query)) && (faculty === 'all' || g.faculties.includes(faculty)));
  matching.sort((a,b) => Number(b.available || false) - Number(a.available || false) || a.name.localeCompare(b.name, 'ru', {numeric: true}));
  const subgroups = [...new Set((data?.lessons ?? []).map(x => x.subgroup).filter(Boolean))].sort();
  const filtered = filterLessons(data?.lessons ?? [], subgroup);
  const subgroupLabel = subgroups.length ? subgroup === 'all' ? 'Все подгруппы' : `Подгруппа ${subgroup}` : 'Общие занятия';
  function changeSubgroup(value) {
    setSubgroup(value);
    storage.write(`mgtu-subgroup:${current.id}`, value);
  }
  const close = () => setDialog(null);

  return h(React.Fragment, null,
    current && data && h(Schedule, {key: current.id, lessons: filtered, groupId: current.id, groupLabel: current.name,
      facultyLabel: 'Майкопский государственный технологический университет', subgroupLabel,
      onChooseGroup: () => {setError(''); setDialog('groups');}, onSettings: () => setDialog('settings')}),
    !current && h('main', {className: 'uni-welcome'}, h('span', {className:'eyebrow'}, 'МГТУ'), h('h1', null, 'Ваше расписание'), h('p', null, 'Все пары, аудитории и преподаватели — в одном месте.')),
    current && (offline || current.error) && h('div', {className:'data-notice', role:'status'}, offline ? 'Нет соединения. Показана сохранённая версия расписания.' : 'Последнее обновление не удалось. Показана последняя успешная версия.'),
    dialog === 'groups' && h(Dialog, {title: 'Выберите группу', onClose: current ? close : undefined},
      h('label', {className:'uni-field'}, 'Поиск группы', h('input', {type:'search', placeholder:'Например, СТ-11', value:query, onChange:e=>setQuery(e.target.value)})),
      h('label', {className:'uni-field'}, 'Факультет или подразделение', h('select', {'aria-label':'Факультет или подразделение', value:faculty, onChange:e=>setFaculty(e.target.value)}, h('option', {value:'all'}, 'Все подразделения'), faculties.map(f=>h('option', {key:f,value:f}, f)))),
      h('div', {role:'status', className:'uni-error'}, catalogueError || error),
      catalogueError && h('button', {className:'uni-primary', onClick:loadCatalogue}, 'Повторить'),
      !catalogue && !catalogueError && h('p', {role:'status'}, 'Загружаем список групп…'),
      catalogue && h('div', {className:'group-results'}, matching.length ? matching.map(g=>h('button', {key:g.id, className:'group-result', disabled:!g.available || loading !== null, onClick:()=>choose(g)},
        h('strong', null, g.name), h('span', null, g.available ? loading === g.id ? 'Открываем расписание…' : g.faculties.join(' · ') : 'Расписание пока не подключено'))) : h('p',null,'Группа не найдена. Попробуйте другое название.'))),
    dialog === 'settings' && current && h(Dialog, {title:'Настройки', onClose:close},
      h('label', {className:'uni-field'}, 'Группа', h('button',{className:'settings-group',onClick:()=>setDialog('groups')},`${current.name} · Изменить`)),
      subgroups.length > 0 && h('label', {className:'uni-field'}, 'Подгруппа', h('select',{'aria-label':'Подгруппа',value:subgroup,onChange:e=>changeSubgroup(e.target.value)},h('option',{value:'all'},'Все подгруппы'),subgroups.map(n=>h('option',{key:n,value:String(n)},`Подгруппа ${n}`)))),
      h('p',{className:'uni-hint'},'Выбор сохраняется на этом устройстве. Общие пары видны при любом выборе подгруппы.'),
      data.updatedAt && h('p',{className:'uni-hint'},`Данные обновлены: ${new Date(current.checkedAt || data.updatedAt).toLocaleString('ru-RU', {timeZone:'Europe/Moscow'})}`),
      h('a',{href:current.source,target:'_blank',rel:'noopener noreferrer',className:'source-link'},'Расписание на сайте вуза'),
      h('button',{className:'uni-primary',onClick:close},'Готово')));
}

if (typeof document !== 'undefined' && document.getElementById('university-root')) {
  getDOM().hydrateRoot(document.getElementById('university-root'), h(App));
}
