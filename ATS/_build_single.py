# -*- coding: utf-8 -*-
"""Build a single-file HireFlow HTML app from the multi-page sources."""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "hireflow"
OUT = Path(__file__).resolve().parent / "HireFlow.html"

CSS_FILES = [
    "css/variables.css",
    "css/base.css",
    "css/components.css",
    "css/layout.css",
    "css/pages.css",
    "css/print.css",
]

LIB_FILES = [
    "js/lib/storage.js",
    "js/lib/escape.js",
    "js/lib/dates.js",
    "js/lib/validate.js",
    "js/lib/ui.js",
    "js/lib/charts.js",
    "js/lib/calendar.js",
    "js/lib/dnd.js",
    "js/core/data.js",
    "js/core/permissions.js",
    "js/core/auth.js",
    "js/core/pipeline.js",
    "js/core/api.js",
    "js/core/router-guard.js",
]

# (html path relative to hireflow/, page script or None, virtual route)
PAGES = [
    ("index.html", "js/pages/index.page.js", "/index.html"),
    ("job-details.html", "js/pages/job-details.page.js", "/job-details.html"),
    ("login.html", "js/pages/login.page.js", "/login.html"),
    ("register.html", "js/pages/register.page.js", "/register.html"),
    ("403.html", None, "/403.html"),
    ("404.html", None, "/404.html"),
    ("candidate/dashboard.html", "js/pages/candidate-dashboard.page.js", "/candidate/dashboard.html"),
    ("candidate/profile.html", "js/pages/candidate-profile.page.js", "/candidate/profile.html"),
    ("candidate/applications.html", "js/pages/candidate-applications.page.js", "/candidate/applications.html"),
    ("candidate/interviews.html", "js/pages/candidate-interviews.page.js", "/candidate/interviews.html"),
    ("hr/dashboard.html", "js/pages/hr-dashboard.page.js", "/hr/dashboard.html"),
    ("hr/jobs.html", "js/pages/hr-jobs.page.js", "/hr/jobs.html"),
    ("hr/pipeline.html", "js/pages/hr-pipeline.page.js", "/hr/pipeline.html"),
    ("hr/candidates.html", "js/pages/hr-candidates.page.js", "/hr/candidates.html"),
    ("hr/interviews.html", "js/pages/hr-interviews.page.js", "/hr/interviews.html"),
    ("hr/offers.html", "js/pages/hr-offers.page.js", "/hr/offers.html"),
    ("hr/analytics.html", "js/pages/hr-analytics.page.js", "/hr/analytics.html"),
    ("admin/overview.html", "js/pages/admin-overview.page.js", "/admin/overview.html"),
    ("admin/users.html", "js/pages/admin-users.page.js", "/admin/users.html"),
    ("admin/notifications.html", "js/pages/admin-notifications.page.js", "/admin/notifications.html"),
    ("admin/settings.html", "js/pages/admin-settings.page.js", "/admin/settings.html"),
]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def strip_module(src):
    lines = []
    for line in src.splitlines(True):
        if re.match(r"^\s*import\s", line):
            continue
        lines.append(line)
    text = "".join(lines)
    text = re.sub(r"^export ", "", text, flags=re.M)
    text = re.sub(
        r"window\.location\.href\s*=\s*([^;]+);",
        r"HF.go(\1);",
        text,
    )
    text = text.replace("window.location.reload()", "HF.reload()")
    text = text.replace("window.location.search", "HF.location.search")
    text = text.replace("window.location.pathname", "HF.location.pathname")
    text = text.replace("window.location.href", "HF.location.href")
    text = text.replace(
        "window.history.replaceState({}, '', newUrl);",
        "HF.replace(newUrl);",
    )
    return text


def extract_body(html):
    m = re.search(r"<body[^>]*>(.*)</body>", html, flags=re.S | re.I)
    if not m:
        raise SystemExit("No body found")
    body = m.group(1)
    body = re.sub(r"<script\b[^>]*>.*?</script>", "", body, flags=re.S | re.I)
    return body.strip()


def extract_title(html):
    m = re.search(r"<title>(.*?)</title>", html, flags=re.S | re.I)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else "HireFlow"


