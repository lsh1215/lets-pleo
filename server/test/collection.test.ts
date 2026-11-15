import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/main.ts';

test('live counts survive retries, arrive unchanged, claim once, and share the daily cap', async () => {
 let now=Date.parse('2026-11-15T15:00:00+09:00');const {app,db}=createApp(':memory:',()=>now);
 try {
  const guest=(await app.inject({method:'POST',url:'/v1/guest'})).json();const mobile={authorization:`Bearer ${guest.token}`};
  const code=(await app.inject({method:'POST',url:'/v1/pair-code',headers:mobile})).json().code;
  const car={authorization:`Bearer ${(await app.inject({method:'POST',url:'/v1/pair',payload:{code}})).json().token}`};
  const id=randomUUID(),startedAt=now;
  const sample=(seconds:number)=>({id,startedAt,endedAt:startedAt+(seconds+1)*1000,movingSeconds:seconds});
  const checkpoint=async(seconds:number)=>{
   now=Math.max(now,sample(seconds).endedAt);
   const r=await app.inject({method:'POST',url:'/v1/collections',headers:car,payload:sample(seconds)});
   assert.equal(r.statusCode,200,r.body);return r.json().materials;
  };
  assert.deepEqual(await checkpoint(14),{wood:0,stone:0,fabric:0,seed:0});
  assert.deepEqual(await checkpoint(15),{wood:2,stone:1,fabric:0,seed:0});
  assert.deepEqual(await checkpoint(30),{wood:4,stone:2,fabric:1,seed:1});
  const before=(await app.inject({method:'GET',url:'/v1/state',headers:mobile})).json();assert.equal(before.grants.length,0);
  assert.equal((await app.inject({method:'POST',url:`/v1/grants/${id}/claim`,headers:mobile})).statusCode,404);
  assert.deepEqual(await checkpoint(15),{wood:4,stone:2,fabric:1,seed:1});
  const final=await checkpoint(60);assert.deepEqual(final,{wood:8,stone:4,fabric:2,seed:2});
  now=startedAt+95_000;const trip={...sample(60),endedAt:now,collection:true};
  assert.equal((await app.inject({method:'POST',url:'/v1/trips',headers:car,payload:trip})).statusCode,201);
  const receipt=(await app.inject({method:'GET',url:`/v1/trips/${id}/receipt`,headers:car})).json();assert.deepEqual(receipt.materials,final);
  assert.deepEqual((await app.inject({method:'GET',url:'/v1/state',headers:mobile})).json().grants[0].materials,final);
  const claimed=(await app.inject({method:'POST',url:`/v1/grants/${id}/claim`,headers:mobile})).json();
  for(const key of Object.keys(final))assert.equal(claimed.inventory[key]-before.inventory[key],final[key]);
  assert.deepEqual((await app.inject({method:'POST',url:`/v1/grants/${id}/claim`,headers:mobile})).json().inventory,claimed.inventory);
  await app.inject({method:'POST',url:'/v1/trips',headers:car,payload:trip});
  assert.deepEqual((await app.inject({method:'GET',url:`/v1/trips/${id}/receipt`,headers:car})).json(),receipt);
  now+=200_000;const next={id:randomUUID(),startedAt:now-91_000,endedAt:now,movingSeconds:90,collection:true};
  assert.equal((await app.inject({method:'POST',url:'/v1/trips',headers:car,payload:next})).statusCode,201);
  assert.deepEqual((await app.inject({method:'GET',url:`/v1/trips/${next.id}/receipt`,headers:car})).json().materials,{wood:4,stone:5,fabric:3,seed:1});
 }finally{await app.close();db.close();}
});
test('live checkpoints reject overlaps, ownership changes and impossible movement',async()=>{
 const now=Date.parse('2026-11-15T16:00:00+09:00');const {app,db}=createApp(':memory:',()=>now);
 try{
  const cars=[];
  for(let i=0;i<2;i++){
   const guest=(await app.inject({method:'POST',url:'/v1/guest'})).json();const headers={authorization:`Bearer ${guest.token}`};
   const code=(await app.inject({method:'POST',url:'/v1/pair-code',headers})).json().code;
   cars.push({authorization:`Bearer ${(await app.inject({method:'POST',url:'/v1/pair',payload:{code}})).json().token}`});
  }
  const b={id:randomUUID(),startedAt:now-31_000,endedAt:now,movingSeconds:30};
  const post=(payload:unknown,headers=cars[0])=>app.inject({method:'POST',url:'/v1/collections',payload,headers});
  assert.equal((await post(b)).statusCode,200);assert.equal((await post(b,cars[1])).statusCode,409);
  assert.equal((await post({...b,id:randomUUID()})).statusCode,409);assert.equal((await post({...b,movingSeconds:32})).statusCode,400);
  assert.equal((await post({...b,wood:999})).statusCode,400);assert.equal((await post({...b,startedAt:b.startedAt-1})).statusCode,409);
  assert.equal((await post({...b,endedAt:now+120_000})).statusCode,400);
 }finally{await app.close();db.close();}
});
