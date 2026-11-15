"use client";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const host = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return Boolean(host.SpeechRecognition || host.webkitSpeechRecognition);
}

export function speechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function createRecognizer(onText: (text: string, final: boolean) => void, onError: (message: string) => void): {
  start: () => void;
  stop: () => void;
} | null {
  const host = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = "";
    let final = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      text += event.results[index][0].transcript;
      final = event.results[index].isFinal;
    }
    onText(text.trim(), final);
  };
  recognition.onerror = (event) => onError(event.error || "speech error");
  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}

export function speak(text: string): boolean {
  if (!speechOutputSupported() || !text.trim()) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
  return true;
}
