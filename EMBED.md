# Embed the dashboard

Use your hosted dashboard address with `?embed=1`. This hides the header and footer while keeping the tiles, tabs, tables and exports.

```html
<iframe id="charter-dashboard"
  src="https://xxender13.github.io/OSCP-Dashboard/?embed=1"
  title="Saint Louis University Charter School Partnerships Dashboard"
  width="100%" height="1000" loading="lazy"
  style="border:0"></iframe>
```

The dashboard sends a height message when its content changes. Check the sender and origin before resizing:

```html
<script>
const dashboard = document.getElementById('charter-dashboard');
window.addEventListener('message', event => {
  if (event.source !== dashboard.contentWindow) return;
  if (event.origin !== new URL(dashboard.src).origin) return;
  if (event.data?.type !== 'oscp-dashboard-height') return;
  const height = Number(event.data.height);
  if (Number.isFinite(height) && height > 0) {
    dashboard.style.height = Math.min(50000, Math.max(480, height)) + 'px';
  }
});
</script>
```

Add a section bookmark after the query, for example `?embed=1#students/lunch`. Keep a direct dashboard link alongside the frame for opening or printing separately.
