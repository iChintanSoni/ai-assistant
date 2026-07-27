/** Voice input: transcribes a recorded audio clip already uploaded to file-storage. */
import { AGENT_URL } from "./config";

export async function transcribeAudio(url: string): Promise<string> {
  const res = await fetch(`${AGENT_URL}/transcribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not transcribe the recording (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}
