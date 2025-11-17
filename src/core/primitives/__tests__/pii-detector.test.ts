/**
 * Comprehensive Unit Tests for PIIDetector
 * Enterprise-grade test coverage for PII detection and redaction
 * Target: 80%+ coverage
 */
import { PIIDetector, PIIMatch, PIIType } from '../pii-detector';

describe('PIIDetector', () => {
  let detector: PIIDetector;

  beforeEach(() => {
    detector = new PIIDetector();
  });

  describe('detectPII', () => {
    describe('Email Detection', () => {
      it('should detect valid email addresses', () => {
        const text = 'Contact us at support@example.com for help';
        const matches = detector.detectPII(text);

        expect(matches.length).toBe(1);
        expect(matches[0].type).toBe('email');
        expect(matches[0].value).toBe('support@example.com');
        expect(matches[0].start).toBe(14);
        expect(matches[0].confidence).toBe('high');
      });

      it('should detect multiple email addresses', () => {
        const text = 'Send to john@doe.com or jane.smith@company.co.uk';
        const matches = detector.detectPII(text);

        const emailMatches = matches.filter((m) => m.type === 'email');
        expect(emailMatches.length).toBe(2);
        expect(emailMatches[0].value).toBe('john@doe.com');
        expect(emailMatches[1].value).toBe('jane.smith@company.co.uk');
      });

      it('should detect emails with plus addressing', () => {
        const text = 'My email is user+tag@example.com';
        const matches = detector.detectPII(text);

        const emailMatches = matches.filter((m) => m.type === 'email');
        expect(emailMatches.length).toBe(1);
        expect(emailMatches[0].value).toBe('user+tag@example.com');
      });

      it('should detect emails with numbers and underscores', () => {
        const text = 'Contact: user_123@test-domain.io';
        const matches = detector.detectPII(text);

        const emailMatches = matches.filter((m) => m.type === 'email');
        expect(emailMatches.length).toBe(1);
        expect(emailMatches[0].value).toBe('user_123@test-domain.io');
      });
    });

    describe('Phone Number Detection', () => {
      it('should detect US phone numbers with dashes', () => {
        const text = 'Call me at 555-123-4567';
        const matches = detector.detectPII(text);

        const phoneMatches = matches.filter((m) => m.type === 'phone');
        expect(phoneMatches.length).toBe(1);
        expect(phoneMatches[0].value).toBe('555-123-4567');
      });

      it('should detect phone numbers with dots', () => {
        const text = 'Phone: 555.123.4567';
        const matches = detector.detectPII(text);

        const phoneMatches = matches.filter((m) => m.type === 'phone');
        expect(phoneMatches.length).toBe(1);
        expect(phoneMatches[0].value).toBe('555.123.4567');
      });

      it('should detect phone numbers with spaces', () => {
        const text = 'Call 555 123 4567';
        const matches = detector.detectPII(text);

        const phoneMatches = matches.filter((m) => m.type === 'phone');
        expect(phoneMatches.length).toBe(1);
      });

      it('should detect phone numbers with parentheses', () => {
        const text = 'Contact: (555) 123-4567';
        const matches = detector.detectPII(text);

        const phoneMatches = matches.filter((m) => m.type === 'phone');
        expect(phoneMatches.length).toBe(1);
      });

      it('should detect international phone numbers', () => {
        const text = 'International: +1-555-123-4567';
        const matches = detector.detectPII(text);

        const phoneMatches = matches.filter((m) => m.type === 'phone');
        expect(phoneMatches.length).toBe(1);
        expect(phoneMatches[0].value).toContain('+1');
      });

      it('should assign high confidence to 10-digit US numbers', () => {
        const text = '5551234567';
        const matches = detector.detectPII(text);

        const phoneMatches = matches.filter((m) => m.type === 'phone');
        expect(phoneMatches[0].confidence).toBe('high');
      });
    });

    describe('SSN Detection', () => {
      it('should detect valid SSN format', () => {
        const text = 'My SSN is 123-45-6789';
        const matches = detector.detectPII(text);

        const ssnMatches = matches.filter((m) => m.type === 'ssn');
        expect(ssnMatches.length).toBe(1);
        expect(ssnMatches[0].value).toBe('123-45-6789');
        expect(ssnMatches[0].confidence).toBe('high');
      });

      it('should detect multiple SSNs', () => {
        const text = 'SSNs: 123-45-6789 and 987-65-4321';
        const matches = detector.detectPII(text);

        const ssnMatches = matches.filter((m) => m.type === 'ssn');
        expect(ssnMatches.length).toBe(2);
      });

      it('should not detect invalid SSN formats', () => {
        const text = 'Not an SSN: 12-345-6789 or 1234-56-789';
        const matches = detector.detectPII(text);

        const ssnMatches = matches.filter((m) => m.type === 'ssn');
        expect(ssnMatches.length).toBe(0);
      });
    });

    describe('Credit Card Detection', () => {
      it('should detect credit card numbers with dashes', () => {
        const text = 'Card: 4532-1234-5678-9010';
        const matches = detector.detectPII(text);

        const cardMatches = matches.filter((m) => m.type === 'credit_card');
        expect(cardMatches.length).toBe(1);
        expect(cardMatches[0].value).toBe('4532-1234-5678-9010');
      });

      it('should detect credit card numbers with spaces', () => {
        const text = 'Card: 4532 1234 5678 9010';
        const matches = detector.detectPII(text);

        const cardMatches = matches.filter((m) => m.type === 'credit_card');
        expect(cardMatches.length).toBe(1);
      });

      it('should detect credit card numbers without separators', () => {
        const text = 'Card: 4532123456789010';
        const matches = detector.detectPII(text);

        const cardMatches = matches.filter((m) => m.type === 'credit_card');
        expect(cardMatches.length).toBe(1);
      });

      it('should use Luhn algorithm for validation', () => {
        // Valid Luhn: 4532015112830366
        const validText = 'Valid card: 4532015112830366';
        const validMatches = detector.detectPII(validText);
        const validCardMatch = validMatches.find((m) => m.type === 'credit_card');
        expect(validCardMatch?.confidence).toBe('high');

        // Invalid Luhn: 4532015112830367
        const invalidText = 'Invalid card: 4532015112830367';
        const invalidMatches = detector.detectPII(invalidText);
        const invalidCardMatch = invalidMatches.find((m) => m.type === 'credit_card');
        expect(invalidCardMatch?.confidence).toBe('low');
      });
    });

    describe('IP Address Detection', () => {
      it('should detect valid IPv4 addresses', () => {
        const text = 'Server IP: 192.168.1.1';
        const matches = detector.detectPII(text);

        const ipMatches = matches.filter((m) => m.type === 'ip_address');
        expect(ipMatches.length).toBe(1);
        expect(ipMatches[0].value).toBe('192.168.1.1');
        expect(ipMatches[0].confidence).toBe('high');
      });

      it('should detect public IP addresses', () => {
        const text = 'Public IP: 8.8.8.8';
        const matches = detector.detectPII(text);

        const ipMatches = matches.filter((m) => m.type === 'ip_address');
        expect(ipMatches.length).toBe(1);
        expect(ipMatches[0].value).toBe('8.8.8.8');
      });

      it('should detect localhost addresses', () => {
        const text = 'Localhost: 127.0.0.1';
        const matches = detector.detectPII(text);

        const ipMatches = matches.filter((m) => m.type === 'ip_address');
        expect(ipMatches.length).toBe(1);
        expect(ipMatches[0].value).toBe('127.0.0.1');
      });

      it('should assign low confidence to invalid IPs', () => {
        const text = 'Invalid: 256.300.1.1';
        const matches = detector.detectPII(text);

        const ipMatches = matches.filter((m) => m.type === 'ip_address');
        if (ipMatches.length > 0) {
          expect(ipMatches[0].confidence).toBe('low');
        }
      });
    });

    describe('Name Detection', () => {
      it('should detect simple first and last names', () => {
        const text = 'Hello, my name is John Doe';
        const matches = detector.detectPII(text);

        const nameMatches = matches.filter((m) => m.type === 'name');
        expect(nameMatches.length).toBeGreaterThan(0);
        expect(nameMatches[0].value).toBe('John Doe');
        expect(nameMatches[0].confidence).toBe('low'); // Names have low confidence
      });

      it('should detect multiple names', () => {
        const text = 'Meeting with Jane Smith and Bob Johnson';
        const matches = detector.detectPII(text);

        const nameMatches = matches.filter((m) => m.type === 'name');
        expect(nameMatches.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Address Detection', () => {
      it('should detect street addresses', () => {
        const text = 'I live at 123 Main Street';
        const matches = detector.detectPII(text);

        const addressMatches = matches.filter((m) => m.type === 'address');
        expect(addressMatches.length).toBe(1);
        expect(addressMatches[0].value).toContain('123 Main Street');
        expect(addressMatches[0].confidence).toBe('medium');
      });

      it('should detect various street types', () => {
        const addresses = [
          '456 Oak Avenue',
          '789 Pine Road',
          '101 Maple Boulevard',
          '202 Elm Lane',
          '303 Cedar Drive',
          '404 Birch Court',
        ];

        addresses.forEach((addr) => {
          const matches = detector.detectPII(`Address: ${addr}`);
          const addressMatches = matches.filter((m) => m.type === 'address');
          expect(addressMatches.length).toBeGreaterThan(0);
        });
      });

      it('should handle abbreviated street types', () => {
        const text = '123 Main St, 456 Oak Ave, 789 Pine Rd';
        const matches = detector.detectPII(text);

        const addressMatches = matches.filter((m) => m.type === 'address');
        expect(addressMatches.length).toBeGreaterThan(0);
      });
    });

    describe('Date of Birth Detection', () => {
      it('should detect dates in MM/DD/YYYY format', () => {
        const text = 'Born on 12/25/1990';
        const matches = detector.detectPII(text);

        const dobMatches = matches.filter((m) => m.type === 'date_of_birth');
        expect(dobMatches.length).toBe(1);
        expect(dobMatches[0].value).toBe('12/25/1990');
      });

      it('should detect dates in DD-MM-YYYY format', () => {
        const text = 'DOB: 25-12-1990';
        const matches = detector.detectPII(text);

        const dobMatches = matches.filter((m) => m.type === 'date_of_birth');
        expect(dobMatches.length).toBe(1);
      });

      it('should detect dates in YYYY/MM/DD format', () => {
        const text = 'Birthday: 1990/12/25';
        const matches = detector.detectPII(text);

        const dobMatches = matches.filter((m) => m.type === 'date_of_birth');
        expect(dobMatches.length).toBe(1);
      });

      it('should detect dates with 2-digit years', () => {
        const text = 'DOB: 12/25/90';
        const matches = detector.detectPII(text);

        const dobMatches = matches.filter((m) => m.type === 'date_of_birth');
        expect(dobMatches.length).toBe(1);
      });
    });

    describe('Multiple PII Types', () => {
      it('should detect multiple PII types in one text', () => {
        const text = `
          Contact: john.doe@example.com
          Phone: 555-123-4567
          SSN: 123-45-6789
          Card: 4532-1234-5678-9010
        `;
        const matches = detector.detectPII(text);

        expect(matches.length).toBeGreaterThanOrEqual(4);

        const types = new Set(matches.map((m) => m.type));
        expect(types.has('email')).toBe(true);
        expect(types.has('phone')).toBe(true);
        expect(types.has('ssn')).toBe(true);
        expect(types.has('credit_card')).toBe(true);
      });

      it('should correctly report positions for multiple PIIs', () => {
        const text = 'Email: test@example.com, Phone: 555-1234567';
        const matches = detector.detectPII(text);

        expect(matches.length).toBeGreaterThanOrEqual(2);

        matches.forEach((match) => {
          expect(match.start).toBeGreaterThanOrEqual(0);
          expect(match.end).toBeGreaterThan(match.start);
          expect(text.substring(match.start, match.end)).toBe(match.value);
        });
      });
    });
  });

  describe('containsPII', () => {
    it('should return true when PII is present', () => {
      const text = 'My email is test@example.com';
      expect(detector.containsPII(text)).toBe(true);
    });

    it('should return false when no PII is present', () => {
      const text = 'This is a completely clean text with no personal information';
      expect(detector.containsPII(text)).toBe(false);
    });

    it('should detect any type of PII', () => {
      expect(detector.containsPII('Email: user@test.com')).toBe(true);
      expect(detector.containsPII('Phone: 555-123-4567')).toBe(true);
      expect(detector.containsPII('SSN: 123-45-6789')).toBe(true);
      expect(detector.containsPII('IP: 192.168.1.1')).toBe(true);
    });
  });

  describe('redactPII', () => {
    it('should redact email addresses with asterisks', () => {
      const text = 'Contact us at support@example.com';
      const redacted = detector.redactPII(text);

      expect(redacted).not.toContain('support@example.com');
      expect(redacted).toContain('*');
      expect(redacted.match(/\*/g)?.length).toBe('support@example.com'.length);
    });

    it('should redact multiple PII instances', () => {
      const text = 'Email: test@example.com, Phone: 555-1234567';
      const redacted = detector.redactPII(text);

      expect(redacted).not.toContain('test@example.com');
      expect(redacted).not.toContain('555-1234567');
      expect(redacted).toContain('*');
    });

    it('should use custom redaction character', () => {
      const text = 'SSN: 123-45-6789';
      const redacted = detector.redactPII(text, 'X');

      expect(redacted).not.toContain('123-45-6789');
      expect(redacted).toContain('X');
      expect(redacted).not.toContain('*');
    });

    it('should preserve non-PII text', () => {
      const text = 'Hello, my email is test@example.com and I love pizza';
      const redacted = detector.redactPII(text);

      expect(redacted).toContain('Hello');
      expect(redacted).toContain('and I love pizza');
      expect(redacted).not.toContain('test@example.com');
    });

    it('should handle text with no PII', () => {
      const text = 'This text contains no personal information';
      const redacted = detector.redactPII(text);

      expect(redacted).toBe(text);
    });

    it('should correctly redact overlapping positions', () => {
      const text = 'test@example.com and 555-123-4567';
      const redacted = detector.redactPII(text);

      expect(redacted).toContain('and');
      expect(redacted.split('and').length).toBe(2);
    });

    it('should handle consecutive PII', () => {
      const text = 'test@example.com555-123-4567';
      const redacted = detector.redactPII(text);

      expect(redacted).not.toContain('test@example.com');
      expect(redacted).not.toContain('555-123-4567');
    });
  });

  describe('redactPIIWithLabels', () => {
    it('should redact email with EMAIL label', () => {
      const text = 'Contact: test@example.com';
      const redacted = detector.redactPIIWithLabels(text);

      expect(redacted).toContain('[EMAIL_REDACTED]');
      expect(redacted).not.toContain('test@example.com');
    });

    it('should redact phone with PHONE label', () => {
      const text = 'Call: 555-123-4567';
      const redacted = detector.redactPIIWithLabels(text);

      expect(redacted).toContain('[PHONE_REDACTED]');
      expect(redacted).not.toContain('555-123-4567');
    });

    it('should use appropriate labels for each PII type', () => {
      const text = `
        Email: test@example.com
        Phone: 555-123-4567
        SSN: 123-45-6789
      `;
      const redacted = detector.redactPIIWithLabels(text);

      expect(redacted).toContain('[EMAIL_REDACTED]');
      expect(redacted).toContain('[PHONE_REDACTED]');
      expect(redacted).toContain('[SSN_REDACTED]');
    });

    it('should preserve non-PII content', () => {
      const text = 'Hello test@example.com, how are you?';
      const redacted = detector.redactPIIWithLabels(text);

      expect(redacted).toContain('Hello');
      expect(redacted).toContain('how are you?');
      expect(redacted).toContain('[EMAIL_REDACTED]');
    });

    it('should handle multiple instances of same PII type', () => {
      const text = 'Emails: test1@example.com and test2@example.com';
      const redacted = detector.redactPIIWithLabels(text);

      expect(redacted).toContain('[EMAIL_REDACTED]');
      expect((redacted.match(/\[EMAIL_REDACTED\]/g) || []).length).toBe(2);
    });
  });

  describe('Position Tracking', () => {
    it('should track correct start and end positions', () => {
      const text = 'My email is test@example.com, thanks!';
      const matches = detector.detectPII(text);

      const emailMatch = matches.find((m) => m.type === 'email');
      expect(emailMatch).toBeDefined();
      expect(emailMatch!.start).toBe(12);
      expect(emailMatch!.end).toBe(28);
      expect(text.substring(emailMatch!.start, emailMatch!.end)).toBe('test@example.com');
    });

    it('should track positions for multiple matches', () => {
      const text = 'First: test1@example.com Second: test2@example.com';
      const matches = detector.detectPII(text);

      const emailMatches = matches.filter((m) => m.type === 'email');
      expect(emailMatches.length).toBe(2);

      emailMatches.forEach((match) => {
        const extracted = text.substring(match.start, match.end);
        expect(extracted).toBe(match.value);
      });
    });
  });

  describe('Confidence Levels', () => {
    it('should assign high confidence to well-formed emails', () => {
      const text = 'user@example.com';
      const matches = detector.detectPII(text);

      const emailMatch = matches.find((m) => m.type === 'email');
      expect(emailMatch?.confidence).toBe('high');
    });

    it('should assign medium confidence to addresses', () => {
      const text = '123 Main Street';
      const matches = detector.detectPII(text);

      const addressMatch = matches.find((m) => m.type === 'address');
      expect(addressMatch?.confidence).toBe('medium');
    });

    it('should assign low confidence to name patterns', () => {
      const text = 'John Doe';
      const matches = detector.detectPII(text);

      const nameMatch = matches.find((m) => m.type === 'name');
      expect(nameMatch?.confidence).toBe('low');
    });

    it('should use Luhn check for credit card confidence', () => {
      // This is a valid Luhn number
      const validCard = '4532015112830366';
      const validMatches = detector.detectPII(validCard);
      const validMatch = validMatches.find((m) => m.type === 'credit_card');
      expect(validMatch?.confidence).toBe('high');

      // This fails Luhn check
      const invalidCard = '4532015112830367';
      const invalidMatches = detector.detectPII(invalidCard);
      const invalidMatch = invalidMatches.find((m) => m.type === 'credit_card');
      expect(invalidMatch?.confidence).toBe('low');
    });

    it('should validate IP address octets for confidence', () => {
      const validIP = '192.168.1.1';
      const validMatches = detector.detectPII(validIP);
      const validMatch = validMatches.find((m) => m.type === 'ip_address');
      expect(validMatch?.confidence).toBe('high');

      const invalidIP = '256.300.400.500';
      const invalidMatches = detector.detectPII(invalidIP);
      const invalidMatch = invalidMatches.find((m) => m.type === 'ip_address');
      if (invalidMatch) {
        expect(invalidMatch.confidence).toBe('low');
      }
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle customer support transcript', () => {
      const transcript = `
        Customer: Hi, my name is Jane Smith
        Agent: Hello! How can I help you?
        Customer: I need to update my email from old@example.com to new@example.com
        Customer: My account is linked to phone 555-123-4567
        Agent: I'll need to verify your SSN: 123-45-6789
      `;

      const matches = detector.detectPII(transcript);
      expect(matches.length).toBeGreaterThan(4);

      const redacted = detector.redactPIIWithLabels(transcript);
      expect(redacted).toContain('[EMAIL_REDACTED]');
      expect(redacted).toContain('[PHONE_REDACTED]');
      expect(redacted).toContain('[SSN_REDACTED]');
      expect(redacted).toContain('[NAME_REDACTED]');
    });

    it('should handle medical record snippet', () => {
      const record = `
        Patient: John Doe
        DOB: 01/15/1980
        SSN: 987-65-4321
        Address: 456 Oak Avenue
        Phone: (555) 987-6543
        Email: patient@email.com
      `;

      const matches = detector.detectPII(record);
      expect(matches.length).toBeGreaterThanOrEqual(5);

      const types = new Set(matches.map((m) => m.type));
      expect(types.size).toBeGreaterThanOrEqual(5);
    });

    it('should handle financial document', () => {
      const document = `
        Cardholder: Alice Johnson
        Card Number: 4532-0151-1283-0366
        Billing Address: 789 Pine Road
        Email: billing@example.com
        Phone: 555-111-2222
      `;

      const redacted = detector.redactPIIWithLabels(document);

      expect(redacted).not.toContain('4532-0151-1283-0366');
      expect(redacted).not.toContain('billing@example.com');
      expect(redacted).not.toContain('555-111-2222');
      expect(redacted).toContain('[CREDIT_CARD_REDACTED]');
      expect(redacted).toContain('[EMAIL_REDACTED]');
    });

    it('should handle log file with IP addresses', () => {
      const log = `
        [2025-01-15 10:30:45] Request from 192.168.1.100
        [2025-01-15 10:30:46] User login: user@example.com
        [2025-01-15 10:30:47] Connection from 10.0.0.5
      `;

      const matches = detector.detectPII(log);
      const ipMatches = matches.filter((m) => m.type === 'ip_address');
      const emailMatches = matches.filter((m) => m.type === 'email');

      expect(ipMatches.length).toBeGreaterThanOrEqual(2);
      expect(emailMatches.length).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const matches = detector.detectPII('');
      expect(matches).toEqual([]);
      expect(detector.containsPII('')).toBe(false);
      expect(detector.redactPII('')).toBe('');
    });

    it('should handle very long text', () => {
      const longText = 'word '.repeat(10000) + 'test@example.com ' + 'word '.repeat(10000);
      const matches = detector.detectPII(longText);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m) => m.type === 'email')).toBe(true);
    });

    it('should handle special characters', () => {
      const text = '!@#$%^&*()_+ test@example.com []{}|\\:";\'<>?,./';
      const matches = detector.detectPII(text);

      const emailMatch = matches.find((m) => m.type === 'email');
      expect(emailMatch?.value).toBe('test@example.com');
    });

    it('should handle unicode characters', () => {
      const text = 'Contact: tëst@éxample.com 📧';
      const matches = detector.detectPII(text);

      expect(matches.length).toBeGreaterThan(0);
    });

    it('should handle malformed PII patterns', () => {
      const text = '@example.com 555- -45-6789';
      const matches = detector.detectPII(text);

      // Should be resilient and not crash
      expect(Array.isArray(matches)).toBe(true);
    });
  });
});
