import {i as getReact, t as getDOM} from './framework-DjPHiq1u.js';
import Schedule from './page-University.js?v=20261004-settings-only';
import {Icon} from './university-ui.js?v=20261003-gear';
import {fetchData, validGroup, validCatalogue} from './data-cache.js';

const React = getReact();
const {createElement:h, useState, useEffect, useRef} = React;
const storage = {
  read(key, fallback=null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};
const base = new URL('../university-data/', import.meta.url);
const memory = new Map();
const compact = text => text.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu, '');
const defaults = {compactView:false, showEmptySlots:false, showNoteIndicator:true};
function readPreferences() {
  const saved = storage.read('mgtu-preferences', {});
  return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,typeof saved[key]==='boolean'?saved[key]:value]));
}
function readSavedGroups() {
  const saved = storage.read('mgtu-saved-groups', []);
  return Array.isArray(saved) ? [...new Set(saved.filter(x=>typeof x==='string'))] : [];
}
export function filterLessons(lessons, subgroup) {
  return lessons.filter(item=>subgroup==='all' || item.subgroup==null || item.subgroup===Number(subgroup));
}
function useOverlay(panel,onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(()=>{
    const previous = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input,button,select')?.focus();
    const key = event=>{
      if (event.key==='Escape') closeRef.current?.();
      if (event.key!=='Tab') return;
      const nodes=[...panel.current.querySelectorAll('button,input,select,a[href]')].filter(n=>!n.disabled);
      if (!nodes.length) return;
      const first=nodes[0],last=nodes.at(-1);
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
      if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',key);
    return ()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
  },[]);
}
function Dialog({title,onClose,children}) {
  const panel=useRef(null);
  useOverlay(panel,onClose);
  return h('div',{className:'uni-backdrop',onClick:event=>{if(event.target===event.currentTarget)onClose?.();}},
    h('section',{className:'uni-dialog',role:'dialog','aria-modal':true,'aria-label':title,ref:panel},
      h('header',null,h('h2',null,title),onClose&&h('button',{type:'button',onClick:onClose,'aria-label':'Закрыть'},'✕')),children));
}
function Screen({title,onBack,children}) {
  const panel=useRef(null);
  useOverlay(panel,onBack);
  return h('section',{className:'settings-screen',role:'dialog','aria-modal':true,'aria-label':title,ref:panel},
    h('div',{className:'settings-inner'},
      h('header',{className:'settings-header'},h('button',{type:'button',onClick:onBack,'aria-label':'Назад',className:'icon-button'},h(Icon,{name:'arrow'})),h('h1',null,title),h('span',{'aria-hidden':true})),children));
}
function SwitchRow({name,label,hint,checked,onChange}) {
  return h('label',{className:'setting-row switch-row'},h(Icon,{name}),h('span',{className:'setting-copy'},h('strong',null,label),hint&&h('small',null,hint)),
    h('input',{type:'checkbox',role:'switch','aria-label':label,checked,onChange:e=>onChange(e.target.checked)}),h('span',{className:'toggle-track','aria-hidden':true}));
}
function App() {
  const [catalogue,setCatalogue]=useState(null);
  const [catalogueError,setCatalogueError]=useState('');
  const [current,setCurrent]=useState(null);
  const [data,setData]=useState(null);
  const [dialog,setDialog]=useState('groups');
  const [selectionOrigin,setSelectionOrigin]=useState(null);
  const [query,setQuery]=useState('');
  const [faculty,setFaculty]=useState('all');
  const [loading,setLoading]=useState(null);
  const [error,setError]=useState('');
  const [offline,setOffline]=useState(false);
  const [subgroup,setSubgroup]=useState('all');
  const [preferences,setPreferences]=useState(readPreferences);
  const [savedIds,setSavedIds]=useState(readSavedGroups);
  const [offlineReady,setOfflineReady]=useState(false);
  const request=useRef(0);
  const catalogueReady=useRef(false);
  const activeGroup=useRef(null);
  activeGroup.current=current;

  function rememberGroup(id) {
    setSavedIds(previous=>{const next=previous.includes(id)?previous:[...previous,id];storage.write('mgtu-saved-groups',next);return next;});
  }
  async function choose(group,background=false) {
    const token=++request.current;
    let savedPayload=memory.get(group.id)||storage.read(`mgtu-data:${group.id}`);
    if(!validGroup(savedPayload,group.id))savedPayload=null;
    setLoading(savedPayload?null:group.id);setError('');
    function apply(payload,cached,initial) {
      if (token!==request.current) return;
      const availableSubgroups=[...new Set(payload.lessons.map(x=>x.subgroup).filter(Boolean))];
      setData(payload);setOffline(cached);
      if(initial){
        const saved=storage.read(`mgtu-subgroup:${group.id}`,'all');
        setSubgroup(saved==='all'||availableSubgroups.includes(Number(saved))?saved:'all');
        setCurrent(group);setDialog(null);
        rememberGroup(group.id);storage.write('mgtu-group',group.id);
        document.title=`${group.name} · Расписание МГТУ`;
      }else{
        setSubgroup(previous=>previous==='all'||availableSubgroups.includes(Number(previous))?previous:'all');
      }
    }
    if(savedPayload)apply(savedPayload,navigator.onLine===false,!background);
    try {
      const result=await fetchData(new URL(`groups/${group.id}.json`,base),payload=>validGroup(payload,group.id));
      if(token!==request.current)return;
      memory.set(group.id,result.data);storage.write(`mgtu-data:${group.id}`,result.data);
      apply(result.data,result.cached,!savedPayload);
    } catch(failure) {
      if(token===request.current){if(savedPayload)setOffline(true);else setError(failure.name==='AbortError'?'Загрузка заняла слишком много времени. Попробуйте ещё раз.':failure.message);}
    }
    finally {if(token===request.current)setLoading(null);}
  }
  async function loadCatalogue() {
    setCatalogueError('');
    function apply(list){
      setCatalogue(list);
      setCurrent(previous=>previous?(list.groups.find(g=>g.id===previous.id)||previous):null);
      if(!catalogueReady.current){
        catalogueReady.current=true;
        const remembered=storage.read('mgtu-group')||storage.read('mgtu-primary-group');
        storage.remove('mgtu-primary-group');
        const group=list.groups.find(g=>g.id===remembered&&g.available)
          ||readSavedGroups().map(id=>list.groups.find(g=>g.id===id&&g.available)).find(Boolean);
        if(group)choose(group);
      }
    }
    const saved=storage.read('mgtu-catalogue');
    if(validCatalogue(saved))apply(saved);
    try {
      const result=await fetchData(new URL('catalogue.json',base),validCatalogue);
      storage.write('mgtu-catalogue',result.data);apply(result.data);
    } catch(failure) {if(!validCatalogue(saved))setCatalogueError(failure.name==='AbortError'?'Не удалось загрузить список групп. Попробуйте ещё раз.':failure.message);}
  }
  useEffect(()=>{
    loadCatalogue();
    const online=()=>{loadCatalogue();if(activeGroup.current)choose(activeGroup.current,true);};
    window.addEventListener('online',online);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname})
        .then(()=>navigator.serviceWorker.ready).then(()=>setOfflineReady(true)).catch(()=>{});
    }
    return()=>window.removeEventListener('online',online);
  },[]);
  const groups=catalogue?.groups??[];
  const savedGroups=savedIds.map(id=>groups.find(g=>g.id===id)).filter(Boolean);
  const faculties=[...new Set(groups.flatMap(g=>g.faculties))].sort((a,b)=>a.localeCompare(b,'ru'));
  const matching=groups.filter(g=>compact(g.name).includes(compact(query))&&(faculty==='all'||g.faculties.includes(faculty)));
  matching.sort((a,b)=>Number(b.available||false)-Number(a.available||false)||a.name.localeCompare(b.name,'ru',{numeric:true}));
  const subgroups=[...new Set((data?.lessons??[]).map(x=>x.subgroup).filter(Boolean))].sort();
  const filtered=filterLessons(data?.lessons??[],subgroup);
  const subgroupLabel=subgroups.length?subgroup==='all'?'Все подгруппы':`Подгруппа ${subgroup}`:'Общие занятия';
  function changeSubgroup(value) {setSubgroup(value);storage.write(`mgtu-subgroup:${current.id}`,value);}
  function changePreference(key,value) {setPreferences(previous=>{const next={...previous,[key]:value};storage.write('mgtu-preferences',next);return next;});}
  function removeGroup(id) {
    const next=savedIds.filter(x=>x!==id);setSavedIds(next);storage.write('mgtu-saved-groups',next);
    if(current?.id===id){
      ++request.current;setCurrent(null);setData(null);setOffline(false);setError('');storage.remove('mgtu-group');
      document.title='Расписание МГТУ';
      const nextGroup=next.map(groupId=>groups.find(g=>g.id===groupId&&g.available)).find(Boolean);
      if(nextGroup)choose(nextGroup);else setDialog('saved-groups');
    }
  }
  function openSearch(origin=null) {setSelectionOrigin(origin);setError('');setQuery('');setFaculty('all');setDialog('groups');}
  function openSavedGroups() {setError('');setDialog('saved-groups');}
  const close=()=>setDialog(null);
  const stamp=value=>new Date(value).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'});

  return h(React.Fragment,null,
    current&&data&&h(Schedule,{key:current.id,lessons:filtered,groupId:current.id,groupLabel:current.name,
      facultyLabel:'Майкопский государственный технологический университет',subgroupLabel,...preferences,
      onSettings:()=>setDialog('settings')}),
    !current&&h('main',{className:'uni-welcome'},h('span',{className:'eyebrow'},'МГТУ'),h('h1',null,'Ваше расписание'),h('p',null,'Все пары, аудитории и преподаватели — в одном месте.')),
    current&&(offline||current.error)&&h('div',{className:'data-notice',role:'status'},offline?'Показана сохранённая версия расписания. Обновление сейчас недоступно.':'Последнее обновление не удалось. Показана последняя успешная версия.'),
    dialog==='groups'&&h(Dialog,{title:'Выберите группу',onClose:current||selectionOrigin?()=>setDialog(selectionOrigin):undefined},
      h('label',{className:'uni-field'},'Поиск группы',h('input',{type:'search',placeholder:'Например, СТ-11',value:query,onChange:e=>setQuery(e.target.value)})),
      h('label',{className:'uni-field'},'Факультет или подразделение',h('select',{'aria-label':'Факультет или подразделение',value:faculty,onChange:e=>setFaculty(e.target.value)},h('option',{value:'all'},'Все подразделения'),faculties.map(f=>h('option',{key:f,value:f},f)))),
      h('div',{role:'status',className:'uni-error'},catalogueError||error),
      catalogueError&&h('button',{className:'uni-primary',onClick:loadCatalogue},'Повторить'),
      !catalogue&&!catalogueError&&h('p',{role:'status'},'Загружаем список групп…'),
      catalogue&&h('p',{className:'uni-hint'},`Подключено ${groups.filter(g=>g.available).length} расписаний. Новые группы добавляются ежедневно.`),
      catalogue&&h('div',{className:'group-results'},matching.length?matching.map(g=>h('div',{key:g.id,className:'group-entry'},h('button',{className:'group-result',disabled:!g.available||loading!==null,onClick:()=>choose(g)},h('strong',null,g.name),h('span',null,g.available?loading===g.id?'Открываем расписание…':g.faculties.join(' · '):g.connectionState==='empty'?'В источнике нет занятий на этот семестр':g.connectionState==='unsupported'?'Расписание в другом формате':'Расписание пока не подключено')),!g.available&&g.checkedAt&&h('a',{className:'group-source',href:g.source,target:'_blank',rel:'noopener noreferrer'},'Открыть на сайте вуза'))):h('p',null,'Группа не найдена. Попробуйте другое название.'))),
    dialog==='settings'&&current&&h(Screen,{title:'Настройки',onBack:close},
      h('h2',{className:'settings-section-title'},'Расписание'),
      h('button',{type:'button',className:'setting-row',onClick:openSavedGroups},h(Icon,{name:'groups'}),h('span',{className:'setting-copy'},h('strong',null,'Мои расписания'),h('small',null,`Сейчас: ${current.name}`)),h('span',{className:'setting-count'},savedGroups.length),h(Icon,{name:'chevron'})),
      subgroups.length>0&&h('label',{className:'setting-row subgroup-setting'},h(Icon,{name:'groups'}),h('span',{className:'setting-copy'},h('strong',null,'Подгруппа'),h('small',null,'Общие занятия видны всегда')),h('select',{'aria-label':'Подгруппа',value:subgroup,onChange:e=>changeSubgroup(e.target.value)},h('option',{value:'all'},'Все'),subgroups.map(n=>h('option',{key:n,value:String(n)},`Подгруппа ${n}`)))),
      h('h2',{className:'settings-section-title'},'Отображение'),
      h(SwitchRow,{name:'compact',label:'Компактный вид',hint:'Карточки занимают меньше места',checked:preferences.compactView,onChange:value=>changePreference('compactView',value)}),
      h(SwitchRow,{name:'empty',label:'Пустые пары',hint:'Свободные пары до начала и между занятиями',checked:preferences.showEmptySlots,onChange:value=>changePreference('showEmptySlots',value)}),
      h(SwitchRow,{name:'note',label:'Индикатор заметок',hint:'Значок на предметах с комментарием',checked:preferences.showNoteIndicator,onChange:value=>changePreference('showNoteIndicator',value)}),
      h('h2',{className:'settings-section-title'},'Обновление расписания'),
      h('div',{className:'update-panel'},h(Icon,{name:'update'}),h('div',null,h('strong',null,current.error?'Последнее обновление не удалось':'Расписание проверено'),h('p',null,current.error?`Сохранённая версия: ${stamp(data.updatedAt)}`:`Последняя проверка: ${stamp(current.checkedAt||data.updatedAt)}`),h('a',{href:current.source,target:'_blank',rel:'noopener noreferrer',className:'source-link'},'Открыть источник'))),
      h('p',{className:'settings-footnote'},offlineReady?'Сайт готов к работе без интернета. Открытые расписания сохраняются на устройстве.':'Для работы без интернета сначала откройте нужные расписания при наличии сети.'),
      h('p',{className:'settings-footnote'},'Настройки и заметки сохраняются на этом устройстве.')),
    dialog==='saved-groups'&&h(Screen,{title:'Мои расписания',onBack:()=>setDialog(current?null:'groups')},
      h('button',{className:'uni-primary add-schedule',type:'button',onClick:()=>openSearch('saved-groups')},h(Icon,{name:'plus'}),'Добавить расписание'),
      h('p',{className:'uni-hint'},'Выбери расписание, чтобы открыть его. При следующем входе откроется последнее выбранное.'),
      error&&h('p',{className:'uni-error',role:'status'},error),
      !savedGroups.length&&h('p',{className:'saved-empty'},'Здесь появятся выбранные группы. Нажми «Добавить расписание» и найди свою группу.'),
      h('div',{className:'saved-list'},savedGroups.map(g=>h('article',{key:g.id,className:`saved-card ${g.id===current?.id?'active':''}`},
        h('button',{type:'button',className:'saved-open',disabled:loading!==null||!g.available,onClick:()=>choose(g),'aria-label':`Открыть ${g.name}`,'aria-current':g.id===current?.id?'true':undefined},h('strong',null,g.name),h('span',null,loading===g.id?'Открываем расписание…':g.id===current?.id?'Сейчас открыто':g.available?g.faculties.join(' · '):'Расписание пока не подключено'),g.id===current?.id&&h(Icon,{name:'check'})),
        h('button',{type:'button',className:'saved-delete',disabled:loading!==null,onClick:()=>removeGroup(g.id),'aria-label':`Удалить ${g.name} из сохранённых`},h(Icon,{name:'trash'})))))));
}
if (typeof document!=='undefined'&&document.getElementById('university-root')) {
  getDOM().hydrateRoot(document.getElementById('university-root'),h(App));
}
