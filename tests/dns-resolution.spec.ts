import { test, expect } from '@playwright/test';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const resolveCname = promisify(dns.resolveCname);
const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);
const resolveNs = promisify(dns.resolveNs);

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
