import { z } from "zod";

export const emailSchema = z.email("Escribe un correo válido.").trim().toLowerCase();

export const passwordSchema = z
  .string()
  .min(10, "Usa al menos 10 caracteres.")
  .regex(/[a-z]/, "Añade una letra minúscula.")
  .regex(/[A-Z]/, "Añade una letra mayúscula.")
  .regex(/[0-9]/, "Añade un número.");

export const registrationSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2, "Escribe tu nombre.").max(120),
  password: passwordSchema,
});

export const onboardingSchema = z
  .object({
    androidPackageName: z.string().trim().max(255),
    appName: z.string().trim().min(2, "Escribe el nombre de la app.").max(120),
    currency: z.enum(["EUR", "USD", "GBP", "MXN", "ARS", "CLP", "COP"]),
    iosBundleId: z.string().trim().max(255),
    platform: z.enum(["ios", "android", "both"]),
    projectName: z
      .string()
      .trim()
      .min(2, "Escribe el nombre del proyecto.")
      .max(120),
    timezone: z.string().trim().min(1, "Elige una zona horaria.").max(120),
  })
  .superRefine((value, context) => {
    const iosPattern = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/;
    const androidPattern = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

    if (
      (value.platform === "ios" || value.platform === "both") &&
      !iosPattern.test(value.iosBundleId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Usa un bundle id como com.empresa.app.",
        path: ["iosBundleId"],
      });
    }

    if (
      (value.platform === "android" || value.platform === "both") &&
      !androidPattern.test(value.androidPackageName)
    ) {
      context.addIssue({
        code: "custom",
        message: "Usa un package name como com.empresa.app.",
        path: ["androidPackageName"],
      });
    }
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;
