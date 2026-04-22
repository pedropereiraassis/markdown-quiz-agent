export interface SourceUrlPromptApi {
  promptText(options: SourceUrlPromptOptions): Promise<string>;
}

export interface SourceUrlPromptOptions {
  message: string;
  placeholder?: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}

export function validateSourceUrlInput(
  value: string | undefined,
): string | undefined {
  const trimmedValue = value?.trim() ?? "";

  if (trimmedValue.length === 0) {
    return "Enter a Markdown URL to continue.";
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    return "Enter a valid absolute http:// or https:// URL.";
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return "Enter a valid absolute http:// or https:// URL.";
  }

  return undefined;
}

export async function promptSourceUrl(
  promptApi: SourceUrlPromptApi,
): Promise<string> {
  const sourceUrl = await promptApi.promptText({
    message: "Paste a Markdown URL to build a quiz.",
    placeholder: "https://example.com/guide.md",
    validate: validateSourceUrlInput,
  });

  return sourceUrl.trim();
}
