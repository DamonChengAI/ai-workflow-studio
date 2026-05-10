"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiDataPayload, ApiListPayload, AppSettings, Idea, IdeaCover, MediaProvider, MediaTask, Scene, Segment, SegmentAudioTask, SegmentMedia } from "@/lib/types";

interface MediaDraft {
  prompt: string;
  generate_count: number;
  provider: MediaProvider;
  model: string;
  duration: number | null;
  aspect_ratio: string;
  resolution: string;
  audio: boolean;
}

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    throw new Error(payload.error?.message ?? `请求失败: ${response.status}`);
  }

  return (await response.json()) as T;
}

function mediaStatusClass(status: SegmentMedia["aggregate_status"]) {
  if (status === "completed") return "status ok";
  if (status === "failed") return "status err";
  if (status === "processing") return "status warn";
  return "status";
}

function taskStatusClass(status: MediaTask["task_status"]) {
  if (status === "completed") return "status ok";
  if (status === "failed" || status === "cancelled") return "status err";
  if (status === "processing" || status === "pending") return "status warn";
  return "status";
}

function defaultModelByProvider(provider: MediaProvider, mediaType: SegmentMedia["media_type"]) {
  return mediaType === "video" ? "mock-video-v1" : provider === "mock-image" ? "mock-image-v1" : "mock-provider-v1";
}

function defaultAspectRatio() {
  return "16:9";
}

function allowedProviderForMediaType(mediaType: SegmentMedia["media_type"]): MediaProvider {
  return mediaType === "video" ? "mock-video" : "mock-image";
}

function previewImageUrl(card: SegmentMedia) {
  if (card.preview_url?.endsWith(".mp4")) return `/mock-assets/${card.media_id}.png`;
  return card.preview_url ?? `/mock-assets/${card.media_id}.png`;
}

function normalizeNarrationLine(text: string | null | undefined) {
  return (text ?? "").replace(/\r?\n/g, " ").trim();
}

async function copyTextToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back to a temporary textarea below. This is useful in embedded browsers.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("clipboard not supported");
  }
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(file);
  });
}

