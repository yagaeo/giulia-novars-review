"""Build the Pages folder and store the publisher's public assets alongside it."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import argparse
import os
import posixpath
import re
import shutil
import subprocess
from time import monotonic
from html import escape, unescape
from urllib.parse import urljoin, urlsplit, urlunsplit

ORIGIN = 'https://giulianovars.ru'
FRAGMENT = '<!-- preview-content -->'
MAIN = re.compile(r'<main\b.*?</main>', re.DOTALL)
LINK = re.compile(r'(\b(?:href|src|poster|data-project-link)=)(["\'])(.*?)\2', re.DOTALL)
TITLE = re.compile(r'<title>.*?</title>', re.DOTALL)

ASSET_URL = re.compile(
    r'https://giulianovars\.ru/(?:upload|local|bitrix)/'
    r'[A-Za-z0-9_./%-]+\.(?:avif|gif|ico|jpe?g|mp4|png|svg|webm|webp|woff2?)(?=[\s"\'&<>)\\,?#]|$)',
    re.IGNORECASE,
)
FONT_SIGNATURES = {'.woff': b'wOFF', '.woff2': b'wOF2'}


def page_route(root, path):
    directory = path.parent.relative_to(root).as_posix()
    return '/' if directory == '.' else '/' + directory + '/'


def rewrite_links(markup, origin_route, target_route, routes):
    def replacement(match):
        prefix, quote, raw = match.groups()
        value = unescape(raw)
        if not value or value.startswith(('#', '?')):
            return match.group()
        absolute = urlsplit(urljoin(ORIGIN + origin_route, value))
        if absolute.scheme not in ('http', 'https') or absolute.netloc != 'giulianovars.ru':
            return match.group()
        path = absolute.path
        route = path.rstrip('/') + '/'
        if path.endswith('/index.html'):
            route = path.removesuffix('index.html')
        if route in routes or path.startswith('/assets/'):
            relative = posixpath.relpath(route if route in routes else path, target_route)
            if route in routes:
                relative += '/'
            url = urlunsplit(('', '', relative, absolute.query, absolute.fragment))
        else:
            url = absolute.geturl()
        return prefix + quote + escape(url, quote=True) + quote

    return LINK.sub(replacement, markup)


def render_pages(root):
    pages = {page_route(root, path): path for path in root.rglob('index.html')}
    routes = set(pages)
    shell_path = pages.get('/about/')
    shell = shell_path.read_text(encoding='utf-8') if shell_path else ''
    for route, path in pages.items():
        content = path.read_text(encoding='utf-8')
        if content.startswith(FRAGMENT):
            main = MAIN.search(content)
            title = TITLE.search(content)
            if not (main and title and MAIN.search(shell)):
                raise SystemExit(f'Preview fragment is missing a title or main element: {path}')
            page_assets = content[title.end():main.start()]
            markup = rewrite_links(shell, '/about/', route, routes)
            markup = TITLE.sub(lambda _: title.group(), markup, count=1)
            if 'data-map-salons' in main.group():
                markup = markup.replace("connect-src 'none'", "connect-src 'self'")
                markup = markup.replace('name="referrer" content="no-referrer"',
                                        'name="referrer" content="strict-origin-when-cross-origin"')
            markup = markup.replace('</head>', rewrite_links(page_assets, route, route, routes) + '</head>', 1)
            main_content = rewrite_links(main.group(), route, route, routes)
            content = MAIN.sub(lambda _: main_content, markup, count=1)
        else:
            content = rewrite_links(content, route, route, routes)
        path.write_text(content, encoding='utf-8')

def collect(url, folder, deadline=None):
    remaining = deadline - monotonic() if deadline is not None else 25
    if remaining < 1:
        return url, None
    path = urlsplit(url).path
    suffix = Path(path).suffix.lower()
    key = sha256(url.encode()).hexdigest()[:16] + suffix
    target = folder / key
    temp = target.with_suffix('.part')
    result = subprocess.run(
        ['curl', '--fail', '--silent', '--show-error', '--location',
         '--max-time', str(min(remaining, 25)), '--max-filesize', '50000000',
         '--output', str(temp), url],
        capture_output=True,
    )
    if result.returncode == 0 and temp.is_file():
        with temp.open('rb') as handle:
            header = handle.read(512)
        signature = FONT_SIGNATURES.get(suffix)
        if signature:
            valid = header.startswith(signature)
        else:
            valid = bool(header) and b'<!doctype html' not in header.lower() and b'<html' not in header.lower()
        if valid:
            os.replace(temp, target)
            return url, target
    temp.unlink(missing_ok=True)
    return url, None

def build(source, output, media_budget=420):
    if output.exists():
        raise SystemExit(f'Output already exists: {output}')
    shutil.copytree(source, output)
    render_pages(output)
    files = sorted(path for path in output.rglob('*') if path.suffix in {'.html', '.css'})
    text = {path: path.read_text(encoding='utf-8') for path in files}
    counts = Counter(url.group() for page in text.values() for url in ASSET_URL.finditer(page))
    urls = sorted(counts, key=lambda url: (-counts[url], url))
    fonts = {url for url in urls if Path(urlsplit(url).path).suffix.lower() in FONT_SIGNATURES}
    assets = output / 'assets' / 'media'
    assets.mkdir(parents=True)
    with ThreadPoolExecutor(max_workers=12) as pool:
        copies = dict(pool.map(lambda url: collect(url, assets), sorted(fonts)))
        missing_fonts = sorted(url for url in fonts if copies[url] is None)
        if missing_fonts:
            copies.update(pool.map(lambda url: collect(url, assets), missing_fonts))
        missing_fonts = sorted(url for url in fonts if copies[url] is None)
        if missing_fonts:
            raise SystemExit('Required font files are unavailable: ' + ', '.join(missing_fonts))
        deadline = monotonic() + media_budget
        copies.update(pool.map(lambda url: collect(url, assets, deadline), (url for url in urls if url not in fonts)))
    for path, content in text.items():
        def local_url(match):
            saved = copies.get(match.group())
            return posixpath.relpath(saved, path.parent) if saved else match.group()
        path.write_text(ASSET_URL.sub(local_url, content), encoding='utf-8')
    misses = [url for url,dest in copies.items() if dest is None]
    print(f'Local media: {len(urls)-len(fonts)-len(misses)}/{len(urls)-len(fonts)}')
    print(f'Local fonts: {len(fonts)}/{len(fonts)}')
    for url in misses:
        print(f'Origin link retained: {url}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--media-budget', type=float, default=420, help='Seconds available for optional media downloads')
    args = parser.parse_args()
    build(args.source, args.output, args.media_budget)
