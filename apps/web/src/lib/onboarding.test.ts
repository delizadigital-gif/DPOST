import { describe, expect, it } from 'vitest';
import { emptyProfile, type BrandProfileData } from '@dpost/core/brand';
import {
  isStepAnswered,
  nextStepHref,
  ONBOARDING_STEPS,
  previousStepHref,
  resumeHref,
  stepIndex,
} from './onboarding';

const field = <T>(value: T) => ({ value, source: 'onboarding' as const, updatedAt: '2026-09-01' });

function profile(parts: Partial<BrandProfileData>): BrandProfileData {
  return { ...emptyProfile(), ...parts };
}

describe('wizard order', () => {
  it('runs business → audience → voice → connect', () => {
    expect(ONBOARDING_STEPS.map((step) => step.slug)).toEqual([
      'business',
      'audience',
      'voice',
      'connect',
    ]);
  });

  it('moves forward and back through the steps', () => {
    expect(nextStepHref('business')).toBe('/welcome/audience');
    expect(previousStepHref('voice')).toBe('/welcome/audience');
  });

  it('has nowhere to go back to from the first step', () => {
    expect(previousStepHref('business')).toBeNull();
    expect(stepIndex('business')).toBe(0);
  });

  it('ends in the app, not on a fifth step', () => {
    expect(nextStepHref('connect')).toBe('/home');
  });
});

describe('which steps are answered', () => {
  it('counts the business step once it has a name', () => {
    expect(isStepAnswered(emptyProfile(), 'business')).toBe(false);
    expect(isStepAnswered(profile({ business: { name: field('Shop') } }), 'business')).toBe(true);
  });

  it('counts the audience step for either answer', () => {
    expect(isStepAnswered(profile({ offerings: { items: field(['Cake']) } }), 'audience')).toBe(
      true,
    );
    expect(
      isStepAnswered(profile({ audience: { description: field('Families') } }), 'audience'),
    ).toBe(true);
  });

  it('never counts the connect step, which saves nothing', () => {
    expect(isStepAnswered(emptyProfile(), 'connect')).toBe(false);
  });
});

describe('resuming an abandoned setup', () => {
  it('starts at the beginning for a new account', () => {
    expect(resumeHref(emptyProfile())).toBe('/welcome/business');
  });

  it('returns to the first unanswered step', () => {
    const partly = profile({
      business: { name: field('Shop') },
      offerings: { items: field(['Cake']) },
    });
    expect(resumeHref(partly)).toBe('/welcome/voice');
  });

  it('lands on the last step when everything is answered', () => {
    const complete = profile({
      business: { name: field('Shop') },
      audience: { description: field('Families') },
      voice: { tone: field('friendly') },
    });
    expect(resumeHref(complete)).toBe('/welcome/connect');
  });

  it('does not skip an earlier step that was left blank', () => {
    const skippedFirst = profile({ voice: { tone: field('bold') } });
    expect(resumeHref(skippedFirst)).toBe('/welcome/business');
  });
});
