import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Agent name parsing
export function parseAgentName(name: string): {
  adjective: string;
  animal: string;
  number: string;
} {
  const parts = name.split("-");
  if (parts.length >= 3) {
    return {
      adjective: parts[0],
      animal: parts[1],
      number: parts[2],
    };
  }
  return { adjective: "", animal: name, number: "" };
}

// Map animal name -> emoji
const animalEmojis: Record<string, string> = {
  fox: "🦊",
  deer: "🦌",
  owl: "🦉",
  wolf: "🐺",
  bear: "🐻",
  eagle: "🦅",
  lynx: "🐱",
  hawk: "🦅",
  lion: "🦁",
  tiger: "🐯",
  panda: "🐼",
  koala: "🐨",
  rabbit: "🐰",
  cat: "🐱",
  dog: "🐕",
  horse: "🐴",
  dolphin: "🐬",
  whale: "🐋",
  shark: "🦈",
  octopus: "🐙",
  penguin: "🐧",
  flamingo: "🦩",
  peacock: "🦚",
  swan: "🦢",
  parrot: "🦜",
  dragon: "🐉",
  unicorn: "🦄",
  butterfly: "🦋",
  bee: "🐝",
  ant: "🐜",
};

export function getAgentEmoji(name: string): string {
  const { animal } = parseAgentName(name);
  return animalEmojis[animal.toLowerCase()] || "🤖";
}

// Time formatting - convert UTC time to Asia/Shanghai
export function formatTime(dateStr: string): string {
  // The database stores UTC time
  const date = new Date((dateStr || "").replace(" ", "T"));
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) {
    return "just now";
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`;
  }
  if (diff < 86400000) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  });
}

export function formatFullTime(dateStr: string): string {
  const date = new Date((dateStr || "").replace(" ", "T"));
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

// Waiting duration
export function getWaitingDuration(dateStr: string): string {
  const date = new Date((dateStr || "").replace(" ", "T"));
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}

// Truncate text
export function truncateText(text: string, maxLength: number = 30): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// @ mention parsing
export function parseAtMentions(text: string): string[] {
  const regex = /@([\w-]+)/g;
  const matches = text.matchAll(regex);
  return [...matches].map((m) => m[1]);
}

export function removeAtMentions(text: string): string {
  return text.replace(/@[\w-]+\s*/g, "").trim();
}
