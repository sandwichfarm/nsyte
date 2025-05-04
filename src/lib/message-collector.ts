import { colors } from "cliffy/ansi/colors.ts";

/**
 * Message type for collector
 */
export type MessageType = "info" | "warning" | "error" | "success" | "relay-rejection" | "connection-error" | "notice";

/**
 * Message categories for organizing output
 */
export enum MessageCategory {
  RELAY = "relay",
  SERVER = "server", 
  FILE = "file",
  EVENT = "event",
  GENERAL = "general",
}

/**
 * Message structure for collector
 */
export interface Message {
  type: MessageType;
  category: MessageCategory;
  content: string;
  target: string;
  count?: number;
  data?: any;
}

/**
 * Summary of message statistics
 */
export interface MessageStats {
  totalByType: Record<MessageType, number>;
  totalByCategory: Record<MessageCategory, number>;
}

/**
 * Message collector for grouping similar messages
 */
export class MessageCollector {
  private messages: Message[] = [];
  private usePrettyFormat = true;
  private fileHashes: Map<string, string> = new Map();
  private eventIds: Map<string, string> = new Map();
  
  /**
   * Create a new message collector
   */
  constructor(pretty = true) {
    this.usePrettyFormat = pretty;
  }
  
  /**
   * Add a message to the collector
   */
  addMessage(type: MessageType, category: MessageCategory, content: string, target: string, data?: any): void {
    const existingIndex = this.messages.findIndex(m => 
      m.type === type && 
      m.category === category && 
      m.content === content && 
      m.target === target
    );
    
    if (existingIndex >= 0) {
      this.messages[existingIndex].count = (this.messages[existingIndex].count || 1) + 1;
      
      if (data) {
        this.messages[existingIndex].data = data;
      }
    } else {
      this.messages.push({ type, category, content, target, count: 1, data });
    }
  }
  
  /**
   * Add a relay rejection message
   */
  addRelayRejection(relay: string, reason: string): void {
    this.addMessage("relay-rejection", MessageCategory.RELAY, reason, relay);
  }
  
  /**
   * Add a connection error message
   */
  addConnectionError(target: string, error: string): void {
    this.addMessage("connection-error", MessageCategory.RELAY, error, target);
  }
  
  /**
   * Add a server error message
   */
  addServerError(server: string, error: string): void {
    this.addMessage("error", MessageCategory.SERVER, error, server);
  }
  
  /**
   * Add a file error message
   */
  addFileError(file: string, error: string): void {
    this.addMessage("error", MessageCategory.FILE, error, file);
  }
  
  /**
   * Add a file success message
   */
  addFileSuccess(file: string, fileHash: string): void {
    this.addMessage("success", MessageCategory.FILE, "Successfully uploaded", file, { hash: fileHash });
    this.fileHashes.set(file, fileHash);
  }
  
  /**
   * Add an event success message
   */
  addEventSuccess(file: string, eventId: string): void {
    this.addMessage("success", MessageCategory.EVENT, "Event published", file, { eventId });
    this.eventIds.set(file, eventId);
  }
  
  /**
   * Add a general notice
   */
  addNotice(message: string, target: string = "system"): void {
    this.addMessage("notice", MessageCategory.GENERAL, message, target);
  }
  
  /**
   * Get file hash by path
   */
  getFileHash(filePath: string): string | undefined {
    return this.fileHashes.get(filePath);
  }
  
  /**
   * Get event ID by file path
   */
  getEventId(filePath: string): string | undefined {
    return this.eventIds.get(filePath);
  }
  
  /**
   * Get all file hashes
   */
  getAllFileHashes(): Map<string, string> {
    return this.fileHashes;
  }
  
  /**
   * Get all event IDs
   */
  getAllEventIds(): Map<string, string> {
    return this.eventIds;
  }
  
  /**
   * Get message statistics
   */
  getStats(): MessageStats {
    const stats: MessageStats = {
      totalByType: {
        "info": 0,
        "warning": 0,
        "error": 0,
        "success": 0,
        "relay-rejection": 0,
        "connection-error": 0,
        "notice": 0
      },
      totalByCategory: {
        [MessageCategory.RELAY]: 0,
        [MessageCategory.SERVER]: 0,
        [MessageCategory.FILE]: 0,
        [MessageCategory.EVENT]: 0,
        [MessageCategory.GENERAL]: 0
      }
    };
    
    for (const message of this.messages) {
      stats.totalByType[message.type] += message.count || 1;
      stats.totalByCategory[message.category] += message.count || 1;
    }
    
    return stats;
  }
  
  /**
   * Get all messages of a specific type
   */
  getMessagesByType(type: MessageType): Message[] {
    return this.messages.filter(m => m.type === type);
  }
  
  /**
   * Get all messages of a specific category
   */
  getMessagesByCategory(category: MessageCategory): Message[] {
    return this.messages.filter(m => m.category === category);
  }
  
  /**
   * Check if there are any messages of a specific type
   */
  hasMessageType(type: MessageType): boolean {
    return this.messages.some(m => m.type === type);
  }
  
