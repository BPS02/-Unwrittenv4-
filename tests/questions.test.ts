import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUIDE_SYSTEM_PROMPT,
  buildGeneratorUserPrompt,
  buildGuideBriefUserPrompt,
  buildGuideQuestionsUserPrompt,
  parseBriefCompletion,
  parseQuestionsCompletion,
} from "@/lib/prompts";
import { lyricsRequestSchema, questionsRequestSchema } from "@/lib/validation";
import { answersComplete, collectAnswers, unansweredQuestionIds } from "@/lib/questions";
import { DEFAULT_CONTROLS, MAX_QUESTIONS, MIN_QUESTIONS } from "@/lib/types";

/**
 * The follow-up questions step, asked between "Shape" and "Lyrics".
 *
 * Two properties matter most and are asserted here:
 * 1. The questions are always model-written for this writer — there is no
 *    canned list, so an unconfigured OpenRouter must FAIL rather than serve
 *    generic questions the writer would assume were about them.
 * 2. Whatever the writer answers reaches the lyrics prompt intact.
 */

const baseRequest = {
  input: {
    thought: "I drove past my old high school last night and it looked smaller.",
    feelings: ["nostalgic"],
    feelingsText: "",
    context: "a beat-up blue Corolla",
  },
  controls: DEFAULT_CONTROLS,
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("parseQuestionsCompletion", () => {
  it("parses a numbered list into ids and questions", () => {
    const questions = parseQuestionsCompletion(
      "1. Who was usually in the passenger seat?\n2. What was playing on the radio?\n3. What did you say out loud?"
    );
    expect(questions).toHaveLength(3);
    expect(questions[0]).toEqual({ id: "q1", question: "Who was usually in the passenger seat?" });
    expect(questions[2]?.id).toBe("q3");
  });

  it("tolerates the drift models actually produce", () => {
    const questions = parseQuestionsCompletion(
      [
        "Here are your questions:",
        "- **Who was in the passenger seat?**",
        "2) “What did the parking lot smell like?”",
        "* What year was it?",
      ].join("\n")
    );
    expect(questions.map((q) => q.question)).toEqual([
      "Who was in the passenger seat?",
      "What did the parking lot smell like?",
      "What year was it?",
    ]);
  });

  it("never returns more than MAX_QUESTIONS", () => {
    const many = Array.from({ length: 12 }, (_, i) => `${i + 1}. Question number ${i + 1}?`);
    expect(parseQuestionsCompletion(many.join("\n"))).toHaveLength(MAX_QUESTIONS);
  });

  it("ignores prose that isn't a list item", () => {
    expect(parseQuestionsCompletion("I'd love to know more about that night.")).toHaveLength(0);
  });
});

describe("buildGuideQuestionsUserPrompt", () => {
  it("names the QUESTIONS task and gives the guide what the writer already said", () => {
    const prompt = buildGuideQuestionsUserPrompt(questionsRequestSchema.parse(baseRequest));
    expect(prompt).toContain("TASK: QUESTIONS");
    expect(prompt).toContain("old high school");
    expect(prompt).toContain("nostalgic");
    expect(prompt).toContain("beat-up blue Corolla");
    expect(prompt).toContain("Do not ask for anything they already told you");
  });

  it("instructs the guide to ask about this writer, not in general", () => {
    expect(GUIDE_SYSTEM_PROMPT).toContain("wasted question");
    expect(GUIDE_SYSTEM_PROMPT).toMatch(new RegExp(`${MIN_QUESTIONS}-${MAX_QUESTIONS} questions`));
  });

  it("keeps the step creative rather than clinical", () => {
    // The product is expression, not therapy — the prompt must say so.
    expect(GUIDE_SYSTEM_PROMPT).toContain("not therapy");
    expect(GUIDE_SYSTEM_PROMPT).toContain("Never diagnose");
  });
});

describe("the guide puts it all together (TASK: BRIEF)", () => {
  it("carries the thought, details, and every answered question into the brief request", () => {
    const prompt = buildGuideBriefUserPrompt(
      lyricsRequestSchema.parse({
        ...baseRequest,
        input: {
          ...baseRequest.input,
          answers: [
            { id: "q1", question: "Who was in the passenger seat?", answer: "My brother Dan." },
          ],
        },
        variation: 0,
      })
    );
    expect(prompt).toContain("TASK: BRIEF");
    expect(prompt).toContain("old high school");
    expect(prompt).toContain("beat-up blue Corolla");
    expect(prompt).toContain("Q: Who was in the passenger seat?");
    expect(prompt).toContain("A: My brother Dan.");
    expect(prompt).toContain("Put everything above together");
  });

  it("tells the guide the answers carry the most weight", () => {
    expect(GUIDE_SYSTEM_PROMPT).toContain("TASK: BRIEF");
    expect(GUIDE_SYSTEM_PROMPT).toContain("carry the most weight");
    expect(GUIDE_SYSTEM_PROMPT).toContain("never invent a detail");
  });

  it("accepts a usable brief and strips a stray label", () => {
    expect(
      parseBriefCompletion(
        "BRIEF: A song about driving past the old high school in a beat-up blue Corolla with Dan."
      )
    ).toBe("A song about driving past the old high school in a beat-up blue Corolla with Dan.");
  });

  it("rejects an empty or too-short brief so the raw sections step in", () => {
    expect(parseBriefCompletion("")).toBeNull();
    expect(parseBriefCompletion("A song.")).toBeNull();
  });
});

describe("answers reach the generator prompt", () => {
  it("pairs each question with its answer when no brief was assembled", () => {
    const prompt = buildGeneratorUserPrompt(
      lyricsRequestSchema.parse({
        ...baseRequest,
        input: {
          ...baseRequest.input,
          answers: [
            { id: "q1", question: "Who was in the passenger seat?", answer: "My brother Dan." },
            { id: "q2", question: "What was playing?", answer: "A burned CD of Blink-182." },
          ],
        },
        variation: 0,
      }),
      null
    );
    expect(prompt).toContain("Q: Who was in the passenger seat?");
    expect(prompt).toContain("A: My brother Dan.");
    expect(prompt).toContain("Blink-182");
  });

  it("omits the section entirely when nothing was answered", () => {
    const prompt = buildGeneratorUserPrompt(
      lyricsRequestSchema.parse({
        ...baseRequest,
        input: {
          ...baseRequest.input,
          answers: [{ id: "q1", question: "Who was there?", answer: "   " }],
        },
        variation: 0,
      }),
      null
    );
    expect(prompt).not.toContain("Q: Who was there?");
    expect(prompt).not.toContain("OWN ANSWERS");
  });

  it("still accepts a request with no answers at all (MCP path)", () => {
    const parsed = lyricsRequestSchema.parse({ ...baseRequest, variation: 0 });
    expect(parsed.input.answers).toEqual([]);
  });
});

describe("every question must be answered", () => {
  const set = [
    { id: "q1", question: "Who was there?" },
    { id: "q2", question: "What was playing?" },
  ];

  it("reports exactly the blank ones, in order", () => {
    expect(unansweredQuestionIds(set, { q1: "Dan" })).toEqual(["q2"]);
    expect(unansweredQuestionIds(set, {})).toEqual(["q1", "q2"]);
  });

  it("treats whitespace as unanswered", () => {
    expect(answersComplete(set, { q1: "Dan", q2: "   \n " })).toBe(false);
  });

  it("passes only when all are answered", () => {
    expect(answersComplete(set, { q1: "Dan", q2: "Blink-182" })).toBe(true);
  });

  it("does NOT pass vacuously when there are no questions", () => {
    // A draft restored onto the step before its questions arrived: "no
    // blanks found" must not mean "ready to write lyrics".
    expect(answersComplete([], {})).toBe(false);
  });

  it("collects answers trimmed and paired with their question text", () => {
    expect(collectAnswers(set, { q1: "  Dan  ", q2: "Blink-182" })).toEqual([
      { id: "q1", question: "Who was there?", answer: "Dan" },
      { id: "q2", question: "What was playing?", answer: "Blink-182" },
    ]);
  });
});

describe("POST /api/questions", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "");
  });

  it("refuses with a distinguishable code when no model is configured", async () => {
    // No canned fallback by design: generic questions would read as personal.
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { POST } = await import("@/app/api/questions/route");
    const res = await POST(jsonRequest("http://test/api/questions", baseRequest));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe("QUESTIONS_UNAVAILABLE");
  });

  it("rejects an invalid body with a friendly 400", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const { POST } = await import("@/app/api/questions/route");
    const res = await POST(
      jsonRequest("http://test/api/questions", {
        input: { thought: "no", feelings: [], feelingsText: "", context: "" },
        controls: DEFAULT_CONTROLS,
      })
    );
    expect(res.status).toBe(400);
  });
});
