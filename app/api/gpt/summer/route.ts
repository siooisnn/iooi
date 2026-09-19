import { createSummerGateway } from "@/app/lib/summer-gateway";

const gateway = createSummerGateway({
  baseUrl: () => process.env.GPT_SUMMER_BASE_URL || "",
  token: () => process.env.GPT_SUMMER_TOKEN || "",
  label: "GPT summer",
});

export const GET = gateway.GET;
export const POST = gateway.POST;
