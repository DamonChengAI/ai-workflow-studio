import { initialSample, initialSettings } from "./mock-data";
import { resetMockProvider } from "./mock-provider";
import type { AppSettings, IdeaCover, MediaTask, Scene, Segment, SegmentAudioTask, SegmentMedia } from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface MockState {
  settings: AppSettings;
  ideas: typeof initialSample.ideas;
  scenes: Scene[];
  segments: Segment[];
  mediaCards: SegmentMedia[];
  mediaTasks: MediaTask[];
  audioTasks: SegmentAudioTask[];
  covers: IdeaCover[];
}

let state: MockState = createInitialState();

function createInitialState(): MockState {
  return {
    settings: clone(initialSettings),
    ideas: clone(initialSample.ideas),
    scenes: clone(initialSample.scenes),
    segments: clone(initialSample.segments),
    mediaCards: clone(initialSample.media_cards),
    mediaTasks: [],
    audioTasks: [],
    covers: clone(initialSample.covers)
  };
}

export function resetStore() {
  resetMockProvider();
  state = createInitialState();
}

export function getSettings() {
  return clone(state.settings);
}

export function updateSettings(patch: Partial<AppSettings>) {
  state.settings = { ...state.settings, ...patch };
  return getSettings();
}

export function listIdeas() {
  return clone(state.ideas);
}

export function listScenes(idea_id?: string | null) {
  const items = idea_id ? state.scenes.filter((scene) => scene.idea_id === idea_id) : state.scenes;
  return clone(items.sort((a, b) => a.sort_order - b.sort_order));
}

export function listSegments(scene_id?: string | null) {
  const items = scene_id ? state.segments.filter((segment) => segment.scene_id === scene_id) : state.segments;
  return clone(items.sort((a, b) => a.tab_order - b.tab_order));
}

export function getSegment(segment_id: string) {
  const segment = state.segments.find((item) => item.segment_id === segment_id);
  return segment ? clone(segment) : null;
}

export function updateSegment(segment_id: string, patch: Partial<Segment>) {
  const index = state.segments.findIndex((segment) => segment.segment_id === segment_id);
  if (index === -1) throw new Error(`Segment not found: ${segment_id}`);
  state.segments[index] = { ...state.segments[index], ...patch, updated_at: new Date().toISOString() };
  return clone(state.segments[index]);
}

export function listMediaCards(segment_id?: string | null) {
  const items = segment_id ? state.mediaCards.filter((media) => media.segment_id === segment_id) : state.mediaCards;
  return clone(items.sort((a, b) => a.slot_order - b.slot_order));
}

export function getMediaCard(media_id: string) {
  const media = state.mediaCards.find((item) => item.media_id === media_id);
  return media ? clone(media) : null;
}

export function updateMediaCard(media_id: string, patch: Partial<SegmentMedia>) {
  const index = state.mediaCards.findIndex((media) => media.media_id === media_id);
  if (index === -1) throw new Error(`Media card not found: ${media_id}`);
  state.mediaCards[index] = { ...state.mediaCards[index], ...patch, updated_at: new Date().toISOString() };
  return clone(state.mediaCards[index]);
}

export function listTasks(media_id?: string | null) {
  const items = media_id ? state.mediaTasks.filter((task) => task.media_id === media_id) : state.mediaTasks;
  return clone(items.sort((a, b) => a.task_index - b.task_index));
}

export function addTask(task: MediaTask) {
  state.mediaTasks.push(clone(task));
  return clone(task);
}

export function updateTask(media_task_id: string, patch: Partial<MediaTask>) {
  const index = state.mediaTasks.findIndex((task) => task.media_task_id === media_task_id);
  if (index === -1) throw new Error(`Media task not found: ${media_task_id}`);
  state.mediaTasks[index] = { ...state.mediaTasks[index], ...patch, updated_at: new Date().toISOString() };
  return clone(state.mediaTasks[index]);
}

export function listAudioTasks(segment_id?: string | null) {
  const items = segment_id ? state.audioTasks.filter((task) => task.segment_id === segment_id) : state.audioTasks;
  return clone(items.sort((a, b) => a.created_at.localeCompare(b.created_at)));
}

export function addAudioTask(task: SegmentAudioTask) {
  state.audioTasks.push(clone(task));
  return clone(task);
}

export function updateAudioTask(audio_task_id: string, patch: Partial<SegmentAudioTask>) {
  const index = state.audioTasks.findIndex((task) => task.audio_task_id === audio_task_id);
  if (index === -1) throw new Error(`Audio task not found: ${audio_task_id}`);
  state.audioTasks[index] = { ...state.audioTasks[index], ...patch, updated_at: new Date().toISOString() };
  return clone(state.audioTasks[index]);
}

export function listCovers(idea_id: string) {
  return clone(state.covers.filter((cover) => cover.idea_id === idea_id).sort((a, b) => a.sort_order - b.sort_order));
}

export function activateTitle(cover_id: string) {
  const cover = state.covers.find((item) => item.cover_id === cover_id);
  if (!cover) throw new Error(`Cover not found: ${cover_id}`);
  for (const item of state.covers) {
    if (item.idea_id === cover.idea_id) item.is_active_title = item.cover_id === cover_id ? 1 : 0;
  }
  return clone(cover);
}

export function activateCoverImage(cover_id: string) {
  const cover = state.covers.find((item) => item.cover_id === cover_id);
  if (!cover) throw new Error(`Cover not found: ${cover_id}`);
  for (const item of state.covers) {
    if (item.idea_id === cover.idea_id) item.is_active_cover = item.cover_id === cover_id ? 1 : 0;
  }
  return clone(cover);
}

export function generateCoverImage(cover_id: string) {
  const index = state.covers.findIndex((cover) => cover.cover_id === cover_id);
  if (index === -1) throw new Error(`Cover not found: ${cover_id}`);
  state.covers[index] = {
    ...state.covers[index],
    generation_status: "completed",
    cover_image_url: `/mock-assets/${cover_id}.png`,
    last_error: null,
    updated_at: new Date().toISOString()
  };
  return clone(state.covers[index]);
}
