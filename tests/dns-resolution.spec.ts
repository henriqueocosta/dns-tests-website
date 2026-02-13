import { test, expect } from '@playwright/test';
import dns from 'dns';
import { promisify } from 'util';
import { Resolver } from 'dns';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const resolveCname = promisify(dns.resolveCname);
const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);
const resolveNs = promisify(dns.resolveNs);

// DNSSEC Algorithm names
const DNSSEC_ALGORITHMS: Record<number, string> = {
  5: 'RSA/SHA-1',
  7: 'RSASHA1-NSEC3-SHA1',
  8: 'RSA/SHA-256',
  10: 'RSA/SHA-512',
  13: 'ECDSA/P-256/SHA-256',
  14: 'ECDSA/P-384/SHA-384',
  15: 'Ed25519',
  16: 'Ed448',
};

// Helper to query DNSSEC records using dig command
async function queryDNSSEC(domain: string, recordType: string): Promise<string> {
  const { exec } = await import('child_process');
  return new Promise((resolve, reject) => {
    exec(`dig ${domain} ${recordType} +short`, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

async function queryDNSSECFull(domain: string, recordType: string): Promise<string> {
  const { exec } = await import('child_process');
  return new Promise((resolve, reject) => {
    exec(`dig ${domain} ${recordType} +dnssec +noall +answer`, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

// Configuration - Update these values for your domain
const TEST_DOMAIN = process.env.TEST_DOMAIN || 'example.com';
const EXPECTED_IP = process.env.EXPECTED_IP || null;
const EXPECTED_CNAME = process.env.EXPECTED_CNAME || null;

test.describe('DNS Record Resolution', () => {
  test('A record resolves to expected IP', async () => {
    test.skip(!EXPECTED_IP, 'EXPECTED_IP not configured');

    const addresses = await resolve4(TEST_DOMAIN);
    expect(addresses).toContain(EXPECTED_IP);
  });

  test('A record exists for domain', async () => {
    try {
      const addresses = await resolve4(TEST_DOMAIN);
      expect(addresses.length).toBeGreaterThan(0);
      console.log(`A record: ${addresses.join(', ')}`);
    } catch (error: any) {
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        test.skip(true, 'No A record found');
      }
      throw error;
    }
  });

  test('AAAA record exists for domain (IPv6)', async () => {
    try {
      const addresses = await resolve6(TEST_DOMAIN);
      expect(addresses.length).toBeGreaterThan(0);
      console.log(`AAAA record: ${addresses.join(', ')}`);
    } catch (error: any) {
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        test.skip(true, 'No AAAA record found (optional)');
      }
      throw error;
    }
  });

  test('CNAME record resolves correctly', async () => {
    test.skip(!EXPECTED_CNAME, 'EXPECTED_CNAME not configured');

    try {
      const cnames = await resolveCname(TEST_DOMAIN);
      expect(cnames).toContain(EXPECTED_CNAME);
    } catch (error: any) {
      if (error.code === 'ENODATA') {
        test.fail(true, 'CNAME record not found');
      }
      throw error;
    }
  });

  test('NS records are configured', async () => {
    const nsRecords = await resolveNs(TEST_DOMAIN);
    expect(nsRecords.length).toBeGreaterThan(0);
    console.log(`NS records: ${nsRecords.join(', ')}`);
  });

  test('MX records exist for email (optional)', async () => {
    try {
      const mxRecords = await resolveMx(TEST_DOMAIN);
      expect(mxRecords.length).toBeGreaterThan(0);
      console.log(`MX records: ${mxRecords.map(r => `${r.priority} ${r.exchange}`).join(', ')}`);
    } catch (error: any) {
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        test.skip(true, 'No MX record found (optional)');
      }
      throw error;
    }
  });

  test('TXT records can be retrieved', async () => {
    try {
      const txtRecords = await resolveTxt(TEST_DOMAIN);
      console.log(`TXT records: ${txtRecords.map(r => r.join('')).join(', ')}`);
      // TXT records are optional, just log them
    } catch (error: any) {
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        test.skip(true, 'No TXT record found (optional)');
      }
      throw error;
    }
  });
});

test.describe('Website Accessibility via DNS', () => {
  test('website is accessible via domain', async ({ page }) => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    const response = await page.goto(`https://${TEST_DOMAIN}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    expect(response?.status()).toBeLessThan(400);
  });

  test('website loads with correct hostname', async ({ page }) => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    await page.goto(`https://${TEST_DOMAIN}`);
    const hostname = await page.evaluate(() => window.location.hostname);
    expect(hostname).toBe(TEST_DOMAIN);
  });

  test('www subdomain redirects or resolves correctly', async ({ page }) => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    const response = await page.goto(`https://www.${TEST_DOMAIN}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Should either load successfully or redirect to apex domain
    expect(response?.status()).toBeLessThan(400);
  });
});

test.describe('DNS Record Validation', () => {
  test('A record returns valid IPv4 format', async () => {
    try {
      const addresses = await resolve4(TEST_DOMAIN);
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

      for (const ip of addresses) {
        expect(ip).toMatch(ipv4Regex);
      }
    } catch (error: any) {
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        test.skip(true, 'No A record found');
      }
      throw error;
    }
  });

  test('AAAA record returns valid IPv6 format', async () => {
    try {
      const addresses = await resolve6(TEST_DOMAIN);
      // IPv6 can have multiple formats, just check it's not empty
      for (const ip of addresses) {
        expect(ip.includes(':')).toBeTruthy();
      }
    } catch (error: any) {
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        test.skip(true, 'No AAAA record found');
      }
      throw error;
    }
  });

  test('MX record has valid priority', async () => {
    try {
      const mxRecords = await resolveMx(TEST_DOMAIN);

      for (const mx of mxRecords) {
        expect(mx.priority).toBeGreaterThanOrEqual(0);
        expect(mx.exchange).toBeTruthy();
      }
    } catch (error: any) {
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        test.skip(true, 'No MX record found');
      }
      throw error;
    }
  });
});

test.describe('Subdomain Tests', () => {
  const subdomains = ['www', 'api', 'mail'];

  for (const subdomain of subdomains) {
    test(`${subdomain} subdomain DNS resolution`, async () => {
      test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

      const fullDomain = `${subdomain}.${TEST_DOMAIN}`;

      try {
        // Try A record first
        const aRecords = await resolve4(fullDomain);
        expect(aRecords.length).toBeGreaterThan(0);
        console.log(`${subdomain}: A record - ${aRecords.join(', ')}`);
      } catch {
        try {
          // Fall back to CNAME
          const cnames = await resolveCname(fullDomain);
          expect(cnames.length).toBeGreaterThan(0);
          console.log(`${subdomain}: CNAME - ${cnames.join(', ')}`);
        } catch (error: any) {
          if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
            test.skip(true, `No record found for ${subdomain} subdomain`);
          }
          throw error;
        }
      }
    });
  }
});

test.describe('DNSSEC Verification', () => {
  test('DNSKEY record exists', async () => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    const dnskey = await queryDNSSEC(TEST_DOMAIN, 'DNSKEY');

    if (!dnskey) {
      test.skip(true, 'DNSSEC not enabled for this domain');
    }

    expect(dnskey.length).toBeGreaterThan(0);
    console.log(`DNSKEY record found`);
  });

  test('DNSKEY has valid algorithm', async () => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    const dnskey = await queryDNSSEC(TEST_DOMAIN, 'DNSKEY');

    if (!dnskey) {
      test.skip(true, 'DNSSEC not enabled for this domain');
    }

    // DNSKEY format: flags protocol algorithm public-key
    // Example: 257 3 13 base64key...
    const lines = dnskey.split('\n');
    for (const line of lines) {
      const parts = line.split(' ');
      if (parts.length >= 3) {
        const flags = parseInt(parts[0]);
        const protocol = parseInt(parts[1]);
        const algorithm = parseInt(parts[2]);

        // Flags should be 256 (ZSK) or 257 (KSK)
        expect([256, 257]).toContain(flags);
        // Protocol should always be 3
        expect(protocol).toBe(3);
        // Algorithm should be a known secure algorithm
        expect(Object.keys(DNSSEC_ALGORITHMS).map(Number)).toContain(algorithm);

        const algoName = DNSSEC_ALGORITHMS[algorithm] || 'Unknown';
        console.log(`DNSKEY: flags=${flags}, algorithm=${algorithm} (${algoName})`);
      }
    }
  });

  test('RRSIG signatures are present', async () => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    const rrsigOutput = await queryDNSSECFull(TEST_DOMAIN, 'A');

    if (!rrsigOutput.includes('RRSIG')) {
      // Try SOA if A doesn't have RRSIG
      const soaOutput = await queryDNSSECFull(TEST_DOMAIN, 'SOA');
      if (!soaOutput.includes('RRSIG')) {
        test.skip(true, 'No RRSIG signatures found');
      }
      expect(soaOutput).toContain('RRSIG');
      console.log('RRSIG signature found for SOA record');
    } else {
      expect(rrsigOutput).toContain('RRSIG');
      console.log('RRSIG signature found for A record');
    }
  });

  test('DNSSEC signatures are valid (not expired)', async () => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    const rrsigOutput = await queryDNSSECFull(TEST_DOMAIN, 'SOA');

    if (!rrsigOutput.includes('RRSIG')) {
      test.skip(true, 'No RRSIG signatures found');
    }

    // RRSIG contains expiration date in format YYYYMMDDHHMMSS
    const expirationMatch = rrsigOutput.match(/(\d{14})\s+(\d{14})\s+(\d+)\s+/);

    if (expirationMatch) {
      const expiration = expirationMatch[1];
      const keyTag = expirationMatch[3];

      const expDate = new Date(
        parseInt(expiration.slice(0, 4)),
        parseInt(expiration.slice(4, 6)) - 1,
        parseInt(expiration.slice(6, 8)),
        parseInt(expiration.slice(8, 10)),
        parseInt(expiration.slice(10, 12)),
        parseInt(expiration.slice(12, 14))
      );

      const now = new Date();
      expect(expDate.getTime()).toBeGreaterThan(now.getTime());

      console.log(`RRSIG key tag: ${keyTag}`);
      console.log(`RRSIG expires: ${expDate.toISOString()}`);
      console.log(`Days until expiration: ${Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))}`);
    }
  });

  test('DNSSEC chain of trust (DS record at parent)', async () => {
    test.skip(TEST_DOMAIN === 'example.com', 'TEST_DOMAIN not configured');

    // Query DS record from parent zone
    const dsOutput = await queryDNSSEC(TEST_DOMAIN, 'DS');

    if (!dsOutput) {
      // DS might not be visible from all resolvers, try with trace
      const dnskeyOutput = await queryDNSSEC(TEST_DOMAIN, 'DNSKEY');
      if (dnskeyOutput) {
        console.log('DNSKEY exists but DS record not directly queryable (may be at parent zone)');
        test.skip(true, 'DS record not directly queryable');
      } else {
        test.skip(true, 'DNSSEC not enabled');
      }
    }

    // DS record format: key-tag algorithm digest-type digest
    const parts = dsOutput.split(' ');
    if (parts.length >= 4) {
      const keyTag = parts[0];
      const algorithm = parseInt(parts[1]);
      const digestType = parseInt(parts[2]);

      const digestTypes: Record<number, string> = {
        1: 'SHA-1',
        2: 'SHA-256',
        4: 'SHA-384',
      };

      console.log(`DS record: key-tag=${keyTag}, algorithm=${algorithm}, digest=${digestTypes[digestType] || digestType}`);
    }

    expect(dsOutput.length).toBeGreaterThan(0);
  });
});
