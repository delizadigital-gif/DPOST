/**
 * Layer [2]: what a post has to look like on the target platform. Static per
 * platform, so it caches with the system prompt. The numbers here match the
 * checks in `social/facebook/validate.ts` — the prompt asks for what the
 * validator will accept.
 */

export const FACEBOOK_RULES_VERSION = 'facebook.v1';

export const FACEBOOK_RULES = `These posts are for a Facebook Page.

Length: aim for 40 to 400 characters. Facebook hides anything past roughly 480 characters behind "See more", so put the point first. Never write more than 2,000 characters.

Hashtags: Facebook is not Instagram. Use at most 4, and only ones a customer would actually search. Put them on their own line at the end. Never use more than 6.

No line of hashtags in the middle of the text. No "link in bio" — Facebook allows links. If the post has a link, write it in full.

Write for a phone screen: short paragraphs, a blank line between them, no markdown, no headings, no bullet characters unless the post is genuinely a list.

Ask for one specific action at the end when the post has a purpose beyond being read: "Inbox us to order", "Comment your size", "Call [phone number]".`;
