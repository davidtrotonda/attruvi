import type { FetchLike } from "./http.js";

export type StrictHttpExpectation = {
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly method: string;
  readonly response: unknown;
  readonly responseHeaders?: Record<string, string>;
  readonly status?: number;
  readonly url: string;
};

export class StrictFakeHttpClient {
  private readonly expectations: StrictHttpExpectation[];
  constructor(expectations: readonly StrictHttpExpectation[]) {
    this.expectations = [...expectations];
  }

  readonly fetch: FetchLike = async (input, init) => {
    const expectation = this.expectations.shift();
    if (!expectation) throw new Error("Unexpected HTTP request.");
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url !== expectation.url) throw new Error(`Expected URL ${expectation.url}, received ${url}.`);
    if (method !== expectation.method.toUpperCase()) throw new Error(`Expected method ${expectation.method}, received ${method}.`);
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(expectation.headers ?? {})) {
      if (headers.get(name) !== value) throw new Error(`Expected header ${name}.`);
    }
    if (expectation.body !== undefined) {
      const actual = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      const stable = (value: unknown): unknown => Array.isArray(value)
        ? value.map(stable)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, stable(nested)]))
          : value;
      if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expectation.body))) throw new Error("HTTP body did not match the strict fixture.");
    }
    return new Response(JSON.stringify(expectation.response), {
      headers: { "content-type": "application/json", ...(expectation.responseHeaders ?? {}) },
      status: expectation.status ?? 200,
    });
  };

  verify() {
    if (this.expectations.length) throw new Error(`${this.expectations.length} expected HTTP request(s) were not made.`);
  }
}
