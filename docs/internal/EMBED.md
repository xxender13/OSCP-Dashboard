# Embed on the SLU OSCP webpage

SLU Marketing approval is pending. Target page: https://www.slu.edu/education/institutes/office-of-school-and-community-partnerships/.

```html
<iframe id="oscp-dashboard"
  src="https://xxender13.github.io/OSCP-Dashboard/?embed=1"
  title="SLU OSCP Charter Partnerships Dashboard"
  width="100%" height="1000" loading="lazy"
  style="border:0" allow="fullscreen"></iframe>
<script>
window.addEventListener('message', function (event) {
  const frame = document.getElementById('oscp-dashboard');
  if (event.origin !== 'https://xxender13.github.io' ||
      event.source !== frame.contentWindow ||
      event.data?.type !== 'oscp-dashboard-height') return;
  const height = Number(event.data.height);
  if (Number.isFinite(height) && height >= 200 && height <= 100000)
    frame.height = String(Math.ceil(height));
});
</script>
```

Marketing checklist:

- Approve placement, title, accessibility review and release ownership; this code does not imply approval.
- Permit `https://xxender13.github.io` in the SLU page's `frame-src` Content Security Policy (CSP).
- If the dashboard receives a CSP, permit SLU with `frame-ancestors https://www.slu.edu https://slu.edu`. GitHub Pages cannot set arbitrary response headers in this repository; do not pretend a meta tag sets `frame-ancestors`.
- Confirm no hosting `X-Frame-Options` or CSP response header blocks embedding.
- Approve the parent height-listener script under the SLU page's script policy. Use a nonce or approved asset instead of unsafe inline script if required.
- The child sends height messages only to `https://www.slu.edu` and `https://slu.edu`, never `*`. The parent verifies origin, source window, message type and bounds.
- `?embed=1` hides the masthead and footer. Navigation remains available. Assets and data use relative paths, and Chart.js is self-hosted. Official external source links remain external references.
- Verify keyboard use, mobile layouts, PDFs and an accessible alternative link if the iframe is unavailable. Data Explorer is `explorer.html?embed=1`.

Deployment remains the existing main-branch Pages workflow. A branch review artifact is not a live publishing approval; merge the reviewed PR through normal repository controls before comparing the live release to its bundle.
