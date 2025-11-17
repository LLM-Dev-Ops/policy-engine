/**
 * PII (Personally Identifiable Information) Detector
 */

export interface PIIMatch {
  type: PIIType;
  value: string;
  start: number;
  end: number;
  confidence: 'low' | 'medium' | 'high';
}

export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'name'
  | 'address'
  | 'date_of_birth';

export class PIIDetector {
  // Regex patterns for PII detection
  private patterns: Record<PIIType, RegExp> = {
    email: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
    phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    credit_card: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Simple name pattern (First Last)
    address: /\b\d+\s+[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir)\b/gi,
    date_of_birth: /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(?:\d{2,4}[-/]\d{1,2}[-/]\d{1,2})\b/g,
  };

  /**
   * Detect PII in text
   */
  detectPII(text: string): PIIMatch[] {
    const matches: PIIMatch[] = [];

    for (const [type, pattern] of Object.entries(this.patterns)) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          type: type as PIIType,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: this.getConfidence(type as PIIType, match[0]),
        });
      }
    }

    return matches;
  }

  /**
   * Check if text contains PII
   */
  containsPII(text: string): boolean {
    return this.detectPII(text).length > 0;
  }

  /**
   * Redact PII from text
   */
  redactPII(text: string, redactionChar: string = '*'): string {
    const matches = this.detectPII(text)
      .sort((a, b) => b.start - a.start); // Sort in reverse order to maintain indices

    let redactedText = text;

    for (const match of matches) {
      const redaction = redactionChar.repeat(match.value.length);
      redactedText =
        redactedText.substring(0, match.start) +
        redaction +
        redactedText.substring(match.end);
    }

    return redactedText;
  }

  /**
   * Redact PII with type labels
   */
  redactPIIWithLabels(text: string): string {
    const matches = this.detectPII(text)
      .sort((a, b) => b.start - a.start);

    let redactedText = text;

    for (const match of matches) {
      const redaction = `[${match.type.toUpperCase()}_REDACTED]`;
      redactedText =
        redactedText.substring(0, match.start) +
        redaction +
        redactedText.substring(match.end);
    }

    return redactedText;
  }

  /**
   * Get confidence level for a match
   */
  private getConfidence(type: PIIType, value: string): 'low' | 'medium' | 'high' {
    switch (type) {
      case 'email':
        return value.includes('@') && value.includes('.') ? 'high' : 'medium';
      case 'phone':
        return value.replace(/\D/g, '').length === 10 || value.replace(/\D/g, '').length === 11
          ? 'high'
          : 'medium';
      case 'ssn':
        return value.match(/^\d{3}-\d{2}-\d{4}$/) ? 'high' : 'medium';
      case 'credit_card':
        return this.luhnCheck(value.replace(/\D/g, '')) ? 'high' : 'low';
      case 'ip_address':
        return this.isValidIP(value) ? 'high' : 'low';
      case 'name':
        return 'low'; // Name patterns are less reliable
      case 'address':
        return 'medium';
      case 'date_of_birth':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Luhn algorithm for credit card validation
   */
  private luhnCheck(cardNumber: string): boolean {
    let sum = 0;
    let isEven = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Validate IP address
   */
  private isValidIP(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;

    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
}
