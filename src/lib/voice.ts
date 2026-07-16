// src/lib/voice.ts
//
// Voice announcement utility using the Web Speech API (SpeechSynthesis).
// Works in Chrome, Edge, Safari, and Firefox — no external API needed.
//
// The POS uses this to announce sale totals and change due after a
// successful sale, so the customer hears the amount.

/**
 * Speaks the given text using the browser's built-in text-to-speech.
 * Silently does nothing if the browser doesn't support speech synthesis
 * or if no voices are available.
 */
export function speak(text: string, options?: {
  rate?: number;    // 0.1 to 10, default 1
  pitch?: number;   // 0 to 2, default 1
  volume?: number;  // 0 to 1, default 1
}): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = options?.pitch ?? 1;
  utterance.volume = options?.volume ?? 1;
  utterance.lang = "en-US";

  // Try to find an English voice
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const englishVoice = voices.find(v => v.lang.startsWith("en"));
    if (englishVoice) utterance.voice = englishVoice;
  }

  window.speechSynthesis.speak(utterance);
}

/**
 * Announces a completed sale: total amount, payment method, and change due.
 * Example: "Sale complete. Total: 550 rupees. Paid by cash. Change due: 50 rupees. Thank you!"
 */
export function announceSaleComplete(params: {
  total: number;
  paymentMethod: string;
  changeDue: number;
  itemCount?: number;
}): void {
  const { total, paymentMethod, changeDue, itemCount } = params;

  const parts: string[] = [];

  if (itemCount) {
    parts.push(`${itemCount} items.`);
  }

  parts.push(`Total: ${total} rupees.`);
  parts.push(`Paid by ${paymentMethod}.`);

  if (changeDue > 0) {
    parts.push(`Change due: ${Math.round(changeDue)} rupees.`);
  }

  parts.push("Thank you for shopping!");

  speak(parts.join(" "), { rate: 0.95 });
}

/**
 * Announces a return: total refund amount.
 */
export function announceReturn(params: {
  total: number;
}): void {
  speak(`Return processed. Refund: ${params.total} rupees.`, { rate: 0.95 });
}

/**
 * Pre-loads voices — some browsers (Chrome) load voices asynchronously.
 * Call this on app startup so voices are ready when the first sale completes.
 */
export function preloadVoices(): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  // Trigger voice loading
  window.speechSynthesis.getVoices();
  // Chrome fires voiceschanged event when voices are loaded
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