export default function WorkspaceClient() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [overviewSegments, setOverviewSegments] = useState<Segment[]>([]);
  const [mediaCards, setMediaCards] = useState<SegmentMedia[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, MediaTask[]>>({});
  const [audioTasks, setAudioTasks] = useState<SegmentAudioTask[]>([]);
  const [mediaDrafts, setMediaDrafts] = useState<Record<string, MediaDraft>>({});
  const [covers, setCovers] = useState<IdeaCover[]>([]);

  const [selectedIdeaId, setSelectedIdeaId] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");

  const [narrationEn, setNarrationEn] = useState("");
  const [narrationCn, setNarrationCn] = useState("");
  const [outputDirInput, setOutputDirInput] = useState("./mock-outputs");
  const [autoPollEnabledInput, setAutoPollEnabledInput] = useState(false);
  const [autoPollIntervalInput, setAutoPollIntervalInput] = useState(5000);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const referenceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selectedIdea = useMemo(() => ideas.find((item) => item.idea_id === selectedIdeaId) ?? null, [ideas, selectedIdeaId]);
  const selectedScene = useMemo(() => scenes.find((item) => item.scene_id === selectedSceneId) ?? null, [scenes, selectedSceneId]);
  const selectedSegment = useMemo(() => segments.find((item) => item.segment_id === selectedSegmentId) ?? null, [segments, selectedSegmentId]);
  const latestAudioTask = useMemo(() => audioTasks.at(-1) ?? null, [audioTasks]);

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function syncMediaDrafts(cards: SegmentMedia[]) {
    setMediaDrafts((prev) => {
      const next: Record<string, MediaDraft> = {};
      for (const card of cards) {
        next[card.media_id] = prev[card.media_id] ?? {
          prompt: card.prompt,
          generate_count: card.generate_count,
          provider: card.provider,
          model: card.model,
          duration: card.duration,
          aspect_ratio: card.aspect_ratio ?? defaultAspectRatio(),
          resolution: card.resolution ?? "",
          audio: card.audio ?? true
        };
      }
      return next;
    });
  }

  async function loadSettings() {
    const payload = await requestJson<ApiDataPayload<AppSettings>>("/api/settings");
    setSettings(payload.data);
    setOutputDirInput(payload.data.output_base_dir);
    setAutoPollEnabledInput(payload.data.auto_poll_enabled);
    setAutoPollIntervalInput(payload.data.auto_poll_interval_ms);
  }

  async function loadIdeas() {
    const payload = await requestJson<ApiListPayload<Idea>>("/api/ideas");
    const items = payload.data.items;
    setIdeas(items);
    setSelectedIdeaId((prev) => (prev && items.some((item) => item.idea_id === prev) ? prev : items[0]?.idea_id ?? ""));
  }

  async function loadScenes(ideaId: string) {
    const payload = await requestJson<ApiListPayload<Scene>>(`/api/scenes?idea_id=${encodeURIComponent(ideaId)}`);
    const items = payload.data.items;
    setScenes(items);
    setSelectedSceneId((prev) => (prev && items.some((item) => item.scene_id === prev) ? prev : items[0]?.scene_id ?? ""));
  }

  async function loadCovers(ideaId: string) {
    const payload = await requestJson<ApiListPayload<IdeaCover>>(`/api/ideas/${ideaId}/covers`);
    setCovers(payload.data.items);
  }

  async function loadSegments(sceneId: string) {
    const payload = await requestJson<ApiListPayload<Segment>>(`/api/segments?scene_id=${encodeURIComponent(sceneId)}`);
    const items = payload.data.items;
    setSegments(items);
    setSelectedSegmentId((prev) => (prev && items.some((item) => item.segment_id === prev) ? prev : items[0]?.segment_id ?? ""));
  }

  async function loadMediaCards(segmentId: string) {
    const payload = await requestJson<ApiListPayload<SegmentMedia>>(`/api/segment-media?segment_id=${encodeURIComponent(segmentId)}`);
    const items = payload.data.items;
    setMediaCards(items);
    syncMediaDrafts(items);

    const entries = await Promise.all(
      items.map(async (item) => {
        const taskPayload = await requestJson<ApiListPayload<MediaTask>>(`/api/segment-media/${item.media_id}/tasks`);
        return [item.media_id, taskPayload.data.items] as const;
      })
    );
    setTasksMap(Object.fromEntries(entries));
  }

  async function loadAudioTasks(segmentId: string) {
    const payload = await requestJson<ApiListPayload<SegmentAudioTask>>(`/api/segments/${segmentId}/audio`);
    setAudioTasks(payload.data.items);
  }

  async function reloadCurrentLayer() {
    if (!selectedSegmentId) {
      setMediaCards([]);
      setTasksMap({});
      setAudioTasks([]);
      return;
    }
    await Promise.all([loadMediaCards(selectedSegmentId), loadAudioTasks(selectedSegmentId)]);
  }

  async function initialize() {
    setLoading(true);
    clearFeedback();
    try {
      await Promise.all([loadSettings(), loadIdeas()]);
      setMessage("示例工作台已加载，所有数据和 provider 均为 mock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "初始化失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!selectedIdeaId) {
      setScenes([]);
      setSegments([]);
      setMediaCards([]);
      setTasksMap({});
      setAudioTasks([]);
      setCovers([]);
      return;
    }
    loadScenes(selectedIdeaId).catch((err: unknown) => setError(err instanceof Error ? err.message : "加载 Scene 失败"));
    loadCovers(selectedIdeaId).catch((err: unknown) => setError(err instanceof Error ? err.message : "加载封面失败"));
  }, [selectedIdeaId]);

  useEffect(() => {
    if (!selectedSceneId) {
      setSegments([]);
      setOverviewSegments([]);
      setMediaCards([]);
      setTasksMap({});
      setAudioTasks([]);
      return;
    }
    loadSegments(selectedSceneId).catch((err: unknown) => setError(err instanceof Error ? err.message : "加载 Segment 失败"));
    requestJson<ApiListPayload<Segment>>(`/api/segments?scene_id=${encodeURIComponent(selectedSceneId)}`)
      .then((payload) => setOverviewSegments(payload.data.items))
      .catch(() => setOverviewSegments([]));
  }, [selectedSceneId]);

  useEffect(() => {
    if (!selectedSegmentId) {
      setMediaCards([]);
      setTasksMap({});
      setAudioTasks([]);
      return;
    }
    loadMediaCards(selectedSegmentId).catch((err: unknown) => setError(err instanceof Error ? err.message : "加载 Media Card 失败"));
    loadAudioTasks(selectedSegmentId).catch((err: unknown) => setError(err instanceof Error ? err.message : "加载音频任务失败"));
  }, [selectedSegmentId]);

  useEffect(() => {
    if (selectedSegment) {
      setNarrationEn(selectedSegment.narration ?? "");
      setNarrationCn(selectedSegment.narration_cn ?? "");
    } else {
      setNarrationEn("");
      setNarrationCn("");
    }
  }, [selectedSegment]);

  async function pollRunningAndRefresh() {
    clearFeedback();
    try {
      const payload = await requestJson<ApiDataPayload<{ updated_tasks: number }>>("/api/segment-media/poll-running", {
        method: "POST",
        body: JSON.stringify({ limit: 50 })
      });
      await reloadCurrentLayer();
      setMessage(`轮询完成，更新任务 ${payload.data.updated_tasks} 个`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "轮询失败");
    }
  }

  useEffect(() => {
    if (!settings?.auto_poll_enabled) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && selectedSegmentId) void pollRunningAndRefresh();
    }, settings.auto_poll_interval_ms);
    return () => window.clearInterval(timer);
  }, [settings?.auto_poll_enabled, settings?.auto_poll_interval_ms, selectedSegmentId]);

  async function handleSaveSettings() {
    clearFeedback();
    try {
      const payload = await requestJson<ApiDataPayload<AppSettings>>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          output_base_dir: outputDirInput,
          auto_poll_enabled: autoPollEnabledInput,
          auto_poll_interval_ms: autoPollIntervalInput
        })
      });
      setSettings(payload.data);
      setMessage("设置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存设置失败");
    }
  }

  async function handleResetDemo() {
    clearFeedback();
    setLoading(true);
    try {
      await requestJson<ApiDataPayload<{ reset: boolean }>>("/api/mock/reset", { method: "POST" });
      await initialize();
      setMessage("Demo 已重置");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setLoading(false);
    }
  }

  async function activateTitle(coverId: string) {
    clearFeedback();
    try {
      await requestJson(`/api/covers/${coverId}/activate-title`, { method: "POST" });
      if (selectedIdeaId) await loadCovers(selectedIdeaId);
      setMessage("标题已切换");
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换标题失败");
    }
  }

  async function activateCoverImage(coverId: string) {
    clearFeedback();
    try {
      await requestJson(`/api/covers/${coverId}/activate-cover`, { method: "POST" });
      if (selectedIdeaId) await loadCovers(selectedIdeaId);
      setMessage("封面已切换");
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换封面失败");
    }
  }

  async function generateCoverImage(coverId: string) {
    clearFeedback();
    try {
      await requestJson(`/api/covers/${coverId}/generate`, { method: "POST" });
      if (selectedIdeaId) await loadCovers(selectedIdeaId);
      setMessage("mock 封面已生成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成封面失败");
    }
  }

  function updateMediaDraft(mediaId: string, patch: Partial<MediaDraft>) {
    setMediaDrafts((prev) => ({
      ...prev,
      [mediaId]: {
        prompt: patch.prompt ?? prev[mediaId]?.prompt ?? "",
        generate_count: patch.generate_count ?? prev[mediaId]?.generate_count ?? 1,
        provider: patch.provider ?? prev[mediaId]?.provider ?? "mock-image",
        model: patch.model ?? prev[mediaId]?.model ?? "",
        duration: Object.prototype.hasOwnProperty.call(patch, "duration") ? patch.duration ?? null : prev[mediaId]?.duration ?? null,
        aspect_ratio: patch.aspect_ratio ?? prev[mediaId]?.aspect_ratio ?? "",
        resolution: patch.resolution ?? prev[mediaId]?.resolution ?? "",
        audio: patch.audio ?? prev[mediaId]?.audio ?? true
      }
    }));
  }

  async function handleSaveNarration() {
    clearFeedback();
    if (!selectedSegmentId) return;
    try {
      await requestJson<ApiDataPayload<Segment>>(`/api/segments/${selectedSegmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ narration: narrationEn, narration_cn: narrationCn })
      });
      setSegments((prev) =>
        prev.map((segment) => (segment.segment_id === selectedSegmentId ? { ...segment, narration: narrationEn, narration_cn: narrationCn } : segment))
      );
      setOverviewSegments((prev) =>
        prev.map((segment) => (segment.segment_id === selectedSegmentId ? { ...segment, narration: narrationEn, narration_cn: narrationCn } : segment))
      );
      setMessage("Segment 内容已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 Segment 失败");
    }
  }

  async function handleSaveMediaCard(card: SegmentMedia) {
    clearFeedback();
    const draft = mediaDrafts[card.media_id];
    if (!draft) return;
    try {
      await requestJson<ApiDataPayload<SegmentMedia>>(`/api/segment-media/${card.media_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          prompt: draft.prompt,
          generate_count: card.media_type === "image" ? draft.generate_count : 1,
          provider: allowedProviderForMediaType(card.media_type),
          model: draft.model || defaultModelByProvider(allowedProviderForMediaType(card.media_type), card.media_type),
          duration: card.media_type === "video" ? draft.duration : null,
          aspect_ratio: draft.aspect_ratio || defaultAspectRatio(),
          resolution: draft.resolution || (card.media_type === "video" ? "720p" : "1K"),
          audio: card.media_type === "video" ? draft.audio : null
        })
      });
      await reloadCurrentLayer();
      setMessage("Media Card 已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存卡片失败");
    }
  }

  async function handleSubmitMedia(card: SegmentMedia) {
    clearFeedback();
    try {
      const payload = await requestJson<ApiDataPayload<{ created: boolean }>>(`/api/segment-media/${card.media_id}/submit`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await reloadCurrentLayer();
      setMessage(payload.data.created ? "任务已提交" : "当前状态不重复提交");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交生成失败");
    }
  }

  async function handleRetryMedia(card: SegmentMedia) {
    clearFeedback();
    try {
      await requestJson(`/api/segment-media/${card.media_id}/retry`, { method: "POST" });
      await reloadCurrentLayer();
      setMessage("失败任务已重试");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试失败");
    }
  }

  async function handleSubmitAudio() {
    clearFeedback();
    if (!selectedSegmentId) return;
    const sourceText = (narrationCn || narrationEn).trim();
    if (!sourceText) {
      setError("当前 Segment 没有可生成音频的文本");
      return;
    }

    try {
      const payload = await requestJson<ApiDataPayload<{ task: SegmentAudioTask; created: boolean; message: string }>>(`/api/segments/${selectedSegmentId}/audio`, {
        method: "POST",
        body: JSON.stringify({ source_text: sourceText })
      });
      await loadAudioTasks(selectedSegmentId);
      setMessage(payload.data.created ? "音频任务已提交" : "当前音频状态不重复提交");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交音频任务失败");
    }
  }

  async function handleRetryAudio() {
    clearFeedback();
    if (!selectedSegmentId) return;
    const sourceText = (narrationCn || narrationEn).trim();

    try {
      const payload = await requestJson<ApiDataPayload<{ task: SegmentAudioTask | null; retried: boolean; message: string }>>(`/api/segments/${selectedSegmentId}/audio/retry`, {
        method: "POST",
        body: JSON.stringify({ source_text: sourceText })
      });
      await loadAudioTasks(selectedSegmentId);
      setMessage(payload.data.retried ? "音频任务已重试" : "当前音频任务无需重试");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试音频任务失败");
    }
  }

  async function handleReferenceImagesSelected(card: SegmentMedia, fileList: FileList | null) {
    clearFeedback();
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      setMessage("未选择图片文件");
      return;
    }

    const currentImages = card.reference_images_json;
    const availableSlots = Math.max(0, 3 - currentImages.length);
    if (availableSlots === 0) {
      setMessage("参考图最多 3 张");
      return;
    }

    try {
      const selectedImages = await Promise.all(files.slice(0, availableSlots).map(readImageFileAsDataUrl));
      const nextImages = [...currentImages, ...selectedImages].slice(0, 3);
      await requestJson<ApiDataPayload<SegmentMedia>>(`/api/segment-media/${card.media_id}`, {
        method: "PATCH",
        body: JSON.stringify({ reference_images_json: nextImages })
      });
      await reloadCurrentLayer();
      setMessage(`已添加参考图：${nextImages.length}/3`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传参考图失败");
    }
  }

  async function handleCopyAllContent() {
    clearFeedback();

    if (!selectedIdea || scenes.length === 0) {
      setMessage("无可复制内容");
      return;
    }

    try {
      const payload = await requestJson<ApiListPayload<Segment>>("/api/segments");
      const sceneIds = new Set(scenes.map((scene) => scene.scene_id));
      const allSegments = payload.data.items
        .filter((segment) => sceneIds.has(segment.scene_id))
        .map((segment) =>
          segment.segment_id === selectedSegmentId
            ? {
                ...segment,
                narration: narrationEn,
                narration_cn: narrationCn
              }
            : segment
        );

      const segmentsByScene = new Map<string, Segment[]>();
      for (const segment of allSegments) {
        const items = segmentsByScene.get(segment.scene_id) ?? [];
        items.push(segment);
        segmentsByScene.set(segment.scene_id, items);
      }

      const lines: string[] = [`# ${selectedIdea.name}`, "", selectedIdea.detail, ""];
      let segmentCount = 0;

      for (const scene of [...scenes].sort((a, b) => a.sort_order - b.sort_order)) {
        lines.push(`## ${scene.sort_order}. ${scene.title}`);
        lines.push(scene.summary);
        lines.push("");

        const sceneSegments = (segmentsByScene.get(scene.scene_id) ?? []).sort((a, b) => a.tab_order - b.tab_order);
        for (const segment of sceneSegments) {
          segmentCount += 1;
          lines.push(`### ${scene.sort_order}-${segment.tab_order} ${segment.title}`);
          lines.push(`Summary: ${segment.summary}`);
          lines.push(`CN: ${normalizeNarrationLine(segment.narration_cn)}`);
          lines.push(`EN: ${normalizeNarrationLine(segment.narration)}`);
          lines.push("");
        }
      }

      if (segmentCount === 0) {
        setMessage("无可复制内容");
        return;
      }

      await copyTextToClipboard(lines.join("\n").trim());
      setMessage(`已复制全部内容：${scenes.length} 个 Scene，${segmentCount} 个 Segment`);
    } catch {
      setError("复制失败，请检查浏览器权限");
    }
  }

  return (
    <main className="workspace" data-testid="workspace-root">
      <section className="panel workspace-header">
        <div className="toolbar">
          <h1>脱敏版 AI 生产工作台</h1>
          <span className="small">仅 mock / 示例数据 / 不接外部服务</span>
        </div>
        <div className="toolbar-group">
          <button onClick={() => void handleCopyAllContent()} disabled={!selectedIdea}>
            复制全部内容
          </button>
          <button onClick={() => void pollRunningAndRefresh()} disabled={!selectedSegmentId}>
            轮询任务
          </button>
          <button className="danger" onClick={() => void handleResetDemo()} disabled={loading}>
            重置 Demo
          </button>
        </div>
      </section>

      {message ? <p className="message ok">{message}</p> : null}
      {error ? <p className="message error">{error}</p> : null}

      <div className="top-row">
        <section className="panel">
          <h2 className="section-title">选题</h2>
          <div className="scene-list">
            {ideas.map((idea) => (
              <button key={idea.idea_id} className={`scene-card ${selectedIdeaId === idea.idea_id ? "active" : ""}`} onClick={() => setSelectedIdeaId(idea.idea_id)}>
                <div className="row">
                  <strong>{idea.name}</strong>
                  <span className="small">{idea.idea_id}</span>
                </div>
                <div className="meta">{idea.detail}</div>
                <div className="small">{idea.tags_json.join(" / ")}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 className="section-title">封面</h2>
          <div className="scene-list">
            {covers.map((cover) => (
              <article key={cover.cover_id} className={`scene-card ${cover.is_active_cover === 1 ? "active" : ""}`}>
                <div className="row">
                  <strong>{cover.cover_text}</strong>
                  <span className={cover.generation_status === "completed" ? "status ok" : "status"}>{cover.generation_status}</span>
                </div>
                <div className={`mock-cover-thumb ${cover.cover_image_url ? "active" : ""}`}>
                  {cover.cover_image_url ? <img src={cover.cover_image_url} alt={cover.cover_text} /> : "暂无图片"}
                </div>
                <div className="small">{cover.cover_prompt}</div>
                <div className="inline-actions">
                  {cover.cover_image_url ? <button onClick={() => void activateCoverImage(cover.cover_id)}>设为当前封面</button> : null}
                  <button onClick={() => void generateCoverImage(cover.cover_id)}>生成图片</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 className="section-title">标题</h2>
          <div className="scene-list">
            {covers.map((cover) => (
              <article key={cover.cover_id} className={`scene-card ${cover.is_active_title === 1 ? "active" : ""}`}>
                <div className="row">
                  <strong>{cover.title}</strong>
                  <span className="small">{cover.title_direction}</span>
                </div>
                {cover.is_active_title !== 1 ? <button onClick={() => void activateTitle(cover.cover_id)}>设为当前标题</button> : <span className="status ok">当前标题</span>}
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            场景
          </h2>
        </div>
        <div className="scenes-split">
          <div className="scenes-split-left">
            <div className="scene-list">
              {scenes.map((scene) => (
                <button key={scene.scene_id} className={`scene-card ${selectedSceneId === scene.scene_id ? "active" : ""}`} onClick={() => setSelectedSceneId(scene.scene_id)}>
                  <div className="row">
                    <strong>{scene.title}</strong>
                    <span className="small">#{scene.sort_order}</span>
                  </div>
                  <div className="meta">{scene.summary}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="scenes-split-right">
            <div className="narration-overview-content">
              {overviewSegments.map((segment) => (
                <div key={segment.segment_id} className="narration-overview-item">
                  <div className="narration-overview-item-title">
                    {segment.tab_order}. {segment.title}
                  </div>
                  <div className="narration-overview-item-text">{segment.narration_cn}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel media-panel">
        <div className="segment-tab-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            分段与媒体卡片
          </h2>
          <span className="small">{selectedScene?.title ?? "请选择 Scene"}</span>
        </div>

        <div className="segment-tabs">
          {segments.map((segment) => (
            <button key={segment.segment_id} className={`segment-tab ${selectedSegmentId === segment.segment_id ? "active" : ""}`} onClick={() => setSelectedSegmentId(segment.segment_id)}>
              {segment.tab_order}. {segment.title}
            </button>
          ))}
        </div>

        {selectedSegment ? (
          <>
            <div className="meta">{selectedSegment.summary}</div>
            <div className="narration-inline">
              <label className="narration-inline-field">
                <span className="narration-inline-label">EN</span>
                <input value={narrationEn} onChange={(event) => setNarrationEn(event.target.value)} />
              </label>
              <label className="narration-inline-field">
                <span className="narration-inline-label">CN</span>
                <input value={narrationCn} onChange={(event) => setNarrationCn(event.target.value)} />
              </label>
              <button className="primary" onClick={() => void handleSaveNarration()}>
                保存内容
              </button>
              <button
                onClick={() => void handleSubmitAudio()}
                disabled={latestAudioTask?.task_status === "processing" || latestAudioTask?.task_status === "pending" || latestAudioTask?.task_status === "completed"}
              >
                生成音频
              </button>
              {latestAudioTask?.task_status === "failed" ? (
                <button className="danger" onClick={() => void handleRetryAudio()}>
                  重试音频
                </button>
              ) : null}
            </div>
            <div className="audio-inline">
              <span className={latestAudioTask ? taskStatusClass(latestAudioTask.task_status) : "status"}>音频：{latestAudioTask?.task_status ?? "idle"}</span>
              {latestAudioTask?.provider_task_id ? <span className="small">{latestAudioTask.provider_task_id}</span> : null}
              {latestAudioTask?.result_url ? <audio controls src={latestAudioTask.result_url} /> : null}
              {latestAudioTask?.error_message ? <span className="small" style={{ color: "var(--danger)" }}>{latestAudioTask.error_message}</span> : null}
            </div>
          </>
        ) : null}

        <div className="selected-list">
          {mediaCards.map((card) => {
            const draft = mediaDrafts[card.media_id];
            const tasks = tasksMap[card.media_id] ?? [];
            const imageUrl = previewImageUrl(card);
            return (
              <article key={card.media_id} className="scene-card media-card">
                <div className="row">
                  <strong>
                    {card.media_type.toUpperCase()} #{card.slot_order}
                  </strong>
                  <span className={mediaStatusClass(card.aggregate_status)}>{card.aggregate_status}</span>
                </div>

                <div className="media-preview-row">
                  <div className={`image-preview-thumb ${imageUrl ? "active" : ""}`}>
                    {imageUrl ? <img src={imageUrl} alt={`${card.media_id} preview`} /> : "暂无预览"}
                  </div>
                  <div className="media-preview-info">
                    <div className="small">{card.preview_url ?? card.media_id}</div>
                    {tasks.length === 0 ? <div className="small">暂无任务</div> : null}
                    {tasks.map((task) => (
                      <div key={task.media_task_id} className="media-task-inline">
                        <strong className="small">Task #{task.task_index}</strong>
                        <span className={taskStatusClass(task.task_status)}>{task.task_status}</span>
                        <span className="small">{task.provider_task_id}</span>
                        {task.result_url ? <span className="small">{task.result_url}</span> : null}
                        {task.error_message ? <span className="small" style={{ color: "var(--danger)" }}>{task.error_message}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>

                {draft ? (
                  <>
                    <label>
                      Prompt
                      <textarea value={draft.prompt} onChange={(event) => updateMediaDraft(card.media_id, { prompt: event.target.value })} />
                    </label>

                    <div className={`media-config-line ${card.media_type === "video" ? "has-video" : ""}`}>
                      <label className="media-config-field">
                        generate_count
                        <input
                          type="number"
                          min={1}
                          max={card.media_type === "image" ? 4 : 1}
                          value={card.media_type === "image" ? draft.generate_count : 1}
                          disabled={card.media_type === "video"}
                          onChange={(event) => updateMediaDraft(card.media_id, { generate_count: Number(event.target.value) })}
                        />
                      </label>
                      <label className="media-config-field">
                        provider
                        <select
                          value={allowedProviderForMediaType(card.media_type)}
                          disabled
                          onChange={(event) => {
                            const provider = event.target.value as MediaProvider;
                            updateMediaDraft(card.media_id, { provider, model: defaultModelByProvider(provider, card.media_type) });
                          }}
                        >
                          <option value={allowedProviderForMediaType(card.media_type)}>{allowedProviderForMediaType(card.media_type)}</option>
                        </select>
                      </label>
                      <label className="media-config-field">
                        model
                        <input value={draft.model} onChange={(event) => updateMediaDraft(card.media_id, { model: event.target.value })} />
                      </label>
                      {card.media_type === "video" ? (
                        <label className="media-config-field">
                          duration
                          <input type="number" min={4} max={12} value={draft.duration ?? ""} onChange={(event) => updateMediaDraft(card.media_id, { duration: event.target.value ? Number(event.target.value) : null })} />
                        </label>
                      ) : null}
                      <label className="media-config-field">
                        aspect_ratio
                        <input value={draft.aspect_ratio} onChange={(event) => updateMediaDraft(card.media_id, { aspect_ratio: event.target.value })} />
                      </label>
                      <label className="media-config-field">
                        resolution
                        <input value={draft.resolution} onChange={(event) => updateMediaDraft(card.media_id, { resolution: event.target.value })} />
                      </label>
                      {card.media_type === "video" ? (
                        <label className="media-config-field media-config-checkbox">
                          audio
                          <input type="checkbox" checked={draft.audio} onChange={(event) => updateMediaDraft(card.media_id, { audio: event.target.checked })} />
                        </label>
                      ) : null}
                    </div>
                  </>
                ) : null}

                <div className="inline-actions media-actions">
                  <button onClick={() => void handleSaveMediaCard(card)}>保存卡片</button>
                  <button className="primary" onClick={() => void handleSubmitMedia(card)} disabled={card.aggregate_status === "processing" || card.aggregate_status === "completed" || card.aggregate_status === "failed"}>
                    提交生成
                  </button>
                  {card.aggregate_status === "failed" ? (
                    <button className="danger" onClick={() => void handleRetryMedia(card)}>
                      重试失败任务
                    </button>
                  ) : null}
                </div>

                <div className="reference-strip">
                  <div className="reference-strip-header">
                    <span className="meta">参考图：{card.reference_images_json.length}/3</span>
                    <button type="button" onClick={() => referenceInputRefs.current[card.media_id]?.click()} disabled={card.reference_images_json.length >= 3}>
                      上传参考图
                    </button>
                    <input
                      ref={(node) => {
                        referenceInputRefs.current[card.media_id] = node;
                      }}
                      className="sr-only-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        void handleReferenceImagesSelected(card, event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </div>
                  {card.reference_images_json.length > 0 ? (
                    <div className="reference-thumbs">
                      {card.reference_images_json.map((imageUrl, index) => (
                        <img key={`${card.media_id}-ref-${index}`} src={imageUrl} alt={`${card.media_id} reference ${index + 1}`} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
