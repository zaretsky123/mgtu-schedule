import {i as getReact} from './framework-DjPHiq1u.js';
const {createElement: h} = getReact();
const paths = {
  settings: ['M15.3 12a3.3 3.3 0 1 0-6.6 0 3.3 3.3 0 1 0 6.6 0', 'M9.746 4.798Q10.161 4.626 10.240 4.183L10.530 2.540Q10.608 2.097 11.058 2.097L12.942 2.097Q13.392 2.097 13.470 2.540L13.760 4.183Q13.839 4.626 14.254 4.798L15.499 5.313Q15.914 5.486 16.283 5.228L17.649 4.272Q18.018 4.014 18.336 4.332L19.668 5.664Q19.986 5.982 19.728 6.351L18.772 7.717Q18.514 8.086 18.687 8.501L19.202 9.746Q19.374 10.161 19.817 10.240L21.460 10.530Q21.903 10.608 21.903 11.058L21.903 12.942Q21.903 13.392 21.460 13.470L19.817 13.760Q19.374 13.839 19.202 14.254L18.687 15.499Q18.514 15.914 18.772 16.283L19.728 17.649Q19.986 18.018 19.668 18.336L18.336 19.668Q18.018 19.986 17.649 19.728L16.283 18.772Q15.914 18.514 15.499 18.687L14.254 19.202Q13.839 19.374 13.760 19.817L13.470 21.460Q13.392 21.903 12.942 21.903L11.058 21.903Q10.608 21.903 10.530 21.460L10.240 19.817Q10.161 19.374 9.746 19.202L8.501 18.687Q8.086 18.514 7.717 18.772L6.351 19.728Q5.982 19.986 5.664 19.668L4.332 18.336Q4.014 18.018 4.272 17.649L5.228 16.283Q5.486 15.914 5.313 15.499L4.798 14.254Q4.626 13.839 4.183 13.760L2.540 13.470Q2.097 13.392 2.097 12.942L2.097 11.058Q2.097 10.608 2.540 10.530L4.183 10.240Q4.626 10.161 4.798 9.746L5.313 8.501Q5.486 8.086 5.228 7.717L4.272 6.351Q4.014 5.982 4.332 5.664L5.664 4.332Q5.982 4.014 6.351 4.272L7.717 5.228Q8.086 5.486 8.501 5.313Z'],
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
