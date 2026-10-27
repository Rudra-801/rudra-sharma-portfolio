import test from "node:test";
import assert from "node:assert/strict";
import app from "../../src/app.js";

test("health endpoint reports a valid runtime", async t=>{
  const server=app.listen(0,"127.0.0.1");
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.once("listening",resolve));
  const address=server.address();
  const response=await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.service,"nexzo-backend");
  assert.ok(body.requestId);
});

test("unknown API route returns JSON 404", async t=>{
  const server=app.listen(0,"127.0.0.1");
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.once("listening",resolve));
  const address=server.address();
  const response=await fetch(`http://127.0.0.1:${address.port}/api/does-not-exist`);
  assert.equal(response.status,404);
  const body=await response.json();
  assert.match(body.message,/Route not found/);
});
