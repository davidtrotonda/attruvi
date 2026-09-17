import "server-only";

import {
  GoogleAdsConnector,
  MetaAdsConnector,
  TikTokAdsConnector,
  type AdvertisingConnector,
} from "@attruvi/connectors";
import type { RemoteConnectorProvider } from "./catalog";

export function createAdvertisingConnector(provider: RemoteConnectorProvider): AdvertisingConnector {
  if (provider === "google_ads") return new GoogleAdsConnector();
  if (provider === "meta_ads") return new MetaAdsConnector();
  return new TikTokAdsConnector();
}
