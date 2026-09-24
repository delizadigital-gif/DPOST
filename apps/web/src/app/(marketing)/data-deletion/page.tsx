import type { Metadata } from 'next';
import { contactEmail, LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Data deletion' };
export const dynamic = 'force-dynamic';

export default function DataDeletionPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Deleting your data">
      <section>
        <p>
          You can ask us to delete your DPOST account and all of its data at any time. This page
          explains how, and what happens next.
        </p>
      </section>

      <section>
        <h2>Delete your whole account</h2>
        <p>
          Email <a href={`mailto:${email}?subject=Delete%20my%20DPOST%20account`}>{email}</a> from
          the email address you use for DPOST, with the subject “Delete my DPOST account”. We’ll
          confirm your request and erase your data within 30 days.
        </p>
      </section>

      <section>
        <h2>Remove only your Facebook data</h2>
        <p>
          In Facebook, go to Settings and privacy → Settings → Apps and websites, find DPOST and
          remove it. Facebook notifies us automatically, and we then delete the Facebook information
          we hold about you: your Facebook user ID and name, the connected Pages’ details and access
          tokens, and the Page posts and insights we imported. Posts already published on your Page
          stay on Facebook; you can delete them there.
        </p>
      </section>

      <section>
        <h2>What gets deleted</h2>
        <ul>
          <li>Your account and login details</li>
          <li>Your business information and AI preferences</li>
          <li>Your posts, content plans, images and AI conversations</li>
          <li>Your Facebook connections and the data imported from them</li>
        </ul>
        <p className="mt-3">
          We may keep a minimal record that a deletion happened, and anything the law requires us to
          keep, for as long as required.
        </p>
      </section>

      <section>
        <h2>Questions</h2>
        <p>
          Email <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
