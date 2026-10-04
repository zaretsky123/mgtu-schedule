import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {lessonOccursOn} from '../assets/lesson-on-date.js';
import {fetchData,validGroup,validCatalogue} from '../assets/data-cache.js';

test('session classes occur only on their stated date; regular classes retain week parity',()=>{
  const lesson={weekday:1,parity:'all',dates:['2026-11-16']};
  assert.equal(lessonOccursOn(lesson,new Date(2026,10,16),'even'),true);
  assert.equal(lessonOccursOn(lesson,new Date(2026,10,23),'odd'),false);
  assert.equal(lessonOccursOn({weekday:1,parity:'odd'},new Date(2026,10,16),'odd'),true);
  assert.equal(lessonOccursOn({weekday:1,parity:'odd'},new Date(2026,10,16),'even'),false);
});

test('client rejects an empty, wrong-group or damaged payload before replacing saved data',async()=>{
  const original=globalThis.fetch;
  try{
    for(const payload of [{groupId:'11',lessons:[]},{groupId:'12',lessons:[{}]}]){
      globalThis.fetch=async()=>Response.json(payload);
      await assert.rejects(fetchData('https://example.org/data',p=>validGroup(p,'11')));
    }
    globalThis.fetch=async()=>new Response('broken HTML');
    await assert.rejects(fetchData('https://example.org/data',validCatalogue));
    globalThis.fetch=async()=>Response.json({groupId:'11',lessons:[{title:'Физика'}]},{headers:{'X-MGTU-Cache':'offline'}});
    assert.equal((await fetchData('https://example.org/data',p=>validGroup(p,'11'))).cached,true);
  }finally{globalThis.fetch=original;}
});

test('worker preserves good group data on offline, HTTP and malformed-response failures, with a subpath-safe offline shell',async()=>{
  const listeners={};
  const stores=new Map();
  const key=request=>typeof request==='string'?request:request.url;
  const caches={
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const data=stores.get(name);
      return {
        async match(request){return data.get(key(request))?.clone();},
        async put(request,response){data.set(key(request),response.clone());},
        async addAll(urls){for(const url of urls){assert(url.startsWith('https://example.org/mgtu/'));data.set(url,new Response('offline shell'));}},
      };
    },
    async keys(){return [...stores.keys()];},
    async delete(name){return stores.delete(name);},
  };
  let respond=async()=>Response.json({groupId:'42',lessons:[{title:'Физика'}]});
  const context=vm.createContext({
    URL,Response,Headers,AbortController,setTimeout,clearTimeout,caches,
    fetch:(...args)=>respond(...args),
    self:{location:{href:'https://example.org/mgtu/sw.js'},addEventListener(name,fn){listeners[name]=fn;},async skipWaiting(){},clients:{async claim(){}}},
  });
  vm.runInContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
  let install;
  listeners.install({waitUntil(promise){install=promise;}});await install;
  await caches.open('mgtu-offline-/other-site/-older-shell');
  await caches.open('mgtu-offline-/mgtu/-older-shell');
  let activation;
  listeners.activate({waitUntil(promise){activation=promise;}});await activation;
  assert(stores.has('mgtu-offline-/other-site/-older-shell'));
  assert(!stores.has('mgtu-offline-/mgtu/-older-shell'));
  async function request(path,mode='cors'){
    let result;
    listeners.fetch({request:{url:'https://example.org/mgtu/'+path,method:'GET',mode},respondWith(promise){result=promise;}});
    return result;
  }
  assert.equal((await request('university-data/groups/42.json')).status,200);
  const failures=[
    ()=>{throw Error('offline');},
    ()=>new Response('server error',{status:503}),
    ()=>new Response('<html>maintenance</html>'),
    ()=>Response.json({groupId:'99',lessons:[{title:'Wrong group'}]}),
    ()=>Response.json({groupId:'42',lessons:[]}),
  ];
  for(const failure of failures){
    respond=async()=>failure();
    const result=await request('university-data/groups/42.json');
    assert.equal(result.headers.get('X-MGTU-Cache'),'offline');
    assert.equal((await result.json()).lessons[0].title,'Физика');
  }
  respond=async()=>{throw Error('offline');};
  assert.equal((await request('university-data/groups/43.json')).status,503);
  assert.equal(await (await request('', 'navigate')).text(),'offline shell');
  assert.equal(await (await request('favicon.svg')).text(),'offline shell');
});
