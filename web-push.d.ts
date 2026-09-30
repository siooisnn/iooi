declare module "web-push" {
  type SendOptions = {
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
  };

  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: unknown, payload?: string | Buffer, options?: SendOptions): Promise<unknown>;
  };

  export default webpush;
}
