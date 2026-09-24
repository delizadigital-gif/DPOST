import type { Metadata } from 'next';
import Link from 'next/link';
import { contactEmail, LegalPage, OPERATOR } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Terms of Service' };
export const dynamic = 'force-dynamic';

export default function TermsPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Terms of Service">
      <section>
        <p>
          These terms govern your use of DPOST, a service operated by {OPERATOR}, Bangladesh. By
          creating an account you agree to them. Please also read our{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must be at least 18 and give accurate information when you sign up.</li>
          <li>Keep your password safe. You’re responsible for activity in your account.</li>
          <li>
            If you connect a Facebook Page, you must be authorised to manage it and to publish on
            its behalf.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You own the content you create, upload or publish with DPOST. You give us permission to
          store, process and publish it only as needed to provide the service to you, including
          sending it to AI providers to generate or improve content.
        </p>
      </section>

      <section>
        <h2>AI-generated content</h2>
        <p>
          DPOST uses AI to suggest posts, captions and images. AI can make mistakes: it may produce
          inaccurate, outdated or unsuitable content. You are responsible for reviewing content
          before you approve and publish it, including prices, offers and claims about your
          products.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You agree not to use DPOST to:</p>
        <ul>
          <li>Publish spam, or content that is illegal, hateful, harassing or deceptive</li>
          <li>Infringe anyone’s copyright, trademark or other rights</li>
          <li>Break the terms or policies of Facebook or any other connected platform</li>
          <li>Access other users’ data, disrupt the service, or get around its limits</li>
        </ul>
        <p className="mt-3">We may suspend accounts that break these rules.</p>
      </section>

      <section>
        <h2>Connected platforms</h2>
        <p>
          DPOST is not affiliated with or endorsed by Meta. When you connect Facebook, Meta’s own
          terms also apply. We rely on Facebook’s official API: if Facebook changes or limits it,
          some DPOST features may change or stop working.
        </p>
      </section>

      <section>
        <h2>Plans and fees</h2>
        <p>
          DPOST offers a free plan with usage limits. Paid plans, when offered, are billed as shown
          at the time you subscribe. We will tell you in advance about any change to the price of
          your plan.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          We work hard to publish your posts on time, but we can’t guarantee the service will always
          be available or that every post will publish, for example when Facebook is unavailable or
          rejects a post. When a post fails, DPOST tells you so you can retry.
        </p>
      </section>

      <section>
        <h2>Ending your account</h2>
        <p>
          You can stop using DPOST and ask us to delete your account at any time (see{' '}
          <Link href="/data-deletion">data deletion</Link>). We may close accounts that break these
          terms.
        </p>
      </section>

      <section>
        <h2>Disclaimers and liability</h2>
        <p>
          DPOST is provided “as is”. To the extent allowed by law, we are not liable for indirect or
          consequential losses, such as lost sales, and our total liability to you is limited to the
          amount you paid us in the 12 months before the claim.
        </p>
      </section>

      <section>
        <h2>Changes and governing law</h2>
        <p>
          We may update these terms and will notify you of important changes before they take
          effect. These terms are governed by the laws of Bangladesh.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          {OPERATOR}, Bangladesh. Email: <a href={`mailto:${email}`}>{email}</a>
        </p>
      </section>
    </LegalPage>
  );
}
