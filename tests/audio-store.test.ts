import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAudioStoreForTesting,
  mintAudioToken,
  mintBlobAudioToken,
  resolveAudio,
  storeAudio,
} from "@/lib/audio-store";

/**
 * Playback tokens.
 *
 * A token is the capability that lets bytes out, so the properties under test
 * are: it must be unforgeable, it must expire, and it must carry the
 * entitlement decided at render time (downloadable) rather than anything a
 * client could assert later.
 *
 * These run against the in-memory backend — no DATABASE_URL — but the token
 * format is the same one Postgres-backed audio uses.
 */

const OWNER = "user_owner";

beforeEach(() => {
  clearAudioStoreForTesting();
  vi.unstubAllEnvs();
  vi.stubEnv("AUDIO_SIGNING_SECRET", "test-audio-secret");
});

describe("postgres audio tokens", () => {
  it("round-trips an audio row id", () => {
    const token = mintAudioToken({ audioId: "aud-1", ownerId: OWNER, downloadable: true });
    const resolved = resolveAudio(token);
    expect(resolved).toEqual({
      kind: "pg",
      audioId: "aud-1",
      ownerId: OWNER,
      downloadable: true,
    });
  });

  it("carries the downloadable decision made at render time", () => {
    const preview = mintAudioToken({ audioId: "aud-1", ownerId: OWNER, downloadable: false });
    expect(resolveAudio(preview)).toMatchObject({ downloadable: false });
  });

  it("refuses a tampered payload", () => {
    const token = mintAudioToken({ audioId: "aud-1", ownerId: OWNER, downloadable: false });
    const [payload, signature] = token.split(".");
    // Re-encode the payload with downloadable flipped, keeping the signature.
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString());
    decoded.d = true;
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
    expect(resolveAudio(forged)).toBeNull();
  });

  it("refuses a tampered signature", () => {
    const token = mintAudioToken({ audioId: "aud-1", ownerId: OWNER, downloadable: true });
    expect(resolveAudio(`${token.slice(0, -3)}aaa`)).toBeNull();
  });

  it("expires", () => {
    const now = Date.now();
    const token = mintAudioToken({ audioId: "aud-1", ownerId: OWNER, downloadable: true }, 1000, now);
    expect(resolveAudio(token, now + 500)).not.toBeNull();
    expect(resolveAudio(token, now + 1001)).toBeNull();
  });

  it("does not survive a change of signing secret", () => {
    const token = mintAudioToken({ audioId: "aud-1", ownerId: OWNER, downloadable: true });
    vi.stubEnv("AUDIO_SIGNING_SECRET", "a-different-secret");
    expect(resolveAudio(token)).toBeNull();
  });
});

describe("legacy blob tokens", () => {
  it("still resolve, so takes predating the move keep playing", () => {
    const token = mintBlobAudioToken({
      pathname: "liner-notes-audio/old.mp3",
      ownerId: OWNER,
      downloadable: true,
    });
    expect(resolveAudio(token)).toEqual({
      kind: "blob",
      pathname: "liner-notes-audio/old.mp3",
      ownerId: OWNER,
      downloadable: true,
    });
  });
});

describe("in-memory backend (no database)", () => {
  it("stores and resolves raw bytes", async () => {
    const bytes = Buffer.from("fake audio");
    const ref = await storeAudio({
      bytes,
      mimeType: "audio/mpeg",
      ownerId: OWNER,
      downloadable: false,
    });
    // No database, so no row id — the token is an opaque handle.
    expect(ref.audioId).toBeNull();
    const resolved = resolveAudio(ref.token);
    expect(resolved).toMatchObject({ kind: "bytes", ownerId: OWNER, downloadable: false });
  });

  it("returns null for an unknown handle", () => {
    expect(resolveAudio("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