ROUTER = r"""
const HF = {
  handlers: Object.create(null),
  views: Object.create(null),
  titles: Object.create(null),
  location: { pathname: '/index.html', search: '', hash: '', href: '/index.html' },
  _rendering: false,
  _pending: false,
  onReady(route, fn) {
    this.handlers[route] = fn;
  },
  resolve(target) {
    target = String(target == null ? '' : target).trim();
    if (/^(https?:|mailto:|blob:|data:)/i.test(target)) return { external: target };
    let inPage = '';
    const hashIdx = target.indexOf('#');
    if (hashIdx >= 0) {
      inPage = target.slice(hashIdx);
      target = target.slice(0, hashIdx);
    }
    let search = '';
    const qIdx = target.indexOf('?');
    if (qIdx >= 0) {
      search = target.slice(qIdx);
      target = target.slice(0, qIdx);
    }
    let pathname;
    if (!target) pathname = this.location.pathname;
    else if (target.startsWith('/')) pathname = target;
    else {
      const dir = this.location.pathname.replace(/[^/]*$/, '');
      const parts = (dir + target).split('/');
      const stack = [];
      for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') stack.pop();
        else stack.push(part);
      }
      pathname = '/' + stack.join('/');
    }
    if (pathname === '/') pathname = '/index.html';
    return { pathname, search, hash: inPage, href: pathname + search + inPage };
  },
  hashUrl(dest) {
    return '#' + dest.pathname + (dest.search || '') + (dest.hash || '');
  },
  parseHash() {
    let raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
    try { raw = decodeURIComponent(raw); } catch (err) { /* keep raw */ }
    if (!raw || raw === '/') {
      return { pathname: '/index.html', search: '', hash: '', href: '/index.html' };
    }
    if (!raw.startsWith('/')) raw = '/' + raw;
    const htmlAt = raw.toLowerCase().indexOf('.html');
    if (htmlAt >= 0) {
      const after = raw.slice(htmlAt + 5);
      const h = after.indexOf('#');
      if (h >= 0) {
        const inPage = after.slice(h);
        raw = raw.slice(0, htmlAt + 5 + h);
        const q = raw.indexOf('?');
        const pathname = q >= 0 ? raw.slice(0, q) : raw;
        const search = q >= 0 ? raw.slice(q) : '';
        return { pathname, search, hash: inPage, href: pathname + search + inPage };
      }
    }
    const q = raw.indexOf('?');
    const pathname = q >= 0 ? raw.slice(0, q) : raw;
    const search = q >= 0 ? raw.slice(q) : '';
    return { pathname, search, hash: '', href: pathname + search };
  },
  go(target) {
    const dest = this.resolve(target);
    if (dest.external) {
      window.location.href = dest.external;
      return;
    }
    const sameDoc = dest.pathname === this.location.pathname && dest.search === this.location.search;
    this.location = dest;
    const url = this.hashUrl(dest);
    if (location.hash !== url) history.pushState({ hf: 1 }, '', url);
    if (sameDoc) {
      this.scrollToHash();
      return;
    }
    this.render();
  },
  replace(target) {
    const dest = this.resolve(target);
    const samePath = dest.pathname === this.location.pathname;
    this.location = dest;
    history.replaceState({ hf: 1 }, '', this.hashUrl(dest));
    if (!samePath) this.render();
  },
  reload() {
    this.render();
  },
  scrollToHash() {
    const h = this.location.hash;
    if (!h || h === '#') {
      window.scrollTo(0, 0);
      return;
    }
    const id = h.slice(1);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView();
    else window.scrollTo(0, 0);
  },
  render() {
    if (this._rendering) {
      this._pending = true;
      return;
    }
    this._rendering = true;
    try {
      const pathAtStart = this.location.pathname;
      document.querySelectorAll('.sidebar-backdrop, .drawer-backdrop, .modal-backdrop').forEach((el) => el.remove());
      document.body.style.overflow = '';
      const known = Object.prototype.hasOwnProperty.call(this.views, pathAtStart);
      const viewPath = known ? pathAtStart : '/404.html';
      const app = document.getElementById('app');
      app.innerHTML = this.views[viewPath] || '';
      document.title = known ? (this.titles[pathAtStart] || 'HireFlow') : (this.titles['/404.html'] || 'Page Not Found');
      const handler = this.handlers[viewPath];
      if (handler) handler();
      if (this.location.pathname !== pathAtStart) return;
      this.scrollToHash();
    } finally {
      this._rendering = false;
      if (this._pending) {
        this._pending = false;
        this.render();
      }
    }
  },
  start() {
    document.querySelectorAll('template[data-route]').forEach((node) => {
      const route = node.getAttribute('data-route');
      this.views[route] = node.innerHTML;
      this.titles[route] = node.getAttribute('data-title') || 'HireFlow';
    });
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || /^(https?:|mailto:|blob:|data:|javascript:)/i.test(href)) return;
      e.preventDefault();
      HF.go(href);
    });
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form && form.tagName === 'FORM' && !form.getAttribute('action')) {
        e.preventDefault();
      }
    }, true);
    window.addEventListener('popstate', () => {
      HF.location = HF.parseHash();
      HF.render();
    });
    if (!location.hash.startsWith('#/')) {
      history.replaceState({ hf: 1 }, '', '#/index.html');
    }
    HF.location = HF.parseHash();
    HF.render();
  }
};
"""


def main():
    css = "\n".join(read(rel) for rel in CSS_FILES)
    favicon = base64.b64encode((ROOT / "assets/favicon.svg").read_bytes()).decode("ascii")

    parts = [ROUTER]
    for rel in LIB_FILES:
        parts.append("\n/* " + rel + " */\n")
        parts.append(strip_module(read(rel)))

    templates = []
    for html_rel, js_rel, route in PAGES:
        html = read(html_rel)
        title = extract_title(html)
        body = extract_body(html)
        templates.append(
            f'<template data-route="{route}" data-title="{title}">\n{body}\n</template>'
        )
        if js_rel:
            src = strip_module(read(js_rel))
            src = src.replace(
                "document.addEventListener('DOMContentLoaded',",
                f"HF.onReady('{route}',",
                1,
            )
            parts.append(f"\n/* {js_rel} */\n;(() => {{\n{src}\n}})();\n")

    parts.append("""
HF.onReady('/403.html', () => { initDemoBanner(); setupThemeToggle(); });
HF.onReady('/404.html', () => { initDemoBanner(); setupThemeToggle(); });
HF.start();
""")

    script = "".join(parts).replace("</script", "<\\/script")

    html_out = f"""<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: blob: https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'none';">
  <title>HireFlow | Smart Recruitment &amp; Applicant Tracking System</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,{favicon}">
  <style>
{css}
  </style>
</head>
<body>
  <div id="app"></div>
{chr(10).join(templates)}
  <script>
{script}
  </script>
</body>
</html>
"""
    OUT.write_text(html_out, encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
