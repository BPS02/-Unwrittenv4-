import { beforeEach, describe, expect, it } from "vitest";
import { addStoryMemory, clearStoryMemories, deleteStoryMemory, detailsFromSongInput, listStoryMemories, promptStoryMemories, resetStoryMemoryForTesting, saveSongInputMemories, setMemoryEnabled, updateStoryMemory } from "@/lib/story-memory";
import { EMPTY_INPUT } from "@/lib/types";

describe("private story memory", () => {
  beforeEach(() => resetStoryMemoryForTesting());

  it("extracts personal details and paired answers", () => {
    expect(detailsFromSongInput({ ...EMPTY_INPUT, thought: "Sunday on the porch", feelings: ["nostalgic"], context: "Grandpa had a red guitar", answers: [{ id: "q1", question: "What did he play?", answer: "Blue Moon" }] }))
      .toEqual(["Sunday on the porch", "Feelings: nostalgic", "Grandpa had a red guitar", "What did he play?: Blue Moon"]);
  });

  it("deduplicates memories and isolates each Clerk user", async () => {
    await addStoryMemory("user_a", "The porch swing was green");
    await addStoryMemory("user_a", "The porch swing was green");
    await addStoryMemory("user_b", "The porch swing was green");
    expect(await listStoryMemories("user_a")).toHaveLength(1);
    expect(await listStoryMemories("user_b")).toHaveLength(1);
  });

  it("stops saving and prompting when memory is disabled", async () => {
    await addStoryMemory("user_a", "An older detail");
    await setMemoryEnabled("user_a", false);
    await saveSongInputMemories("user_a", { ...EMPTY_INPUT, thought: "A new detail" });
    expect(await promptStoryMemories("user_a")).toEqual([]);
    expect((await listStoryMemories("user_a")).map((row) => row.detail)).toEqual(["An older detail"]);
  });

  it("lets only the owner edit, delete, and clear details", async () => {
    await addStoryMemory("user_a", "First version");
    const [row] = await listStoryMemories("user_a");
    expect(row).toBeDefined();
    expect(await updateStoryMemory("user_b", row!.id, "Stolen")).toBe(false);
    expect(await updateStoryMemory("user_a", row!.id, "Updated version")).toBe(true);
    expect(await deleteStoryMemory("user_b", row!.id)).toBe(false);
    expect((await listStoryMemories("user_a"))[0]?.detail).toBe("Updated version");
    await clearStoryMemories("user_a");
    expect(await listStoryMemories("user_a")).toEqual([]);
  });
});
