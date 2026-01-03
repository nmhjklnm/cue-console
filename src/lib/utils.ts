import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Agent 名字解析
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

// 获取动物 emoji
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

// 时间格式化 - 将 UTC 时间转为中国时区
export function formatTime(dateStr: string): string {
  // 数据库存储的是 UTC 时间，需要转换
  const date = new Date(dateStr + "Z"); // 添加 Z 表示 UTC
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) {
    return "刚刚";
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  if (diff < 86400000) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Shanghai",
    });
  }
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  });
}

export function formatFullTime(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
  });
}

// 计算等待时长
export function getWaitingDuration(dateStr: string): string {
  const date = new Date(dateStr + "Z"); // UTC 时间
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  }
  return `${seconds}秒`;
}

// 文本截断
export function truncateText(text: string, maxLength: number = 30): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// @ 解析
export function parseAtMentions(text: string): string[] {
  const regex = /@([\w-]+)/g;
  const matches = text.matchAll(regex);
  return [...matches].map((m) => m[1]);
}

export function removeAtMentions(text: string): string {
  return text.replace(/@[\w-]+\s*/g, "").trim();
}
