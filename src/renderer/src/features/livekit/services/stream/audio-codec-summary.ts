// What the microphone sender negotiated, reduced to the settings the bandwidth
// and loss analysis relies on (Opus, RED, in-band FEC, DTX, mono).
export type AudioCodecSummary = {
  codec: string;
  red: boolean;
  fec: boolean;
  dtx: boolean;
  stereo: boolean;
  maxAverageBitrate: number | null;
};

export function summarizeAudioCodecs(
  codecs: RTCRtpCodecParameters[] | undefined,
): AudioCodecSummary | null {
  if (!codecs || codecs.length === 0) return null;
  const subtype = (c: RTCRtpCodecParameters) => c.mimeType.split("/")[1]?.toLowerCase() ?? "";
  const red = codecs.some((c) => subtype(c) === "red");
  const main = codecs.find((c) => subtype(c) !== "red");
  if (!main) return null;

  const params = new Map<string, string>();
  for (const entry of (main.sdpFmtpLine ?? "").split(";")) {
    const [key, ...rest] = entry.split("=");
    if (rest.length) params.set(key.trim().toLowerCase(), rest.join("=").trim());
  }
  // "channels" is not read: SDP always lists Opus as 2 channels.
  const maxAverageBitrate = Number(params.get("maxaveragebitrate"));
  return {
    codec: subtype(main),
    red,
    fec: params.get("useinbandfec") === "1",
    dtx: params.get("usedtx") === "1",
    stereo: params.get("stereo") === "1",
    maxAverageBitrate:
      params.has("maxaveragebitrate") && Number.isFinite(maxAverageBitrate) ? maxAverageBitrate : null,
  };
}
