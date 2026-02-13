# DNS Test Site

Test suite for verifying DNS settings from a domain registrar.

## Setup

```bash
npm install
npx playwright install
```

## Deploy the Test Site

### Option 1: Vercel (Recommended)
```bash
cd site
npx vercel
```

### Option 2: Netlify
```bash
cd site
npx netlify deploy --prod --dir=.
```

### Option 3: GitHub Pages
1. Push the `site/` folder to a GitHub repo
2. Enable GitHub Pages in repo settings

## Configure DNS Records

After deploying, configure your DNS records in the registrar:

| Record Type | Name | Value |
|-------------|------|-------|
| A | @ | Your server IP |
| CNAME | @ | your-site.vercel.app |
| CNAME | www | your-site.vercel.app |

## Verify DNS Records

### Quick Check
```bash
# Check all record types for a domain
npm run verify -- mydomain.com

# Include subdomains
npm run verify -- mydomain.com --subdomains
```

### Check Propagation
```bash
# One-time check across multiple DNS servers
npm run propagation -- mydomain.com

# Check specific record type
npm run propagation -- mydomain.com CNAME

# Monitor until fully propagated
npm run propagation -- mydomain.com A --monitor
```

## Run Playwright Tests

```bash
# Set your domain
export TEST_DOMAIN=mydomain.com

# Optional: set expected values
export EXPECTED_IP=192.0.2.1
export EXPECTED_CNAME=your-site.vercel.app

# Run tests
npm test
```

## Test Scenarios

The test suite covers:

1. **DNS Record Resolution**
   - A record (IPv4)
   - AAAA record (IPv6)
   - CNAME record
   - NS records
   - MX records
   - TXT records

2. **Website Accessibility**
   - Domain loads successfully
   - Correct hostname displayed
   - WWW subdomain handling

3. **Record Validation**
   - Valid IPv4/IPv6 formats
   - MX priority values

4. **Subdomain Tests**
   - www, api, mail subdomains
