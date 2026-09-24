import type { Metadata } from 'next';
import Link from 'next/link';
import { contactEmail, LegalPage, OPERATOR } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Privacy Policy' };
export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <p>
          DPOST is a social media management service operated by {OPERATOR}, based in Bangladesh
          (“we”, “us”). This policy explains what information we collect when you use DPOST, why we
          collect it, and the choices you have. If anything is unclear, email us at{' '}
          <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address and password. We store
            only a secure one-way hash of your password, never the password itself.
          </li>
          <li>
            <strong>Security information:</strong> the IP address and browser of each signed-in
            session, used to keep your account secure and to prevent abuse.
          </li>
          <li>
            <strong>Business information you give us:</strong> for example your business name,
            products, target audience, brand tone and posting preferences.
          </li>
          <li>
            <strong>Content:</strong> posts, captions, images and content plans that you create,
            upload or generate with DPOST, and your conversations with the DPOST AI assistant.
          </li>
          <li>
            <strong>Facebook information, only if you connect a Facebook Page:</strong> your
            Facebook user ID and name; the Pages you choose to connect, with their public details
            (name, ID, category, profile picture); access tokens that let us act for those Pages,
            which we store encrypted; recent posts on those Pages and the engagement and insights
            data that Facebook’s official API provides; and the posts we publish for you. We only
            access what you grant through Facebook’s permission screen, and we never access personal
            Facebook profiles, private messages or information about individual followers.
          </li>
          <li>
            <strong>Service records:</strong> a log of important actions in your account (for
            example publishing or deleting a post) and technical error reports.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To provide DPOST: creating, scheduling and publishing content when you ask us to.</li>
          <li>To generate content with AI that matches your business, voice and goals.</li>
          <li>To show you how your published posts perform.</li>
          <li>To keep DPOST secure, prevent abuse and fix problems.</li>
          <li>
            To send you emails about your account and your posts (for example email confirmation,
            password reset, or a failed post).
          </li>
        </ul>
        <p className="mt-3">
          We do not sell your information, and we do not use it for advertising.
        </p>
      </section>

      <section>
        <h2>AI processing</h2>
        <p>
          To generate text and images, we send the relevant parts of your business information and
          content to AI providers (for example Anthropic). They process it only to return a result
          to us. We use providers whose terms, when we chose them, do not allow them to train their
          models on data sent through their APIs. AI-generated content is always shown to you for
          review before it can be published.
        </p>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <p>We share information only with service providers that help us run DPOST:</p>
        <ul>
          <li>Hosting and databases (Railway), file storage and delivery (Cloudflare)</li>
          <li>Email delivery (Resend) and error monitoring (Sentry)</li>
          <li>AI providers, as described above</li>
          <li>Meta (Facebook), when we publish content or read Page data on your instructions</li>
        </ul>
        <p className="mt-3">
          Our servers are located in Singapore, so your information is processed outside Bangladesh.
          We may also disclose information when required by law.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We use only the cookies needed to keep you signed in and to protect your account. We do
          not use advertising or tracking cookies.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>Your account information and content: for as long as your account exists.</li>
          <li>Deleted posts and media: kept for 30 days so you can restore them, then erased.</li>
          <li>Security and action logs: up to 24 months.</li>
          <li>
            After you delete your account, or ask us to delete it, we erase your data within 30
            days, unless the law requires us to keep something.
          </li>
        </ul>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          All traffic to DPOST is encrypted (HTTPS). Facebook access tokens are encrypted at rest,
          passwords are hashed, and access to each business’s data is restricted to its own members.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li>You can see and edit your business information in DPOST at any time.</li>
          <li>
            You can disconnect a Facebook Page at any time, in DPOST or in your Facebook settings
            under Apps and websites.
          </li>
          <li>
            You can ask us for a copy of your data, to correct it, or to delete it. See{' '}
            <Link href="/data-deletion">how to delete your data</Link>.
          </li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>DPOST is a business tool and is not intended for anyone under 18.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we make important changes to this policy, we will tell you by email or in DPOST before
          they take effect.
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
