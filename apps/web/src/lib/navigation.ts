import {
  BarChart3,
  Bell,
  Brain,
  CalendarDays,
  Images,
  LayoutDashboard,
  Link2,
  type LucideIcon,
  MessageSquareText,
  PenSquare,
  Settings,
  Sparkles,
} from 'lucide-react';

/**
 * The app's navigation, in one place: the sidebar, the mobile tab bar and the
 * "More" sheet all read from here, so a new section is added once.
 * `labelKey` refers to messages/en.json under `nav`.
 */
export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** Shown in the mobile tab bar (max 4, plus "More"). */
  mobile?: boolean;
  /** Marks AI features, which share the spark styling. */
  spark?: boolean;
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.groups.create',
    items: [
      { href: '/home', labelKey: 'nav.home', icon: LayoutDashboard, mobile: true },
      { href: '/assistant', labelKey: 'nav.assistant', icon: Sparkles, mobile: true, spark: true },
      { href: '/create', labelKey: 'nav.create', icon: PenSquare },
    ],
  },
  {
    labelKey: 'nav.groups.plan',
    items: [
      { href: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays, mobile: true },
      { href: '/content', labelKey: 'nav.content', icon: MessageSquareText, mobile: true },
    ],
  },
  {
    labelKey: 'nav.groups.library',
    items: [
      { href: '/media', labelKey: 'nav.media', icon: Images },
      { href: '/brand', labelKey: 'nav.brand', icon: Brain },
    ],
  },
  {
    labelKey: 'nav.groups.grow',
    items: [{ href: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 }],
  },
  {
    labelKey: 'nav.groups.setup',
    items: [
      { href: '/channels', labelKey: 'nav.channels', icon: Link2 },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Reachable from the app but not in the sidebar. */
export const EXTRA_ROUTES: NavItem[] = [
  { href: '/notifications', labelKey: 'nav.notifications', icon: Bell },
];

export const MOBILE_ITEMS: NavItem[] = NAV_ITEMS.filter((item) => item.mobile);

/** The nav entry a URL belongs to, matching sub-paths like /content/plans/1. */
export function activeHref(pathname: string): string | undefined {
  const matches = [...NAV_ITEMS, ...EXTRA_ROUTES]
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`));
  // Longest match wins, so /content/plans doesn't also light up a shorter route.
  return matches.sort((a, b) => b.length - a.length)[0];
}
