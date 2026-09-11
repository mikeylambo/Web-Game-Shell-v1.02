import test from "node:test";
import assert from "node:assert/strict";
import {DeterministicRngRegistry,stableHashString} from "../dist/index.js";

test("deterministic RNG streams reproduce independently",()=>{
  const names=["layout","ai","offers"];
  const a=new DeterministicRngRegistry(names);const b=new DeterministicRngRegistry(names);
  a.init("SEED42");b.init("SEED42");
  const layoutA=[a.stream("layout").next(),a.stream("layout").next()];
  for(let i=0;i<20;i++)a.stream("ai").next();
  const offersA=a.stream("offers").next();
  const layoutB=[b.stream("layout").next(),b.stream("layout").next()];
  const offersB=b.stream("offers").next();
  assert.deepEqual(layoutA,layoutB);assert.equal(offersA,offersB);
});

test("string hashing is stable",()=>{
  assert.equal(stableHashString("blinkfall"),stableHashString("blinkfall"));
  assert.notEqual(stableHashString("blinkfall"),stableHashString("descent"));
});