  /**
   * Check if there are any messages in a specific category
   */
  hasMessageCategory(category: MessageCategory): boolean {
    return this.messages.some(m => m.category === category);
  }
  
  /**
   * Format a message for display
   */
  private formatMessage(message: Message): string {
    const countInfo = (message.count && message.count > 1) ? ` (${message.count}×)` : "";
    
    if (this.usePrettyFormat) {
      switch (message.type) {
        case "error":
          return `${colors.red("✗")} ${message.target}: ${message.content}${countInfo}`;
        case "warning":
          return `${colors.yellow("!")} ${message.target}: ${message.content}${countInfo}`;
        case "success":
          return `${colors.green("✓")} ${message.target}: ${message.content}${countInfo}`;
        case "relay-rejection":
          return `${colors.yellow("!")} ${message.target}: ${message.content}${countInfo}`;
        case "connection-error":
          return `${colors.red("✗")} ${message.target}: ${message.content}${countInfo}`;
        case "notice":
          return `${colors.cyan("i")} ${message.content}${countInfo}`;
        default:
          return `${colors.cyan("i")} ${message.target}: ${message.content}${countInfo}`;
      }
    } else {
      const typeFormatted = message.type.toUpperCase();
      return `[${typeFormatted}] ${message.category}(${message.target}): ${message.content}${countInfo}`;
    }
  }
  
  /**
   * Print all messages of a specific type with a header
   */
  printMessageType(type: MessageType, header: string): void {
    const messages = this.getMessagesByType(type);
    if (messages.length === 0) {
      return;
    }
    
    console.log(colors.bold(header));
    for (const message of messages) {
      console.log(`  ${this.formatMessage(message)}`);
    }
    console.log("");
  }
  
  /**
   * Print all messages of a specific category with a header
   */
  printMessageCategory(category: MessageCategory, header: string): void {
    const messages = this.getMessagesByCategory(category);
    if (messages.length === 0) {
      return;
    }
    
    console.log(colors.bold(header));
    for (const message of messages) {
      console.log(`  ${this.formatMessage(message)}`);
    }
    console.log("");
  }
  
  /**
   * Print error summary
   */
  printErrorSummary(): void {
    const errors = [
      ...this.getMessagesByType("error"),
      ...this.getMessagesByType("connection-error")
    ];
    
    if (errors.length === 0) {
      return;
    }
    
    console.log(colors.bold(colors.red("Errors")));
    for (const error of errors) {
      console.log(`  ${this.formatMessage(error)}`);
    }
    console.log("");
  }
  
  /**
   * Print relay issues summary
   */
  printRelayIssuesSummary(): void {
    const rejections = this.getMessagesByType("relay-rejection");
    
    if (rejections.length === 0) {
      return;
    }
    
    console.log(colors.bold(colors.yellow("Rejections")));
    for (const rejection of rejections) {
      console.log(`  ${this.formatMessage(rejection)}`);
    }
    console.log("");
  }
  
  /**
   * Print notices
   */
  printNotices(): void {
    const notices = this.getMessagesByType("notice");
    
    if (notices.length === 0) {
      return;
    }
    
    console.log(colors.bold(colors.cyan("Other Notices")));
    for (const notice of notices) {
      console.log(`  ${this.formatMessage(notice)}`);
    }
    console.log("");
  }
  
  /**
   * Print all grouped messages in the requested format
   */
  printAllGroupedMessages(): void {
    this.printRelayIssuesSummary();
    this.printErrorSummary();
    this.printNotices();
  }
  
  /**
   * Print file success summary with hashes
   */
  printFileSuccessSummary(): void {
    const fileSuccesses = this.getMessagesByCategory(MessageCategory.FILE)
      .filter(m => m.type === "success");
    
    if (fileSuccesses.length === 0) {
      return;
    }
    
    for (const file of fileSuccesses) {
      const hash = file.data?.hash ? file.data.hash.substring(0, 10) + "..." : "";
      if (hash) {
        console.log(`  ${colors.green("✓")} ${file.target} (${hash})`);
      } else {
        console.log(`  ${colors.green("✓")} ${file.target}`);
      }
    }
  }
  
  /**
   * Print event success summary with IDs
   */
  printEventSuccessSummary(): void {
    const eventSuccesses = this.getMessagesByCategory(MessageCategory.EVENT)
      .filter(m => m.type === "success");
    
    if (eventSuccesses.length === 0) {
      return;
    }
    
    for (const event of eventSuccesses) {
      const eventId = event.data?.eventId ? event.data.eventId.substring(0, 10) + "..." : "";
      if (eventId) {
        console.log(`  ${colors.green("✓")} ${event.target} (${eventId})`);
      } else {
        console.log(`  ${colors.green("✓")} ${event.target}`);
      }
    }
  }
  
  /**
   * Clear all collected messages
   */
  clear(): void {
    this.messages = [];
    this.fileHashes.clear();
    this.eventIds.clear();
  }
} 