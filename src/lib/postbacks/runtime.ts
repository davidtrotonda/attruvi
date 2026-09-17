import "server-only";

import {
  GoogleAdsPostbackAdapter,
  MetaPostbackAdapter,
  TikTokPostbackAdapter,
  type PostbackAdapter,
  type PostbackProvider,
} from "@attruvi/connectors";

export function createPostbackAdapter(provider: PostbackProvider): PostbackAdapter {
  if (provider === "google_ads") return new GoogleAdsPostbackAdapter();
  if (provider === "meta_ads") return new MetaPostbackAdapter();
  return new TikTokPostbackAdapter();
}
