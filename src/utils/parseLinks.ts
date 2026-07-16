export interface Link {
  name: string;
  url: string;
  category: string;
  description: string;
  tag: string;
  order?: number;
  pinned?: boolean;
  icon?: string;
}

export function parseYamlLinks(source: string): Link[] {
  const links: Record<string, string | number | boolean>[] = [];
  let current: Record<string, string | number | boolean> | undefined;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith("- ")) {
      current = {};
      links.push(current);
      readPair(line.slice(2), current);
      continue;
    }

    if (!current) continue;
    readPair(line, current);
  }

  return links as Link[];
}

function readPair(line: string, target: Record<string, string | number | boolean>) {
  const separator = line.indexOf(":");
  if (separator < 0) return;

  const key = line.slice(0, separator).trim();
  const rawValue = line.slice(separator + 1).trim();
  target[key] = parseValue(rawValue);
}

function parseValue(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
