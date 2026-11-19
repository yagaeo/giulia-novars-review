"""Build the Pages folder and store the publisher's public media alongside it."""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import argparse
import os
import posixpath
import re
import shutil
import subprocess
from urllib.parse import urlsplit

MEDIA = re.compile(
    r'https://giulianovars\.ru/(?:upload|local|bitrix)/'
    r'[A-Za-z0-9_./%-]+\.(?:avif|gif|jpe?g|mp4|png|svg|webm|webp)(?=[\s"\'&<>)\\,]|$)',
    re.IGNORECASE,
)

def collect(url, folder):
    path = urlsplit(url).path
    suffix = Path(path).suffix.lower()
    key = sha256(url.encode()).hexdigest()[:16] + suffix
    target = folder / key
    temp = target.with_suffix('.part')
    result = subprocess.run(
        ['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '25',
         '--retry', '1', '--retry-max-time', '30', '--max-filesize', '50000000',
         '--output', str(temp), url],
        capture_output=True,
    )
    if result.returncode == 0 and temp.is_file():
        with temp.open('rb') as handle:
            header = handle.read(512).lower()
        if header and b'<!doctype html' not in header and b'<html' not in header:
            os.replace(temp, target)
            return url, target
    temp.unlink(missing_ok=True)
    return url, None

def build(source, output):
    if output.exists():
        raise SystemExit(f'Output already exists: {output}')
    shutil.copytree(source, output)
    files = sorted(path for path in output.rglob('*') if path.suffix in {'.html', '.css'})
    text = {path: path.read_text(encoding='utf-8') for path in files}
    urls = sorted({url.group() for page in text.values() for url in MEDIA.finditer(page)})
    assets = output / 'assets' / 'media'
    assets.mkdir(parents=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        copies = dict(pool.map(lambda url: collect(url, assets), urls))
    for path, content in text.items():
        def local_url(match):
            saved = copies.get(match.group())
            return posixpath.relpath(saved, path.parent) if saved else match.group()
        path.write_text(MEDIA.sub(local_url, content), encoding='utf-8')
    misses = [url for url,dest in copies.items() if dest is None]
    print(f'Local media: {len(urls)-len(misses)}/{len(urls)}')
    for url in misses:
        print(f'Origin link retained: {url}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build(args.source, args.output)
