import { readGroupStore, withGroupStore } from "@/app/lib/store";
import { createSessionSyncHandlers } from "@/app/lib/session-sync";

const handlers = createSessionSyncHandlers({ read: readGroupStore, write: withGroupStore });

export const GET = handlers.GET;
export const POST = handlers.POST;
