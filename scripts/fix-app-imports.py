#!/usr/bin/env python3
"""One-off fixer: correct relative import depths in the Phase 5 app routes.

The bracketed dynamic-route directories make manual path arithmetic
error-prone; this script applies exact string replacements to the affected
files. Bracket literals are built via chr() to survive shell mangling.
"""
import os

ROOT = '/home/z/my-project/download/cloudstream-web/src/app'
BR = chr(91)
KET = chr(93)

TITLE_PAGE = os.path.join(ROOT, 'title', BR + 'provider' + KET, BR + 'hash' + KET, 'page.tsx')
WATCH_PAGE = os.path.join(ROOT, 'watch', BR + 'provider' + KET, BR + 'title' + KET, BR + 'data' + KET, 'page.tsx')
SEARCH_ROUTE = os.path.join(ROOT, 'api', 'search', 'route.ts')
SEARCH_PAGE = os.path.join(ROOT, 'search', 'page.tsx')
LIBRARY_PAGE = os.path.join(ROOT, 'library', 'page.tsx')
PROVIDERS_PAGE = os.path.join(ROOT, 'providers', 'page.tsx')
POSTER_CARD = os.path.join(ROOT, '_components', 'PosterCard.tsx')

# (file, [(old, new), ...])
FIXES = [
    (
        TITLE_PAGE,
        [
            ("from '../../../server/", "from '../../../../server/"),
            ("from '../../_components/", "from '../../../_components/"),
            ("from '../../_lib/", "from '../../../_lib/"),
            ("from '../../../core/", "from '../../../../core/"),
            ("(Object.entries(response.episodes) as const)", "(Object.entries(response.episodes))"),
        ],
    ),
    (
        WATCH_PAGE,
        [
            ("from '../../../server/", "from '../../../../../server/"),
            ("from '../../_components/", "from '../../../../_components/"),
            ("from '../../_lib/", "from '../../../../_lib/"),
            ("from '../../../core/", "from '../../../../../core/"),
        ],
    ),
    (
        SEARCH_ROUTE,
        [("from '../../../../server/", "from '../../../server/")],
    ),
    (SEARCH_PAGE, [("from './_components/SearchClient'", "from '../_components/SearchClient'")]),
    (LIBRARY_PAGE, [("from './_components/LibraryClient'", "from '../_components/LibraryClient'")]),
    (PROVIDERS_PAGE, [("from '../../server/catalog'", "from '../server/catalog'")]),
    (POSTER_CARD, [("readonly posterUrl: string;", "readonly posterUrl: string | null;")]),
]

for path, replacements in FIXES:
    with open(path, 'r', encoding='utf-8') as handle:
        content = handle.read()
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != original:
        with open(path, 'w', encoding='utf-8') as handle:
            handle.write(content)
        print('fixed:', path.replace(ROOT, '<app>'))
    else:
        print('NO CHANGES (check patterns!):', path.replace(ROOT, '<app>'))
print('done')
