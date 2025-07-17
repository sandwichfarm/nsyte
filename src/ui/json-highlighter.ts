import { colors } from "@cliffy/ansi/colors";

/**
 * Simple JSON syntax highlighter
 */
export function highlightJson(json: string): string {
  let result = '';
  let i = 0;
  
  while (i < json.length) {
    const char = json[i];
    
    // Handle strings
    if (char === '"') {
      let stringEnd = i + 1;
      let escaped = false;
      
      // Find the end of the string
      while (stringEnd < json.length) {
        if (json[stringEnd] === '\\' && !escaped) {
          escaped = true;
          stringEnd++;
          continue;
        }
        if (json[stringEnd] === '"' && !escaped) {
          break;
        }
        escaped = false;
        stringEnd++;
      }
      
      const fullString = json.substring(i, stringEnd + 1);
      
      // Check if this is a key (followed by colon after whitespace)
      let nextNonWhitespace = stringEnd + 1;
      while (nextNonWhitespace < json.length && /\s/.test(json[nextNonWhitespace])) {
        nextNonWhitespace++;
      }
      
      const isKey = nextNonWhitespace < json.length && json[nextNonWhitespace] === ':';
      result += isKey ? colors.cyan(fullString) : colors.green(fullString);
      i = stringEnd + 1;
    }
    // Handle numbers
    else if (/\d/.test(char) || (char === '-' && i + 1 < json.length && /\d/.test(json[i + 1]))) {
      let numEnd = i;
      if (char === '-') numEnd++;
      
      while (numEnd < json.length && /[\d.eE+-]/.test(json[numEnd])) {
        numEnd++;
      }
      
      const number = json.substring(i, numEnd);
      result += colors.yellow(number);
      i = numEnd;
    }
    // Handle keywords
    else if (/[a-z]/.test(char)) {
      let wordEnd = i;
      while (wordEnd < json.length && /[a-z]/.test(json[wordEnd])) {
        wordEnd++;
      }
      
      const word = json.substring(i, wordEnd);
      if (word === 'true' || word === 'false') {
        result += colors.magenta(word);
      } else if (word === 'null') {
        result += colors.gray(word);
      } else {
        result += word;
      }
      i = wordEnd;
    }
    // Handle structural characters
    else if ('{}[]'.includes(char)) {
      result += colors.gray(char);
      i++;
    }
    else if (':,'.includes(char)) {
      result += colors.gray(char);
      i++;
    }
    // Handle everything else (whitespace, etc.)
    else {
      result += char;
      i++;
    }
  }
  
  return result;
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