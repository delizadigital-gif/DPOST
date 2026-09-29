import { describe, expect, it } from 'vitest';
import { buildPostWriterPrompt, buildRewritePrompt, POST_WRITER_VERSION } from './post-writer.v1';

const brandCard = "# Brand: Rahim's Kitchen\nSells: Biryani, Cakes";

describe('the post-writing prompt', () => {
  it('puts the stable parts in the system prompt, so providers can cache them', () => {
    const { system } = buildPostWriterPrompt({
      brandCard,
      language: 'en',
      count: 3,
      request: 'promote our Eid offer',
    });
    expect(system).toContain('Never invent facts');
    expect(system).toContain('Facebook Page');
    // Nothing that changes per request may sit in the cached prefix.
    expect(system).not.toContain('Eid');
    expect(system).not.toContain("Rahim's Kitchen");
  });

  it('carries the brand card and the request, each fenced as data', () => {
    const { prompt } = buildPostWriterPrompt({
      brandCard,
      language: 'en',
      count: 1,
      request: 'promote our Eid offer',
    });
    expect(prompt).toContain('<brand_data>');
    expect(prompt).toContain("Rahim's Kitchen");
    expect(prompt).toContain('<user_request>');
    expect(prompt).toContain('promote our Eid offer');
  });

  it('asks for the number of posts requested', () => {
    expect(
      buildPostWriterPrompt({ brandCard, language: 'en', count: 1, request: '' }).prompt,
    ).toContain('Write 1 Facebook post ');
    expect(
      buildPostWriterPrompt({ brandCard, language: 'en', count: 4, request: '' }).prompt,
    ).toContain('Write 4 Facebook posts');
  });

  it('spells out what each language means', () => {
    const bangla = buildPostWriterPrompt({ brandCard, language: 'bn', count: 1, request: '' });
    expect(bangla.prompt).toContain('Bengali script');

    const banglish = buildPostWriterPrompt({
      brandCard,
      language: 'banglish',
      count: 1,
      request: '',
    });
    expect(banglish.prompt).toContain('Latin letters');
    expect(banglish.prompt).toContain('Do not use any Bengali script');
  });

  it('says what to do when the user asked for nothing in particular', () => {
    const { prompt } = buildPostWriterPrompt({
      brandCard,
      language: 'en',
      count: 2,
      request: '  ',
    });
    expect(prompt).not.toContain('<user_request>');
    expect(prompt).toContain('did not ask for anything specific');
  });

  it('passes the openers to avoid', () => {
    const { prompt } = buildPostWriterPrompt({
      brandCard,
      language: 'en',
      count: 2,
      request: '',
      avoidOpeners: ['fresh batch out of the'],
    });
    expect(prompt).toContain('fresh batch out of the');
  });

  it('has a version that names every layer it is built from', () => {
    expect(POST_WRITER_VERSION).toContain('post-writer.v1');
    expect(POST_WRITER_VERSION).toContain('system.v1');
    expect(POST_WRITER_VERSION).toContain('facebook.v1');
  });
});

describe('the rewrite prompt', () => {
  const base = {
    brandCard,
    body: 'Fresh batch this morning.',
    hashtags: ['homemade'],
    cta: 'Inbox us',
    language: 'en' as const,
  };

  it('includes the post being edited, fenced as data', () => {
    const { prompt } = buildRewritePrompt({ ...base, action: 'improve' });
    expect(prompt).toContain('<current_post>');
    expect(prompt).toContain('Fresh batch this morning.');
  });

  it('asks for what each action means', () => {
    expect(buildRewritePrompt({ ...base, action: 'shorten' }).prompt).toContain('about half');
    expect(buildRewritePrompt({ ...base, action: 'hashtags' }).prompt).toContain(
      'Keep the post text exactly as it is',
    );
    expect(buildRewritePrompt({ ...base, action: 'cta' }).prompt).toContain('call to action');
  });

  it('forbids inventing facts while lengthening', () => {
    expect(buildRewritePrompt({ ...base, action: 'lengthen' }).prompt).toContain(
      'Do not invent facts',
    );
  });
});
