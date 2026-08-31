import { readStore, withStore } from "@/app/lib/store";
import { createSessionSyncHandlers } from "@/app/lib/session-sync";

const handlers = createSessionSyncHandlers({ read: readStore, write: withStore });

export const GET = handlers.GET;
export const POST = handlers.POST;
