// SDK利用準備
import type { MicroCMSQueries, MicroCMSListContent, MicroCMSImage } from "microcms-js-sdk";
import { createClient } from "microcms-js-sdk";

const client = createClient({
  serviceDomain: import.meta.env.MICROCMS_SERVICE_DOMAIN,
  apiKey: import.meta.env.MICROCMS_API_KEY,
});

// 型定義
export type Project = {
  title: string;
  subtitle: string;
  thumbnail: MicroCMSImage;
  award: string;
} & MicroCMSListContent;

// APIの呼び出し
export const getProject = async (queries?: MicroCMSQueries) => {
  return await client.getList<Project>({ endpoint: "project", queries });
};

export const getProjectDetail = async (contentId: string, queries?: MicroCMSQueries) => {
  return await client.getListDetail<Project>({
    endpoint: "project",
    contentId,
    queries,
  });
};
