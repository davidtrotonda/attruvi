import { describe, expect, it } from "vitest";

import { supabaseServerAuthHeaders } from "./supabase-auth";

describe("cabeceras de servidor de Supabase", () => {
  it("no envía una clave secreta moderna como JWT bearer", () => {
    expect(supabaseServerAuthHeaders("sb_secret_example")).toEqual({ apikey: "sb_secret_example" });
  });

  it("mantiene compatibilidad con service_role heredada", () => {
    expect(supabaseServerAuthHeaders("legacy-service-role-jwt")).toEqual({
      apikey: "legacy-service-role-jwt",
      authorization: "Bearer legacy-service-role-jwt",
    });
  });
});
