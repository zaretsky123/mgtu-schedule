import {i as getReact} from './framework-DjPHiq1u.js';
const {createElement: h} = getReact();
const paths = {
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M9.5 3h5l.7 2.3 2 .9 2.1-.6 2.5 4.3-1.5 1.7v2.3l1.5 1.8-2.5 4.3-2.2-.6-1.9 1-.7 2.2h-5L8.8 20l-2-1-2 .6-2.5-4.3L3.8 14v-2.4L2.3 10l2.5-4.3 2.1.6 2-.9L9.5 3Z'],
  groups: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M16 3a4 4 0 0 1 0 8', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8'],
  compact: ['M4 4h16v4H4z', 'M4 12h16', 'M4 17h16', 'M4 22h16'],
  empty: ['M4 3h16v6H4z', 'M4 15h16v6H4z', 'M4 12h3m4 0h2m4 0h3'],
  note: ['M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z', 'M8 9h8m-8 4h5'],
  arrow: ['M19 12H5', 'm12 19-7-7 7-7'],
  chevron: ['m9 18 6-6-6-6'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M3 6h18', 'M9 6V4h6v2', 'M5 6l1 14h12l1-14', 'M10 10v6m4-6v6'],
  check: ['m5 12 4 4L19 6'],
  star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z'],
  update: ['M3 11a9 9 0 1 1 2.7 6.4', 'M3 4v7h7'],
};
export function Icon({name, ...props}) {
  return h('svg', {viewBox:'0 0 24 24', width:24, height:24, fill:'none', stroke:'currentColor', strokeWidth:1.7, strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true, ...props}, (paths[name] ?? paths.settings).map((d,i)=>h('path',{key:i,d})));
}
export function SettingsGear({onClick}) {
  return h('button', {type:'button', className:'settings-gear', onClick, 'aria-label':'Настройки', title:'Настройки'}, h(Icon,{name:'settings'}));
}
export function noteExists(groupId, lesson) {
  try { return Boolean(localStorage.getItem(`university-note:${groupId}:${lesson.title}::${lesson.teacher ?? ''}`)?.trim()); } catch { return false; }
}
export function NoteIndicator() {
  return h('span', {className:'note-indicator', role:'img', 'aria-label':'Есть заметка', title:'Есть заметка'}, h(Icon,{name:'note',width:16,height:16}));
}
export function FreeSlots({lessons,index}) {
  const previous = index ? lessons[index-1].pair : 0;
  const next = lessons[index].pair;
  const numbers = Array.from({length:Math.max(0,next-previous-1)},(_,i)=>previous+i+1);
  return numbers.map(pair=>h('div',{key:pair,className:'free-slot'},h('span',null,`${pair}-я пара`),h('span',null,'Свободно')));
}
