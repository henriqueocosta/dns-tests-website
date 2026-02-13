#!/usr/bin/env node

import { Resolver } from 'dns';
import { promisify } from 'util';
import chalk from 'chalk';

// Public DNS servers to check propagation across different providers
const DNS_SERVERS = [
  { name: 'Google', ip: '8.8.8.8' },
  { name: 'Google Secondary', ip: '8.8.4.4' },
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: 'Cloudflare Secondary', ip: '1.0.0.1' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
  { name: 'Quad9', ip: '9.9.9.9' },
];

async function checkDNSServer(domain, recordType, server) {
  const resolver = new Resolver();
  resolver.setServers([server.ip]);

  const resolveMethod = {
    A: 'resolve4',
    AAAA: 'resolve6',
    CNAME: 'resolveCname',
    MX: 'resolveMx',
    TXT: 'resolveTxt',
    NS: 'resolveNs',
  }[recordType] || 'resolve4';

  const resolve = promisify(resolver[resolveMethod].bind(resolver));

  try {
    const result = await resolve(domain);
    const value = Array.isArray(result)
      ? result.map(r => typeof r === 'object' ? JSON.stringify(r) : r).join(', ')
      : result;
    return { server: server.name, success: true, value };
  } catch (error) {
    return { server: server.name, success: false, error: error.code || error.message };
  }
}

async function checkPropagation(domain, recordType = 'A') {
  console.log(chalk.bold(`\nDNS Propagation Check`));
  console.log(chalk.dim(`Domain: ${domain}`));
  console.log(chalk.dim(`Record Type: ${recordType}\n`));
  console.log(chalk.dim('─'.repeat(60)));

  const results = await Promise.all(
    DNS_SERVERS.map(server => checkDNSServer(domain, recordType, server))
  );

  const maxNameLength = Math.max(...DNS_SERVERS.map(s => s.name.length));

  results.forEach(result => {
    const name = result.server.padEnd(maxNameLength + 2);
    if (result.success) {
      console.log(chalk.green(`  ✓ ${name} ${result.value}`));
    } else {
      console.log(chalk.red(`  ✗ ${name} ${result.error}`));
    }
  });

  console.log(chalk.dim('─'.repeat(60)));

  const propagated = results.filter(r => r.success).length;
  const total = results.length;
  const percentage = Math.round((propagated / total) * 100);

  console.log(`\nPropagation: ${chalk.cyan(`${percentage}%`)} (${propagated}/${total} servers)\n`);

  if (percentage === 100) {
    console.log(chalk.green('✓ DNS fully propagated!\n'));
  } else if (percentage >= 50) {
    console.log(chalk.yellow('⏳ DNS partially propagated. Wait a few minutes...\n'));
  } else {
    console.log(chalk.red('✗ DNS not yet propagated. This may take up to 48 hours.\n'));
  }

  return { propagated, total, percentage, results };
}

async function monitorPropagation(domain, recordType = 'A', intervalSeconds = 30, maxAttempts = 20) {
  console.log(chalk.bold(`\nMonitoring DNS Propagation`));
  console.log(chalk.dim(`Checking every ${intervalSeconds} seconds (max ${maxAttempts} attempts)\n`));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(chalk.cyan(`\n--- Attempt ${attempt}/${maxAttempts} ---`));

    const { percentage } = await checkPropagation(domain, recordType);

    if (percentage === 100) {
      console.log(chalk.green.bold('\n🎉 Full propagation achieved!\n'));
      return true;
    }

    if (attempt < maxAttempts) {
      console.log(chalk.dim(`Waiting ${intervalSeconds} seconds before next check...`));
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
    }
  }

  console.log(chalk.yellow('\n⚠ Max attempts reached. DNS may still be propagating.\n'));
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const domain = args[0] || 'example.com';
  const recordType = args[1]?.toUpperCase() || 'A';
  const monitor = args.includes('--monitor');

  if (domain === 'example.com') {
    console.log(chalk.yellow('\nUsage: node check-propagation.js <domain> [record-type] [--monitor]'));
    console.log(chalk.dim('Example: node check-propagation.js mydomain.com A'));
    console.log(chalk.dim('Example: node check-propagation.js mydomain.com CNAME --monitor\n'));
  }

  if (monitor) {
    await monitorPropagation(domain, recordType);
  } else {
    await checkPropagation(domain, recordType);
  }
}

main().catch(console.error);
