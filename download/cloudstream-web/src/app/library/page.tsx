/**
 * Library route — thin server wrapper around the client island (the data is
 * device-local; there is nothing to fetch server-side).
 */

import type { Metadata } from 'next';
import { LibraryClient } from '../_components/LibraryClient';

export const metadata: Metadata = { title: 'Library' };

export default function LibraryPage() {
  return <LibraryClient />;
}
