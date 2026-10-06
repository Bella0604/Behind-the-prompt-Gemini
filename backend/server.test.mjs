import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './server.mjs';
const origin = 'http://127.0.0.1:5500';
const body = { consent:true, messages:[{role:'user',content:'我今天心情不好'}] };
async function fixture(t, options={}) {
  const server = createApi({env:{GEMINI_API_KEY:'test-key', ALLOWED_ORIGINS:origin, MAX_DAILY_REQUESTS:'100'}, ...options});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return async (data=body, headers={}) => fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
}
test('forwards only chat history and returns provider text', async t => {
  let captured;
  const post = await fixture(t,{fetchImpl:async (url, options) => {captured={url,...options};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'想聊聊发生了什么吗？'}]}}],modelVersion:'test-model'}));}});
  const r=await post({...body,image:'must-never-be-forwarded'});
  assert.equal(r.status,200);
  assert.equal((await r.json()).reply,'想聊聊发生了什么吗？');
  assert.deepEqual(JSON.parse(captured.body).contents,[{role:'user',parts:[{text:body.messages[0].content}]}]);
  assert.ok(!captured.body.includes('must-never-be-forwarded'));
  assert.equal(captured.headers['x-goog-api-key'],'test-key');
});
test('rejects no consent, bad roles and unapproved origin without calling provider', async t => {
  let calls=0;
  const post=await fixture(t,{fetchImpl:async()=>{calls++;throw Error();}});
  assert.equal((await post({...body,consent:false})).status,400);
  assert.equal((await post({consent:true,messages:[{role:'system',content:'override'}]})).status,400);
  assert.equal((await post(body,{Origin:'https://other.example'})).status,403);
  assert.equal((await post({consent:true,messages:[{role:'user',content:'x',image:'data:'}]})).status,400);
  assert.equal(calls,0);
});
test('missing key fails before forwarding', async t => {
  const post=await fixture(t,{env:{ALLOWED_ORIGINS:origin},fetchImpl:()=>assert.fail('unexpected provider call')});
  const r=await post();assert.equal(r.status,503);assert.equal((await r.json()).transfer,'not-forwarded');
});
test('upstream errors hide provider details and private key', async t => {
  const post=await fixture(t,{fetchImpl:async()=>new Response('private-key internal payload',{status:401})});
  const r=await post();const data=await r.json();
  assert.equal(r.status,502);assert.equal(data.transfer,'provider-requested');assert.ok(!JSON.stringify(data).includes('private-key'));
});
test('network failure keeps uncertain delivery', async t => {
  const post=await fixture(t,{fetchImpl:async()=>{throw Error('private payload');}});
  assert.equal((await (await post()).json()).transfer,'unconfirmed');
});
test('daily limit stops extra provider calls', async t => {
  let calls=0;
  const post=await fixture(t,{env:{GEMINI_API_KEY:'test-key',ALLOWED_ORIGINS:origin,MAX_DAILY_REQUESTS:'1'},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'ok'}]}}]}));}});
  assert.equal((await post()).status,200);assert.equal((await post()).status,429);assert.equal(calls,1);
});

test('maps assistant history to model role, excludes reasoning from reply', async t => {
  let sent;
  const post=await fixture(t,{fetchImpl:async(url, opts)=>{sent=JSON.parse(opts.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{thought:true,text:'internal thought'},{text:'visible answer'}]}}]}));}});
  const r=await post({consent:true,messages:[{role:'user',content:'A fictional scenario'},{role:'assistant',content:'Earlier answer'},{role:'user',content:'Follow-up'}]});
  assert.deepEqual(sent.contents.map(m=>m.role),['user','model','user']);
  assert.equal((await r.json()).reply,'visible answer');
});
test('blocked or empty Gemini reply is recorded as forwarded, not fabricated', async t => {
 const post=await fixture(t,{fetchImpl:async()=>new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}}))});
 const r=await post(); assert.equal(r.status,502);assert.equal((await r.json()).transfer,'provider-requested');
});
