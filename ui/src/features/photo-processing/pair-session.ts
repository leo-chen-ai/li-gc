import { studioPairReference, type AttendanceReference } from "./references.ts";
import type { PhotoPair } from "./generation";

type Settings = { references: AttendanceReference[]; [key: string]: unknown };
type RunJob = (payload: object, requestId: string) => Promise<PhotoPair>;

// 一次抽样对应一个会话；每套独立保留背景与任务ID，出场重试不重新抽图/准备背景。
export class PairGenerationSession {
  private readonly scenes = new Map<number, PhotoPair>();
  private readonly jobs = new Map<string, string>();
  private readonly settings: Settings;
  private readonly runJob: RunJob;
  private readonly resumable: (error: unknown) => boolean;
  private readonly createId: () => string;
  constructor(settings: Settings, runJob: RunJob, resumable: (error: unknown) => boolean, createId: () => string = () => crypto.randomUUID()) {
    this.settings = settings;
    this.runJob = runJob;
    this.resumable = resumable;
    this.createId = createId;
  }
  hasPending(index: number) {
    return this.jobs.has(`scenes:${index}`) || this.jobs.has(`person:${index}`);
  }
  hasScenes(index: number) { return this.scenes.has(index); }
  private async run(key: string, payload: object) {
    const id = this.jobs.get(key) ?? this.createId();
    this.jobs.set(key, id);
    try {
      const result = await this.runJob(payload, id);
      this.jobs.delete(key);
      return result;
    } catch (error) {
      if (!this.resumable(error)) this.jobs.delete(key);
      throw error;
    }
  }
  async generate(index: number, entryImage?: string, entryLayer?: string, onSceneReady?: () => void) {
    const { references, ...settings } = this.settings;
    const payload = { ...settings, ...studioPairReference(references, index), variant: index };
    let scenes = this.scenes.get(index);
    if (!scenes) {
      scenes = await this.run(`scenes:${index}`, { ...payload, prepare_scenes: true });
      if (!scenes.in_image || !scenes.out_image) throw new Error(scenes.out_error || "本套进出场背景准备失败");
      this.scenes.set(index, scenes);
    }
    onSceneReady?.();
    return this.run(`person:${index}`, {
      ...payload,
      in_scene_image: scenes.in_image,
      out_scene_image: scenes.out_image,
      entry_image: entryImage,
      entry_layer: entryLayer,
    });
  }
}
