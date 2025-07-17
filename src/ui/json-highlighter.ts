import { colors } from "@cliffy/ansi/colors";

/**
 * Simple JSON syntax highlighter
 */
export function highlightJson(json: string): string {
  // Match strings (including keys)
  json = json.replace(/"([^"\\]|\\.)*"/g, (match) => {
    // Check if this is a key (followed by colon)
    const isKey = json.indexOf(match) >= 0 && 
                  json[json.indexOf(match) + match.length]?.trim() === ':';
    return isKey ? colors.cyan(match) : colors.green(match);
  });
  
  // Match numbers
  json = json.replace(/\b-?\d+\.?\d*([eE][+-]?\d+)?\b/g, colors.yellow);
  
  // Match booleans
  json = json.replace(/\b(true|false)\b/g, colors.magenta);
  
  // Match null
  json = json.replace(/\bnull\b/g, colors.gray);
  
  // Highlight brackets and braces
  json = json.replace(/[{}[\]]/g, colors.gray);
  
  // Highlight colons and commas
  json = json.replace(/[:,"]/g, colors.gray);
  
  return json;
}

/**
 * Add line numbers to text
 */
export function addLineNumbers(text: string, startLine: number = 1): string {
  const lines = text.split('\n');
  const maxLineNum = startLine + lines.length - 1;
  const lineNumWidth = maxLineNum.toString().length;
  
  return lines.map((line, index) => {
    const lineNum = (startLine + index).toString().padStart(lineNumWidth, ' ');
    return colors.gray(`${lineNum} │`) + ' ' + line;
  }).join('\n');
}