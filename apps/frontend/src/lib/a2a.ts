/** Singleton A2A client, pointed at the agent (transport auto-selected from its card). */
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Client } from "@a2a-js/sdk/client";
import { AGENT_URL } from "./config";

let clientPromise: Promise<Client> | null = null;

export function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = new ClientFactory().createFromUrl(AGENT_URL);
  }
  return clientPromise;
}
