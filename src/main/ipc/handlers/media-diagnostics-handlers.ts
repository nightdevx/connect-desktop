import { BrowserWindow, app, dialog } from "electron";
import { handle } from "../handle";
import { writeFile } from "node:fs/promises";
import { release } from "node:os";
import { z } from "zod";

import { backendClient, fail, ok, withAccessToken } from "../context";

const jsonRecord = z.record(z.string(), z.unknown());

const entrySchema = z.object({
  seq: z.number().int().min(0),
  atMs: z.number().int().min(0),
  tMs: z.number().int(),
  kind: z.enum(["event", "sample"]),
  scope: z.string().min(1).max(64),
  name: z.string().min(1).max(96),
  data: jsonRecord.optional(),
});

const batchSchema = z.object({
  sessionId: z.string().min(1).max(64),
  schemaVersion: z.number().int().min(1).max(1000),
  seq: z.number().int().min(0),
  startedAtMs: z.number().int().min(0),
  lobbyId: z.string().max(160),
  client: jsonRecord,
  summary: jsonRecord,
  entries: z.array(entrySchema).max(500),
  final: z.boolean(),
});

const sessionQuerySchema = z.object({
  userId: z.string().max(128).optional(),
  lobbyId: z.string().max(160).optional(),
  problem: z.string().max(64).optional(),
  since: z.string().max(40).optional(),
  until: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

const sessionIdSchema = z.object({ sessionId: z.string().min(1).max(64) });

const exportRangeSchema = sessionQuerySchema.extend({
  fileName: z.string().min(1).max(200).optional(),
});

const saveNdjson = async (
  sender: Electron.WebContents,
  defaultName: string,
  bytes: Buffer,
) => {
  const dialogOptions = {
    title: "Tanılama kaydını kaydet",
    defaultPath: defaultName,
    filters: [
      { name: "NDJSON", extensions: ["ndjson"] },
      { name: "Tüm dosyalar", extensions: ["*"] },
    ],
  };

  const window = BrowserWindow.fromWebContents(sender);
  const target = window
    ? await dialog.showSaveDialog(window, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (target.canceled || !target.filePath) {
    return ok({ saved: false, path: null, bytes: bytes.byteLength });
  }

  await writeFile(target.filePath, bytes);
  return ok({ saved: true, path: target.filePath, bytes: bytes.byteLength });
};

const timestampedName = (prefix: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}.ndjson`;
};

interface GpuInfoDevice {
  vendorId?: number;
  deviceId?: number;
  active?: boolean;
  driverVersion?: string;
}

const hexId = (value: number | undefined): string =>
  typeof value === "number" ? `0x${value.toString(16).padStart(4, "0")}` : "";

/**
 * The adapters Chromium's GPU process sees. "basic" is the cheap query; a
 * failure leaves the list empty rather than holding up the context call.
 */
const readGpuDevices = async (): Promise<
  { vendorId: string; deviceId: string; active: boolean | null; driverVersion: string | null }[]
> => {
  try {
    const info = (await app.getGPUInfo("basic")) as { gpuDevice?: GpuInfoDevice[] };
    return (info.gpuDevice ?? []).map((device) => ({
      vendorId: hexId(device.vendorId),
      deviceId: hexId(device.deviceId),
      active: typeof device.active === "boolean" ? device.active : null,
      driverVersion: device.driverVersion ?? null,
    }));
  } catch {
    return [];
  }
};

export const registerMediaDiagnosticsHandlers = (): void => {
  handle("desktop:media-diagnostics-context", async () => {
    try {
      let gpu: Record<string, string> = {};
      try {
        gpu = app.getGPUFeatureStatus() as unknown as Record<string, string>;
      } catch {
        gpu = {};
      }
      const gpuDevices = await readGpuDevices();

      return ok({
        appVersion: app.getVersion(),
        platform: process.platform,
        osVersion: release(),
        electronVersion: process.versions.electron ?? "",
        chromeVersion: process.versions.chrome ?? "",
        gpu: {
          videoEncode: gpu.video_encode ?? "unknown",
          videoDecode: gpu.video_decode ?? "unknown",
          gpuCompositing: gpu.gpu_compositing ?? "unknown",
        },
        gpuDevices,
      });
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:media-diagnostics-upload", async (_event, payload: unknown) => {
    try {
      const batch = batchSchema.parse(payload);
      const result = await withAccessToken((accessToken) =>
        backendClient.media.uploadDiagnostics(accessToken, batch),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:admin-diagnostics-sessions", async (_event, payload: unknown) => {
    try {
      const query = sessionQuerySchema.parse(payload ?? {});
      const result = await withAccessToken((accessToken) =>
        backendClient.adminOps.listDiagnosticSessions(accessToken, query),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:admin-diagnostics-session", async (_event, payload: unknown) => {
    try {
      const { sessionId } = sessionIdSchema.parse(payload);
      const result = await withAccessToken((accessToken) =>
        backendClient.adminOps.getDiagnosticSession(accessToken, sessionId),
      );
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:admin-diagnostics-export-session", async (event, payload: unknown) => {
    try {
      const { sessionId } = sessionIdSchema.parse(payload);
      const { bytes } = await withAccessToken((accessToken) =>
        backendClient.adminOps.exportDiagnosticSession(accessToken, sessionId),
      );
      return await saveNdjson(
        event.sender,
        `media-diagnostics-${sessionId}.ndjson`,
        bytes,
      );
    } catch (error) {
      return fail(error);
    }
  });

  handle("desktop:admin-diagnostics-export-range", async (event, payload: unknown) => {
    try {
      const { fileName, ...query } = exportRangeSchema.parse(payload ?? {});
      const { bytes } = await withAccessToken((accessToken) =>
        backendClient.adminOps.exportDiagnosticRange(accessToken, query),
      );
      return await saveNdjson(
        event.sender,
        fileName ?? timestampedName("media-diagnostics"),
        bytes,
      );
    } catch (error) {
      return fail(error);
    }
  });
};
