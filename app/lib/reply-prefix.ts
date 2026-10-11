// The prompt lays history out as labelled turns, so a short casual message can
// make the model continue the "transcript" and open with its own speaker
// label ("AI：", "【助手】", ...). Only a label at the very start is removed.
const SPEAKER_PREFIX = /^\s*(?:【\s*(?:AI|助手|assistant|claude|你之前的回复[^】\n]{0,12})\s*】\s*[:：]?|(?:AI|助手|assistant|claude)\s*[:：])[ \t]*\n?/i;

export function stripSpeakerPrefix(reply: string) {
  const stripped = reply.replace(SPEAKER_PREFIX, "");
  return stripped.trim() ? stripped : reply;
}
