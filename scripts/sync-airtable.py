#!/usr/bin/env python3
"""Sync activity metadata from Airtable into activities.json.

This is a *separate* script — NOT run at server boot. Run it on demand when
the source-of-truth Airtable base has changed and you want the library to
pick up new values.

Usage:
    AIRTABLE_PAT=patXXXX python3 scripts/sync-airtable.py [--dry-run]

Reads:
    Airtable base `appEUXFXlnxrxY4OG`, table `Activities`, fields `Name` and
    `Gallery Image`.

Writes:
    activities.json — only the `image` field is updated, matched by `name`.

Rationale:
    The original project rewrote index.html at boot with a regex (fragile,
    race-y, surprising). Image URLs are data; they belong in activities.json
    where the frontend already expects them.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


AIRTABLE_BASE = 'appEUXFXlnxrxY4OG'
AIRTABLE_TABLE = 'Activities'
ROOT = Path(__file__).resolve().parent.parent
ACTIVITIES_JSON = ROOT / 'activities.json'


def fetch_airtable(token: str) -> dict[str, str]:
    """Return a {name: gallery_image_url} map from Airtable."""
    records: list[dict] = []
    offset = None
    while True:
        params = {'fields[]': ['Name', 'Gallery Image']}
        qs = urllib.parse.urlencode(params, doseq=True)
        url = f'https://api.airtable.com/v0/{AIRTABLE_BASE}/{AIRTABLE_TABLE}?{qs}'
        if offset:
            url += f'&offset={urllib.parse.quote(offset)}'
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
        records.extend(data.get('records', []))
        offset = data.get('offset')
        if not offset:
            break

    image_map: dict[str, str] = {}
    for rec in records:
        fields = rec.get('fields') or {}
        name = (fields.get('Name') or '').strip()
        gallery = fields.get('Gallery Image') or []
        if name and gallery and gallery[0].get('url'):
            image_map[name] = gallery[0]['url']
    return image_map


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true',
                        help="Show what would change without writing")
    args = parser.parse_args()

    token = os.environ.get('AIRTABLE_PAT', '').strip()
    if not token.startswith('pat'):
        print('error: AIRTABLE_PAT env var must be set to a valid PAT', file=sys.stderr)
        return 2

    if not ACTIVITIES_JSON.exists():
        print(f'error: {ACTIVITIES_JSON} not found', file=sys.stderr)
        return 2

    activities = json.loads(ACTIVITIES_JSON.read_text())
    image_map = fetch_airtable(token)

    changed = 0
    unknown: list[str] = []
    for a in activities:
        new_url = image_map.get(a['name'])
        if new_url and new_url != a.get('image'):
            print(f"  {a['id']}  {a['name']!r}\n      {a.get('image')}\n   -> {new_url}")
            if not args.dry_run:
                a['image'] = new_url
            changed += 1
    for name in image_map:
        if not any(a['name'] == name for a in activities):
            unknown.append(name)

    print()
    print(f'Airtable records with images: {len(image_map)}')
    print(f'Activities updated:           {changed}')
    if unknown:
        print(f'Airtable names not in activities.json ({len(unknown)}):')
        for n in unknown:
            print(f'  - {n}')

    if changed and not args.dry_run:
        ACTIVITIES_JSON.write_text(json.dumps(activities, indent=2) + '\n')
        print(f'Wrote {ACTIVITIES_JSON}')
    elif args.dry_run:
        print('(dry-run: no changes written)')

    return 0


if __name__ == '__main__':
    sys.exit(main())
