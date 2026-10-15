import assert from "node:assert/strict";
import test from "node:test";
import { PairGenerationSession } from "./pair-session.ts";

const references = Array.from({ length: 30 }, (_, i) => ({ record_id: `in-${i}`, out_record_id: `out-${i}`, in_photo: "private-preview" }));
test("30套并发各自准备对应背景，人物请求不携带其他套背景或预览原图", async () => {
  const calls: Record<string, unknown>[] = [];
  let active = 0, maxActive = 0;
  const session = new PairGenerationSession({ references, count: 30 }, async (raw) => {
    const p = raw as Record<string, unknown>; calls.push(p);
    assert.equal(p.background_in_record_id, `in-${p.variant}`);
    assert.equal(p.background_out_record_id, `out-${p.variant}`);
    assert.equal("references" in p, false);
    assert.equal("in_photo" in p, false);
    if (p.prepare_scenes) {
      active++; maxActive = Math.max(maxActive,active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5)); active--;
      return { in_image: `bg-in-${p.variant}`, out_image: `bg-out-${p.variant}` };
    }
    assert.equal(p.in_scene_image, `bg-in-${p.variant}`);
    assert.equal(p.out_scene_image, `bg-out-${p.variant}`);
    return { in_image: "person-in", out_image: "person-out", entry_layer: "layer" };
  }, () => false);
  await Promise.all(Array.from({length:30},(_,i)=>session.generate(i)));
  assert.equal(maxActive,30);
  assert.equal(calls.filter(p=>p.prepare_scenes).length,30);
  assert.equal(calls.filter(p=>!p.prepare_scenes).length,30);
});
test("背景任务断网续查相同任务，出场重试复用本套背景和进场人物", async () => {
  const calls: { id: string; payload: Record<string,unknown> }[]=[];
  let sequence=0, disconnect=true, exitFails=true;
  const network = new Error("network");
  const session = new PairGenerationSession({ references }, async (raw,id) => {
    const p=raw as Record<string,unknown>; calls.push({id,payload:p});
    if(p.prepare_scenes) {
      if(disconnect) { disconnect=false; throw network; }
      return { in_image:"scene-a", out_image:"scene-b" };
    }
    if(exitFails) { exitFails=false; return { in_image:"entry",entry_layer:"layer",out_error:"exit failed" }; }
    assert.equal(p.entry_image,"entry"); assert.equal(p.entry_layer,"layer");
    assert.equal(p.in_scene_image,"scene-a"); assert.equal(p.out_scene_image,"scene-b");
    return { in_image:"entry",out_image:"exit",entry_layer:"layer" };
  }, (error)=>error===network, ()=>`job-${++sequence}`);
  await assert.rejects(session.generate(2));
  assert.equal(session.hasPending(2),true);
  const partial=await session.generate(2);
  assert.equal(calls[0].id,calls[1].id);
  assert.equal(session.hasScenes(2),true);
  assert.equal(session.hasPending(2),false);
  const result=await session.generate(2,partial.in_image,partial.entry_layer);
  assert.equal(result.out_image,"exit");
  assert.equal(calls.filter(c=>c.payload.prepare_scenes).length,2);
  assert.notEqual(calls[2].id,calls[3].id);
});
test("确定失败重新建任务，但不重新抽取参考", async () => {
  const ids: string[]=[]; let sequence=0;
  const session=new PairGenerationSession({references},async(raw,id)=> {
    ids.push(id); assert.equal((raw as Record<string,unknown>).background_in_record_id,"in-1");
    throw new Error("failed");
  },()=>false,()=>`job-${++sequence}`);
  await assert.rejects(session.generate(1)); await assert.rejects(session.generate(1));
  assert.equal(session.hasPending(1),false); assert.notEqual(ids[0],ids[1]);
});
