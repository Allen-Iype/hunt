/**
 * Skill dictionary (SDD §18): the single highest-leverage quality investment
 * in the analysis pipeline. Pure data, versioned; improving it never touches
 * code. Aliases are matched case-insensitively as whole tokens/phrases.
 */

export const SKILL_DICTIONARY_VERSION = 1;

export interface SkillEntry {
  /** Canonical lowercase name. */
  name: string;
  aliases: readonly string[];
  category: "language" | "frontend" | "backend" | "infra" | "data" | "practice" | "platform";
}

export const SKILL_DICTIONARY: readonly SkillEntry[] = [
  // Languages
  { name: "typescript", aliases: ["ts"], category: "language" },
  { name: "javascript", aliases: ["js", "ecmascript"], category: "language" },
  { name: "python", aliases: [], category: "language" },
  { name: "go", aliases: ["golang"], category: "language" },
  { name: "rust", aliases: [], category: "language" },
  { name: "java", aliases: [], category: "language" },
  { name: "kotlin", aliases: [], category: "language" },
  { name: "swift", aliases: [], category: "language" },
  { name: "c++", aliases: ["cpp"], category: "language" },
  { name: "c#", aliases: ["csharp", ".net", "dotnet"], category: "language" },
  { name: "ruby", aliases: ["ruby on rails", "rails"], category: "language" },
  { name: "php", aliases: [], category: "language" },
  { name: "scala", aliases: [], category: "language" },
  { name: "elixir", aliases: [], category: "language" },
  { name: "sql", aliases: [], category: "language" },
  // Frontend
  { name: "react", aliases: ["react.js", "reactjs"], category: "frontend" },
  { name: "vue", aliases: ["vue.js", "vuejs"], category: "frontend" },
  { name: "angular", aliases: [], category: "frontend" },
  { name: "svelte", aliases: ["sveltekit"], category: "frontend" },
  { name: "next.js", aliases: ["nextjs"], category: "frontend" },
  { name: "css", aliases: ["scss", "sass", "tailwind", "tailwindcss"], category: "frontend" },
  { name: "html", aliases: [], category: "frontend" },
  // Backend / runtime
  { name: "node.js", aliases: ["node", "nodejs"], category: "backend" },
  { name: "django", aliases: [], category: "backend" },
  { name: "flask", aliases: [], category: "backend" },
  { name: "fastapi", aliases: [], category: "backend" },
  { name: "spring", aliases: ["spring boot"], category: "backend" },
  { name: "graphql", aliases: [], category: "backend" },
  { name: "grpc", aliases: [], category: "backend" },
  { name: "rest apis", aliases: ["rest", "restful"], category: "backend" },
  { name: "microservices", aliases: ["micro-services"], category: "backend" },
  { name: "distributed systems", aliases: [], category: "backend" },
  // Infra
  { name: "kubernetes", aliases: ["k8s"], category: "infra" },
  { name: "docker", aliases: ["containers", "containerization"], category: "infra" },
  { name: "aws", aliases: ["amazon web services"], category: "infra" },
  { name: "gcp", aliases: ["google cloud", "google cloud platform"], category: "infra" },
  { name: "azure", aliases: [], category: "infra" },
  { name: "terraform", aliases: ["infrastructure as code", "iac"], category: "infra" },
  { name: "ci/cd", aliases: ["cicd", "continuous integration", "continuous delivery"], category: "infra" },
  { name: "linux", aliases: [], category: "infra" },
  { name: "observability", aliases: ["monitoring", "prometheus", "grafana"], category: "infra" },
  // Data
  { name: "postgresql", aliases: ["postgres"], category: "data" },
  { name: "mysql", aliases: [], category: "data" },
  { name: "mongodb", aliases: ["mongo"], category: "data" },
  { name: "redis", aliases: [], category: "data" },
  { name: "kafka", aliases: ["apache kafka"], category: "data" },
  { name: "elasticsearch", aliases: ["opensearch"], category: "data" },
  { name: "data pipelines", aliases: ["data-pipelines", "etl"], category: "data" },
  { name: "machine learning", aliases: ["ml", "deep learning"], category: "data" },
  { name: "llms", aliases: ["llm", "large language models", "generative ai", "genai"], category: "data" },
  // Practices
  { name: "testing", aliases: ["tdd", "unit testing", "integration testing"], category: "practice" },
  { name: "agile", aliases: ["scrum"], category: "practice" },
  { name: "performance", aliases: ["performance optimization", "performance tuning"], category: "practice" },
  { name: "security", aliases: ["application security", "appsec"], category: "practice" },
  { name: "migration", aliases: ["migrations"], category: "practice" },
  { name: "cli", aliases: ["command line", "command-line tools"], category: "platform" },
];

export interface SkillLookup {
  /** alias/name (lowercase) → canonical name */
  byAlias: ReadonlyMap<string, string>;
  byName: ReadonlyMap<string, SkillEntry>;
}

let lookup: SkillLookup | null = null;

export function skillLookup(): SkillLookup {
  if (lookup) return lookup;
  const byAlias = new Map<string, string>();
  const byName = new Map<string, SkillEntry>();
  for (const entry of SKILL_DICTIONARY) {
    byName.set(entry.name, entry);
    byAlias.set(entry.name, entry.name);
    for (const alias of entry.aliases) byAlias.set(alias, entry.name);
  }
  lookup = { byAlias, byName };
  return lookup;
}

/** Canonical form of a skill mention; unknown skills normalize to lowercase. */
export function canonicalizeSkill(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  return skillLookup().byAlias.get(normalized) ?? normalized;
}
