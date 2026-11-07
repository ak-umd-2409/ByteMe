import type { LlmProvider, LlmRequest } from "../llm/client.ts";
import type { FetchLike, ResolveHost } from "../shared/safeFetch.ts";

/** Test doubles. Never used by production code paths. */

/** An LLM that answers from a function and records what it was asked. */
export function fakeLlm(answer: (request: LlmRequest) => string | null, name = "fake-llm") {
  const calls: LlmRequest[] = [];
  const provider: LlmProvider = {
    name,
    async complete(request) {
      calls.push(request);
      return answer(request);
    },
  };
  return { provider, calls };
}

/** A fetch that serves a fixed map of URL → response. Unknown URLs are 404. */
export function fakeFetch(routes: Record<string, { status?: number; body: string; headers?: Record<string, string> } | Error>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl: FetchLike = async (input, init) => {
    calls.push({ url: input, init });
    const route = routes[input];
    if (route instanceof Error) throw route;
    if (!route) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: { "content-type": "text/html", ...route.headers },
    });
  };
  return { impl, calls };
}

export const publicResolve: ResolveHost = async () => ["93.184.216.34"];
