#!/usr/bin/env node

import dns from 'dns';
import { promisify } from 'util';
import chalk from 'chalk';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const resolveCname = promisify(dns.resolveCname);
const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);
const resolveNs = promisify(dns.resolveNs);
const resolveSoa = promisify(dns.resolveSoa);

// Configuration - Update these values for your domain
const CONFIG = {
  domain: process.argv[2] || 'example.com',
  expectedRecords: {
    A: null,        // e.g., '192.0.2.1'
    AAAA: null,     // e.g., '2001:db8::1'
    CNAME: null,    // e.g., 'your-site.vercel.app'
    MX: null,       // e.g., 'mail.example.com'
    TXT: null,      // e.g., 'v=spf1 include:_spf.google.com ~all'
    NS: null,       // e.g., ['ns1-stage.d3.dev', 'ns2-stage.d3.dev']
  }
};

async function checkRecord(type, resolver, domain) {
  const prefix = `  ${type.padEnd(6)}`;
  try {
    const result = await resolver(domain);
    const value = Array.isArray(result)
      ? result.map(r => typeof r === 'object' ? JSON.stringify(r) : r).join(', ')
      : result;
    console.log(chalk.green(`${prefix} ✓ ${value}`));
    return { type, success: true, value: result };
  } catch (error) {
    if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
      console.log(chalk.yellow(`${prefix} - No record found`));
      return { type, success: false, error: 'No record' };
    }
    console.log(chalk.red(`${prefix} ✗ ${error.message}`));
    return { type, success: false, error: error.message };
  }
}

async function verifyDNS(domain) {
  console.log(chalk.bold(`\nDNS Verification for: ${chalk.cyan(domain)}\n`));
  console.log(chalk.dim('─'.repeat(50)));

  const results = [];

  // Check A record
  results.push(await checkRecord('A', resolve4, domain));

  // Check AAAA record
  results.push(await checkRecord('AAAA', resolve6, domain));

  // Check CNAME record
  results.push(await checkRecord('CNAME', resolveCname, domain));

  // Check MX records
  results.push(await checkRecord('MX', resolveMx, domain));

  // Check TXT records
  results.push(await checkRecord('TXT', resolveTxt, domain));

  // Check NS records
  results.push(await checkRecord('NS', resolveNs, domain));

  // Check SOA record
  results.push(await checkRecord('SOA', resolveSoa, domain));

  console.log(chalk.dim('─'.repeat(50)));

  const successful = results.filter(r => r.success).length;
  const total = results.length;

  console.log(`\nResults: ${chalk.green(successful)} found / ${total} checked\n`);

  return results;
}

async function verifySubdomains(domain, subdomains = ['www', 'mail', 'api']) {
  console.log(chalk.bold(`\nSubdomain Verification:\n`));

  for (const sub of subdomains) {
    const fullDomain = `${sub}.${domain}`;
    console.log(chalk.dim(`\n${fullDomain}:`));
    await checkRecord('A', resolve4, fullDomain);
    await checkRecord('CNAME', resolveCname, fullDomain);
  }
}

async function main() {
  const domain = CONFIG.domain;

  if (domain === 'example.com') {
    console.log(chalk.yellow('\nUsage: node verify-dns.js <domain>'));
    console.log(chalk.dim('Example: node verify-dns.js mydomain.com\n'));
  }

  await verifyDNS(domain);

  if (process.argv.includes('--subdomains')) {
    await verifySubdomains(domain);
  }
}

main().catch(console.error);
