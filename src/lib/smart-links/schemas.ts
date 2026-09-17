import { z } from "zod";
import {
  reservedSmartLinkSlugs,
  smartLinkSourceKinds,
} from "./shared";

const iosBundlePattern = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/;
const androidPackagePattern = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const optionalText = (maximum = 255) => z.string().trim().max(maximum);
const optionalHttpsUrl = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => !value || /^https:\/\/[^\s]+$/i.test(value), "Usa una URL https:// completa.");
const optionalStoreUrl = (hostname: string, message: string) =>
  optionalHttpsUrl.refine((value) => {
    if (!value) return true;
    try {
      return new URL(value).hostname === hostname;
    } catch {
      return false;
    }
  }, message);

export const managedAppSchema = z
  .object({
    androidPackageName: optionalText(255),
    appId: z.union([z.literal(""), z.uuid()]),
    currency: z.enum(["EUR", "USD", "GBP", "MXN", "ARS", "CLP", "COP"]),
    iosBundleId: optionalText(255),
    name: z.string().trim().min(2, "Escribe el nombre de la app.").max(120),
    platform: z.enum(["ios", "android", "both"]),
    status: z.enum(["active", "paused", "disabled"]),
    timezone: z.string().trim().min(1).max(120),
  })
  .superRefine((value, context) => {
    if (
      (value.platform === "ios" || value.platform === "both") &&
      !iosBundlePattern.test(value.iosBundleId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Usa un bundle id como com.empresa.app.",
        path: ["iosBundleId"],
      });
    }
    if (
      (value.platform === "android" || value.platform === "both") &&
      !androidPackagePattern.test(value.androidPackageName)
    ) {
      context.addIssue({
        code: "custom",
        message: "Usa un package name como com.empresa.app.",
        path: ["androidPackageName"],
      });
    }
  });

export const smartLinkFormSchema = z
  .object({
    adExternalId: optionalText(),
    adGroupExternalId: optionalText(),
    adGroupName: optionalText(),
    adName: optionalText(),
    affiliateId: optionalText(),
    androidUrl: optionalStoreUrl("play.google.com", "Usa la URL oficial de Google Play."),
    appId: z.uuid(),
    attributionWindowDays: z.coerce.number().int().min(1).max(90),
    campaignExternalId: optionalText(),
    campaignName: optionalText(),
    creatorId: optionalText(),
    deepLinkPath: z
      .string()
      .trim()
      .max(1_024)
      .refine((value) => !value || /^\/[^\s]*$/.test(value), "Empieza la ruta por / y no uses espacios."),
    destinationMode: z.enum(["auto", "ios", "android", "web"]),
    iosUrl: optionalStoreUrl("apps.apple.com", "Usa la URL oficial de App Store."),
    name: z.string().trim().min(2, "Pon un nombre al enlace.").max(160),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{1,80}$/, "Usa letras sin acentos, números y guiones.")
      .refine((value) => !reservedSmartLinkSlugs.has(value), "Ese nombre está reservado."),
    smartLinkId: z.union([z.literal(""), z.uuid()]),
    sourceKind: z.enum(smartLinkSourceKinds),
    status: z.enum(["active", "paused", "disabled"]),
    utmCampaign: optionalText(),
    utmContent: optionalText(),
    utmMedium: optionalText(),
    utmSource: optionalText(),
    utmTerm: optionalText(),
    webUrl: z.string().trim().max(2_048).url("Escribe una URL web válida.").refine(
      (value) => value.startsWith("https://"),
      "La URL web debe empezar por https://.",
    ),
  })
  .superRefine((value, context) => {
    if (value.destinationMode === "ios" && !value.iosUrl) {
      context.addIssue({ code: "custom", message: "Añade la URL de App Store.", path: ["iosUrl"] });
    }
    if (value.destinationMode === "android" && !value.androidUrl) {
      context.addIssue({ code: "custom", message: "Añade la URL de Google Play.", path: ["androidUrl"] });
    }
    if (value.destinationMode === "auto" && !value.iosUrl && !value.androidUrl) {
      context.addIssue({ code: "custom", message: "Añade al menos una tienda móvil.", path: ["iosUrl"] });
    }
    if ((value.adGroupName || value.adGroupExternalId) && !value.campaignName && !value.campaignExternalId) {
      context.addIssue({ code: "custom", message: "Añade primero la campaña.", path: ["campaignName"] });
    }
    if ((value.adName || value.adExternalId) && !value.adGroupName && !value.adGroupExternalId) {
      context.addIssue({ code: "custom", message: "Añade primero el grupo de anuncios.", path: ["adGroupName"] });
    }
  });

export type ManagedAppInput = z.output<typeof managedAppSchema>;
export type SmartLinkFormInput = z.output<typeof smartLinkFormSchema>;
