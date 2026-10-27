import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, AGENTS } from "../../src/agents/agent-registry.js";

test("routes MCQ requests to retrieval, content and personalization",()=>{
  const r=classifyIntent("Generate 10 intermediate MCQs on DBMS normalization");
  assert.equal(r.intent,"quiz");
  assert.deepEqual(r.agents,["retrieval","content","personalization"]);
});

test("routes answer evaluation to evaluator",()=>{
  const r=classifyIntent("Check my answer and improve it");
  assert.equal(r.intent,"evaluation");
  assert.ok(r.agents.includes("evaluator"));
});

test("routes planning requests to planner",()=>{
  const r=classifyIntent("Create a 7 day revision schedule for DSA");
  assert.equal(r.intent,"planning");
  assert.equal(r.agents[0],"planner");
});

test("all routed agents exist in registry",()=>{
  for(const q of ["Explain recursion","Compare TCP vs UDP","Create notes on AI","Hello"]){
    for(const id of classifyIntent(q).agents) assert.ok(AGENTS[id]);
  }
});
