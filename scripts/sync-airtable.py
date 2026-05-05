#!/usr/bin/env python3
"""Sync activity metadata from Airtable into activities.json.

This is a *separate* script — NOT run at server boot. Run it on demand when
the source-of-truth Airtable base has changed and you want the library to
pick up new values.

Usage:
    AIRTABLE_PAT=patXXXX python3 scripts/sync-airtable.py [--dry-run]

Reads:
    Airtable base `appEUXFXlnxrxY4OG`, table `Activities`, fields `Name`,
    `Gallery Image`, and `Created by`.

Writes:
    activities.json — the `image` and `created_by` fields are updated,
    matched by `name`.

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


def fetch_airtable(token: str) -> dict[str, dict]:
    """Return a {name: {image, created_by}} map from Airtable.

    `created_by` is a custom text field (Airtable's auto field is ignored).
    Falls back to '' when absent. Image is the first Gallery Image URL or ''.
    """
    records: list[dict] = []
    offset = None
    while True:
        params = {'fields[]': ['Name', 'Gallery Image', 'Created by']}
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

    out: dict[str, dict] = {}
    for rec in records:
        fields = rec.get('fields') or {}
        name = (fields.get('Name') or '').strip()
        if not name:
            continue
        gallery = fields.get('Gallery Image') or []
        image = gallery[0]['url'] if gallery and gallery[0].get('url') else ''
        # `Created By` may be a single-line text, multi-line text, or array of
        # collaborators. Normalize to a comma-joined string of names.
        cb_raw = fields.get('Created by')
        if isinstance(cb_raw, str):
            created_by = cb_raw.strip()
        elif isinstance(cb_raw, list):
            parts = []
            for item in cb_raw:
                if isinstance(item, dict):
                    parts.append((item.get('name') or item.get('email') or '').strip())
                elif isinstance(item, str):
                    parts.append(item.strip())
            created_by = ', '.join(p for p in parts if p)
        elif isinstance(cb_raw, dict):
            created_by = (cb_raw.get('name') or cb_raw.get('email') or '').strip()
        else:
            created_by = ''
        out[name] = {'image': image, 'created_by': created_by}
    return out


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
    airtable = fetch_airtable(token)

    image_changes = 0
    creator_changes = 0
    unknown: list[str] = []

    for a in activities:
        rec = airtable.get(a['name'])
        if not rec:
            continue
        new_image = rec['image']
        new_creator = rec['created_by']
        if new_image and new_image != a.get('image'):
            print(f"  IMAGE  {a['id']}  {a['name']!r}\n      {a.get('image')}\n   -> {new_image}")
            if not args.dry_run:
                a['image'] = new_image
            image_changes += 1
        if new_creator != (a.get('created_by') or ''):
            print(f"  AUTHOR {a['id']}  {a['name']!r}\n      {a.get('created_by') or '(empty)'!r} -> {new_creator!r}")
            if not args.dry_run:
                a['created_by'] = new_creator
            creator_changes += 1

    for name in airtable:
        if not any(a['name'] == name for a in activities):
            unknown.append(name)

    print()
    print(f'Airtable records:        {len(airtable)}')
    print(f'Image URLs updated:      {image_changes}')
    print(f'Created-by values updated: {creator_changes}')
    if unknown:
        print(f'Airtable names not in activities.json ({len(unknown)}):')
        for n in unknown:
            print(f'  - {n}')

    if (image_changes or creator_changes) and not args.dry_run:
        ACTIVITIES_JSON.write_text(json.dumps(activities, indent=2) + '\n')
        print(f'Wrote {ACTIVITIES_JSON}')
    elif args.dry_run:
        print('(dry-run: no changes written)')

    return 0


if __name__ == '__main__':
    sys.exit(main())
