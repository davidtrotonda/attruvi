import { describe, expect, it } from "vitest";

import { supabaseServerAuthHeaders } from "./supabase-auth";

describe("cabeceras de servidor de Supabase", () => {
  it("distingue claves opacas modernas y JWT heredados", () => {
    expect(supabaseServerAuthHeaders("sb_secret_example")).toEqual({ apikey: "sb_secret_example" });
    expect(supabaseServerAuthHeaders("legacy-service-role-jwt")).toEqual({
      apikey: "legacy-service-role-jwt",
      authorization: "Bearer legacy-service-role-jwt",
    });
  });
});
