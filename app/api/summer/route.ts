import { createSummerGateway } from "@/app/lib/summer-gateway";

const gateway = createSummerGateway({
  baseUrl: () => process.env.SUMMER_BASE_URL || "http://127.0.0.1:8000",
  token: () => process.env.SUMMER_TOKEN || "",
  label: "summer",
});

export const GET = gateway.GET;
export const POST = gateway.POST;
