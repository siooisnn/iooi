import { readGptStore, withGptStore } from "@/app/lib/store";
import { createSessionSyncHandlers } from "@/app/lib/session-sync";

const handlers = createSessionSyncHandlers({ read: readGptStore, write: withGptStore });

export const GET = handlers.GET;
export const POST = handlers.POST;
