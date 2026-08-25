import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_MEMORY_DETAIL,
  addStoryMemory,
  clearStoryMemories,
  deleteStoryMemory,
  listStoryMemories,
  memoryEnabledFor,
  setMemoryEnabled,
  updateStoryMemory,
} from "@/lib/story-memory";

export const runtime = "nodejs";

async function owner(): Promise<string | null> {
  return (await auth()).userId;
}

export async function GET(): Promise<NextResponse> {
  const userId = await owner();
  if (!userId) return NextResponse.json({ error: "Sign in to open Your Story." }, { status: 401 });
  const [enabled, memories] = await Promise.all([memoryEnabledFor(userId), listStoryMemories(userId)]);
  return NextResponse.json({ enabled, memories });
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await owner();
  if (!userId) return NextResponse.json({ error: "Sign in to add a detail." }, { status: 401 });
  const parsed = z.object({ detail: z.string().trim().min(2).max(MAX_MEMORY_DETAIL) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Write at least two characters." }, { status: 400 });
  await addStoryMemory(userId, parsed.data.detail, "profile");
  return NextResponse.json({ memories: await listStoryMemories(userId) }, { status: 201 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const userId = await owner();
  if (!userId) return NextResponse.json({ error: "Sign in to update Your Story." }, { status: 401 });
  const parsed = z.union([
    z.object({ memoryEnabled: z.boolean() }),
    z.object({ id: z.string().uuid(), detail: z.string().trim().min(2).max(MAX_MEMORY_DETAIL) }),
  ]).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "That update is not valid." }, { status: 400 });
  if ("memoryEnabled" in parsed.data) {
    await setMemoryEnabled(userId, parsed.data.memoryEnabled);
    return NextResponse.json({ enabled: parsed.data.memoryEnabled });
  }
  const updated = await updateStoryMemory(userId, parsed.data.id, parsed.data.detail);
  if (!updated) return NextResponse.json({ error: "That detail was not found." }, { status: 404 });
  return NextResponse.json({ memories: await listStoryMemories(userId) });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const userId = await owner();
  if (!userId) return NextResponse.json({ error: "Sign in to remove a detail." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (id === "all") {
    await clearStoryMemories(userId);
    return NextResponse.json({ memories: [] });
  }
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid detail." }, { status: 400 });
  const deleted = await deleteStoryMemory(userId, parsed.data);
  if (!deleted) return NextResponse.json({ error: "That detail was not found." }, { status: 404 });
  return NextResponse.json({ memories: await listStoryMemories(userId) });
}
