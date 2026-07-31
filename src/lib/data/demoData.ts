import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { estimateWalkMinutes, haversine } from "@/lib/utils";
import type {
  EventOption,
  EventRsvp,
  EventVote,
  Kaki,
  KakiMember,
  Lobang,
  LunchEvent,
  Office,
  Place,
  Profile,
  UserPrefs,
  Visit,
  WishlistEntry,
} from "@/types";

/**
 * Seed data for demo mode.
 *
 * The point of demo mode is that someone can clone the repo, run `npm run dev`
 * and immediately see what the app *does* — recommendations that have opinions,
 * an event mid-vote, a group with history. Empty states demo badly.
 *
 * These are real places around Bras Basah / Bugis with approximate coordinates.
 */

export const DEMO_TEAMMATE_A = "00000000-0000-0000-0000-0000000000a1";
export const DEMO_TEAMMATE_B = "00000000-0000-0000-0000-0000000000b2";

const SECOND_OFFICE_ID = "00000000-0000-0000-0000-000000000002";

export const demoOffices: Office[] = [
  { ...DEFAULT_OFFICE, created_at: new Date("2025-01-01").toISOString() },
  {
    id: SECOND_OFFICE_ID,
    name: "Future Office",
    address: "1 Marina Boulevard, Singapore 018989",
    lat: 1.2799,
    lng: 103.8541,
    created_at: new Date("2025-01-01").toISOString(),
  },
];

interface RawPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  cuisine: string[];
  budget_tier: 1 | 2 | 3 | 4;
  best_dishes?: string[];
  notes?: string;
}

const RAW_PLACES: RawPlace[] = [
  {
    name: "Albert Centre Market & Food Centre",
    address: "270 Queen St, Singapore 180270",
    lat: 1.3009,
    lng: 103.8542,
    cuisine: ["food_court", "local", "chinese"],
    budget_tier: 1,
    best_dishes: ["Fishball noodles", "Char kway teow"],
    notes: "Classic hawker centre. Go before 12 or queue.",
  },
  {
    name: "Hill Street Tai Hwa Pork Noodle",
    address: "466 Crawford Ln, Singapore 190466",
    lat: 1.3032,
    lng: 103.8629,
    cuisine: ["local", "chinese"],
    budget_tier: 1,
    best_dishes: ["Bak chor mee"],
    notes: "Michelin star. The queue is real — allow 30 min.",
  },
  {
    name: "Zam Zam Restaurant",
    address: "697-699 North Bridge Rd, Singapore 198675",
    lat: 1.302,
    lng: 103.8567,
    cuisine: ["indian", "malay", "halal"],
    budget_tier: 1,
    best_dishes: ["Mutton murtabak", "Briyani"],
  },
  {
    name: "Nasi Lemak Ayam Taliwang",
    address: "Bugis Junction, Singapore 188021",
    lat: 1.2996,
    lng: 103.8554,
    cuisine: ["malay", "halal", "local"],
    budget_tier: 1,
    best_dishes: ["Nasi lemak set"],
  },
  {
    name: "Yakiniku Like Bugis",
    address: "200 Victoria St, Singapore 188021",
    lat: 1.2993,
    lng: 103.8552,
    cuisine: ["japanese"],
    budget_tier: 2,
    best_dishes: ["Beef harami set"],
    notes: "Solo-friendly, individual grills. Fast turnaround.",
  },
  {
    name: "Ichiban Boshi",
    address: "200 Victoria St, Singapore 188021",
    lat: 1.2995,
    lng: 103.8556,
    cuisine: ["japanese"],
    budget_tier: 2,
    best_dishes: ["Salmon don", "Chirashi"],
  },
  {
    name: "Tonkotsu Kazan Ramen",
    address: "200 Victoria St, Singapore 188021",
    lat: 1.2997,
    lng: 103.8549,
    cuisine: ["japanese"],
    budget_tier: 2,
    best_dishes: ["Volcano ramen"],
  },
  {
    name: "Seoul Garden",
    address: "200 Victoria St, Singapore 188021",
    lat: 1.2999,
    lng: 103.8557,
    cuisine: ["korean"],
    budget_tier: 3,
    best_dishes: ["BBQ buffet"],
    notes: "Better for a team lunch than a quick solo one.",
  },
  {
    name: "Ministry of Food",
    address: "51 Bras Basah Rd, Singapore 189554",
    lat: 1.2967,
    lng: 103.8523,
    cuisine: ["local", "food_court"],
    budget_tier: 1,
    best_dishes: ["Economy rice"],
    notes: "Downstairs. When you have 20 minutes and no opinions.",
  },
  {
    name: "The Providore Bras Basah",
    address: "231 Bain St, Singapore 180231",
    lat: 1.2984,
    lng: 103.8535,
    cuisine: ["cafe", "western"],
    budget_tier: 3,
    best_dishes: ["Truffle scrambled eggs", "Flat white"],
  },
  {
    name: "Chye Seng Huat Hardware",
    address: "150 Tyrwhitt Rd, Singapore 207563",
    lat: 1.3105,
    lng: 103.8607,
    cuisine: ["cafe", "western"],
    budget_tier: 3,
    best_dishes: ["Filter coffee", "Big breakfast"],
    notes: "A proper walk away. Worth it when you have the hour.",
  },
  {
    name: "Kok Sen Restaurant",
    address: "30 Keong Saik Rd, Singapore 089137",
    lat: 1.2806,
    lng: 103.8419,
    cuisine: ["chinese", "local"],
    budget_tier: 2,
    best_dishes: ["Big prawn hor fun", "Claypot yong tau foo"],
  },
  {
    name: "Sushi Tei Raffles City",
    address: "252 North Bridge Rd, Singapore 179103",
    lat: 1.2937,
    lng: 103.8533,
    cuisine: ["japanese"],
    budget_tier: 3,
    best_dishes: ["Aburi salmon"],
  },
  {
    name: "Chatterbox",
    address: "333 Orchard Rd, Singapore 238867",
    lat: 1.3009,
    lng: 103.8383,
    cuisine: ["local", "chinese"],
    budget_tier: 4,
    best_dishes: ["Chicken rice"],
    notes: "Expensive chicken rice, but a good one to bring visitors to.",
  },
  {
    name: "Fortune Centre Vegetarian",
    address: "190 Middle Rd, Singapore 188979",
    lat: 1.2996,
    lng: 103.8535,
    cuisine: ["vegetarian", "chinese"],
    budget_tier: 1,
    best_dishes: ["Mock char siew rice"],
  },
  {
    name: "Kailash Parbat",
    address: "3 Belilios Rd, Singapore 219924",
    lat: 1.3072,
    lng: 103.8541,
    cuisine: ["indian", "vegetarian"],
    budget_tier: 2,
    best_dishes: ["Chole bhature", "Pani puri"],
  },
  {
    name: "Nam Kee Pau",
    address: "229 Selegie Rd, Singapore 188344",
    lat: 1.3007,
    lng: 103.8497,
    cuisine: ["chinese", "local"],
    budget_tier: 1,
    best_dishes: ["Big pau", "Siew mai"],
  },
  {
    name: "Thai Express Bugis",
    address: "200 Victoria St, Singapore 188021",
    lat: 1.2994,
    lng: 103.8559,
    cuisine: ["thai"],
    budget_tier: 2,
    best_dishes: ["Boat noodles", "Green curry"],
  },
  {
    name: "Pho Street",
    address: "252 North Bridge Rd, Singapore 179103",
    lat: 1.2935,
    lng: 103.8536,
    cuisine: ["vietnamese"],
    budget_tier: 2,
    best_dishes: ["Beef pho"],
  },
  {
    name: "Encik Tan",
    address: "200 Victoria St, Singapore 188021",
    lat: 1.2991,
    lng: 103.8551,
    cuisine: ["halal", "local", "food_court"],
    budget_tier: 1,
    best_dishes: ["Mee rebus", "Nasi lemak"],
  },
  {
    name: "Two Men Bagel House",
    address: "16 Enggor St, Singapore 079717",
    lat: 1.2757,
    lng: 103.8437,
    cuisine: ["cafe", "western"],
    budget_tier: 2,
    best_dishes: ["Reuben bagel"],
  },
];

function buildPlaces(): Place[] {
  return RAW_PLACES.map((raw, index) => {
    const distance = haversine(
      DEFAULT_OFFICE.lat,
      DEFAULT_OFFICE.lng,
      raw.lat,
      raw.lng
    );
    return {
      id: `demo-place-${String(index + 1).padStart(2, "0")}`,
      name: raw.name,
      address: raw.address,
      lat: raw.lat,
      lng: raw.lng,
      cuisine: raw.cuisine,
      budget_tier: raw.budget_tier,
      osm_id: null,
      source: "manual" as const,
      status: "active" as const,
      best_dishes: raw.best_dishes ?? [],
      notes: raw.notes ?? null,
      created_by: DEMO_USER_ID,
      created_at: new Date("2025-06-01").toISOString(),
      updated_at: new Date("2025-06-01").toISOString(),
      distance_m: Math.round(distance),
      walk_minutes: estimateWalkMinutes(distance),
    };
  });
}

/** One place sitting in the review queue, so the queue UI has something in it. */
function buildPendingPlace(): Place {
  const lat = 1.3001;
  const lng = 103.8571;
  const distance = haversine(DEFAULT_OFFICE.lat, DEFAULT_OFFICE.lng, lat, lng);
  return {
    id: "demo-place-99",
    name: "Kopitiam Bugis Cube",
    address: "470 North Bridge Rd, Singapore 188735",
    lat,
    lng,
    cuisine: ["food_court", "local"],
    budget_tier: 1,
    osm_id: 987654321,
    source: "discovery",
    status: "needs_review",
    best_dishes: [],
    notes: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    distance_m: Math.round(distance),
    walk_minutes: estimateWalkMinutes(distance),
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number, hour = 12, minute = 15): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * A visit history with a shape to it: a Japanese habit the streak banner can
 * pick up on, a few well-rated regulars, and enough spread for the metrics
 * charts to look like real data.
 */
function buildVisits(): Visit[] {
  const rows: Omit<Visit, "id">[] = [
    // The demo user's own history.
    { place_id: "demo-place-05", user_id: DEMO_USER_ID, rating: 5, best_dishes: ["Beef harami set"], notes: "Fast and good.", visited_at: daysAgo(1), is_public: true },
    { place_id: "demo-place-07", user_id: DEMO_USER_ID, rating: 4, best_dishes: ["Volcano ramen"], notes: null, visited_at: daysAgo(2), is_public: false },
    { place_id: "demo-place-06", user_id: DEMO_USER_ID, rating: 4, best_dishes: ["Salmon don"], notes: "Reliable.", visited_at: daysAgo(3), is_public: true },
    { place_id: "demo-place-01", user_id: DEMO_USER_ID, rating: 4, best_dishes: ["Fishball noodles"], notes: null, visited_at: daysAgo(6), is_public: false },
    { place_id: "demo-place-03", user_id: DEMO_USER_ID, rating: 5, best_dishes: ["Mutton murtabak"], notes: "Worth the walk.", visited_at: daysAgo(9), is_public: true },
    { place_id: "demo-place-09", user_id: DEMO_USER_ID, rating: 3, best_dishes: [], notes: "Fine. Just fine.", visited_at: daysAgo(12), is_public: false },
    { place_id: "demo-place-18", user_id: DEMO_USER_ID, rating: 4, best_dishes: ["Boat noodles"], notes: null, visited_at: daysAgo(16), is_public: false },
    { place_id: "demo-place-02", user_id: DEMO_USER_ID, rating: 5, best_dishes: ["Bak chor mee"], notes: "Queued 25 min. Would again.", visited_at: daysAgo(23), is_public: true },

    // Alex Tan.
    { place_id: "demo-place-12", user_id: DEMO_TEAMMATE_A, rating: 5, best_dishes: ["Big prawn hor fun"], notes: "Best hor fun near town.", visited_at: daysAgo(4), is_public: true },
    { place_id: "demo-place-01", user_id: DEMO_TEAMMATE_A, rating: 4, best_dishes: [], notes: null, visited_at: daysAgo(7), is_public: false },
    { place_id: "demo-place-20", user_id: DEMO_TEAMMATE_A, rating: 4, best_dishes: ["Mee rebus"], notes: null, visited_at: daysAgo(10), is_public: true },
    { place_id: "demo-place-16", user_id: DEMO_TEAMMATE_A, rating: 5, best_dishes: ["Chole bhature"], notes: "Huge portions.", visited_at: daysAgo(14), is_public: true },
    { place_id: "demo-place-03", user_id: DEMO_TEAMMATE_A, rating: 4, best_dishes: [], notes: null, visited_at: daysAgo(19), is_public: false },

    // Mei Lin.
    { place_id: "demo-place-10", user_id: DEMO_TEAMMATE_B, rating: 5, best_dishes: ["Flat white"], notes: "Good for a quiet 1:1.", visited_at: daysAgo(2), is_public: true },
    { place_id: "demo-place-15", user_id: DEMO_TEAMMATE_B, rating: 4, best_dishes: ["Mock char siew rice"], notes: null, visited_at: daysAgo(5), is_public: false },
    { place_id: "demo-place-19", user_id: DEMO_TEAMMATE_B, rating: 3, best_dishes: [], notes: "A bit salty.", visited_at: daysAgo(8), is_public: true },
    { place_id: "demo-place-01", user_id: DEMO_TEAMMATE_B, rating: 5, best_dishes: ["Char kway teow"], notes: null, visited_at: daysAgo(11), is_public: false },
    { place_id: "demo-place-13", user_id: DEMO_TEAMMATE_B, rating: 4, best_dishes: ["Aburi salmon"], notes: null, visited_at: daysAgo(15), is_public: true },
  ];

  return rows.map((row, index) => ({
    ...row,
    id: `demo-visit-${index + 1}`,
    created_at: new Date(`${row.visited_at}T13:00:00Z`).toISOString(),
  }));
}

const DEMO_PROFILE_CREATED_AT = new Date("2025-06-01").toISOString();

export const demoProfiles: Profile[] = [
  { user_id: DEMO_USER_ID, display_name: "You", created_at: DEMO_PROFILE_CREATED_AT, onboarded_at: DEMO_PROFILE_CREATED_AT },
  { user_id: DEMO_TEAMMATE_A, display_name: "Alex Tan", created_at: DEMO_PROFILE_CREATED_AT, onboarded_at: DEMO_PROFILE_CREATED_AT },
  { user_id: DEMO_TEAMMATE_B, display_name: "Mei Lin", created_at: DEMO_PROFILE_CREATED_AT, onboarded_at: DEMO_PROFILE_CREATED_AT },
];

export const demoUserPrefs: UserPrefs[] = [
  {
    user_id: DEMO_USER_ID,
    cuisine_likes: ["japanese", "local"],
    cuisine_dislikes: [],
    budget_min: 1,
    budget_max: 3,
    blocklist: [],
    default_office_id: DEFAULT_OFFICE.id,
  },
  {
    user_id: DEMO_TEAMMATE_A,
    cuisine_likes: ["local", "chinese"],
    cuisine_dislikes: [],
    budget_min: 1,
    budget_max: 2,
    blocklist: [],
    default_office_id: DEFAULT_OFFICE.id,
  },
  {
    user_id: DEMO_TEAMMATE_B,
    cuisine_likes: ["cafe", "vegetarian"],
    cuisine_dislikes: [],
    budget_min: 1,
    budget_max: 4,
    blocklist: [],
    default_office_id: DEFAULT_OFFICE.id,
  },
];

export const DEMO_KAKI_ID = "demo-kaki-1";
export const DEMO_EVENT_ID = "demo-event-1";

export const demoKakis: Kaki[] = [
  {
    id: DEMO_KAKI_ID,
    name: "LazadaOne Lunch Kakis",
    created_by: DEMO_USER_ID,
    invite_token: "demokakitoken01",
    created_at: new Date("2025-06-15").toISOString(),
  },
];

export const demoKakiMembers: KakiMember[] = [
  { kaki_id: DEMO_KAKI_ID, user_id: DEMO_USER_ID, joined_at: new Date("2025-06-15").toISOString() },
  { kaki_id: DEMO_KAKI_ID, user_id: DEMO_TEAMMATE_A, joined_at: new Date("2025-06-16").toISOString() },
  { kaki_id: DEMO_KAKI_ID, user_id: DEMO_TEAMMATE_B, joined_at: new Date("2025-06-18").toISOString() },
];

export const DEMO_PAST_EVENT_ID = "demo-event-past-1";

export const demoEvents: LunchEvent[] = [
  {
    id: DEMO_EVENT_ID,
    office_id: DEFAULT_OFFICE.id,
    host_id: DEMO_TEAMMATE_A,
    title: "Friday team lunch",
    scheduled_at: daysFromNow(2),
    status: "open",
    invite_token: "demoeventtoken01",
    winner_place_id: null,
    kaki_id: DEMO_KAKI_ID,
    created_at: new Date().toISOString(),
  },
  // A closed Jio in the past, so "Past Jios" on the profile page and the
  // "send lobang" flow that hangs off it both have something to show out of
  // the box.
  {
    id: DEMO_PAST_EVENT_ID,
    office_id: DEFAULT_OFFICE.id,
    host_id: DEMO_USER_ID,
    title: "Monday kickoff lunch",
    scheduled_at: daysFromNow(-5),
    status: "closed",
    invite_token: "demoeventtoken02",
    winner_place_id: "demo-place-12",
    kaki_id: DEMO_KAKI_ID,
    created_at: daysFromNow(-6),
  },
];

export const demoEventOptions: EventOption[] = [
  { event_id: DEMO_EVENT_ID, place_id: "demo-place-12", added_by: DEMO_TEAMMATE_A, is_suggested: false },
  { event_id: DEMO_EVENT_ID, place_id: "demo-place-08", added_by: DEMO_TEAMMATE_A, is_suggested: false },
  { event_id: DEMO_EVENT_ID, place_id: "demo-place-16", added_by: DEMO_TEAMMATE_B, is_suggested: false },
  { event_id: DEMO_PAST_EVENT_ID, place_id: "demo-place-12", added_by: DEMO_USER_ID, is_suggested: false },
  { event_id: DEMO_PAST_EVENT_ID, place_id: "demo-place-06", added_by: DEMO_USER_ID, is_suggested: false },
];

export const demoEventVotes: EventVote[] = [
  { event_id: DEMO_EVENT_ID, user_id: DEMO_TEAMMATE_A, place_id: "demo-place-12", rank: 1, created_at: new Date().toISOString() },
  { event_id: DEMO_EVENT_ID, user_id: DEMO_TEAMMATE_A, place_id: "demo-place-16", rank: 2, created_at: new Date().toISOString() },
  { event_id: DEMO_EVENT_ID, user_id: DEMO_TEAMMATE_A, place_id: "demo-place-08", rank: 3, created_at: new Date().toISOString() },
  { event_id: DEMO_EVENT_ID, user_id: DEMO_TEAMMATE_B, place_id: "demo-place-16", rank: 1, created_at: new Date().toISOString() },
  { event_id: DEMO_EVENT_ID, user_id: DEMO_TEAMMATE_B, place_id: "demo-place-12", rank: 2, created_at: new Date().toISOString() },
  { event_id: DEMO_PAST_EVENT_ID, user_id: DEMO_USER_ID, place_id: "demo-place-12", rank: 1, created_at: daysFromNow(-6) },
  { event_id: DEMO_PAST_EVENT_ID, user_id: DEMO_TEAMMATE_A, place_id: "demo-place-12", rank: 1, created_at: daysFromNow(-6) },
];

export const demoEventRsvps: EventRsvp[] = [
  { event_id: DEMO_EVENT_ID, user_id: DEMO_TEAMMATE_A, response: "yes" },
  { event_id: DEMO_EVENT_ID, user_id: DEMO_TEAMMATE_B, response: "yes" },
  { event_id: DEMO_PAST_EVENT_ID, user_id: DEMO_USER_ID, response: "yes" },
  { event_id: DEMO_PAST_EVENT_ID, user_id: DEMO_TEAMMATE_A, response: "yes" },
];


export const demoLobangs: Lobang[] = [
  {
    id: "demo-lobang-1",
    from_user_id: DEMO_TEAMMATE_A,
    place_id: "demo-place-16",
    note: "Vegetarian-friendly and quick — thought of you after Monday's jio.",
    event_id: DEMO_PAST_EVENT_ID,
    kaki_id: null,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "demo-lobang-2",
    from_user_id: DEMO_USER_ID,
    place_id: "demo-place-12",
    note: "The hor fun everyone was raving about at Monday's jio. You'd like this.",
    event_id: DEMO_PAST_EVENT_ID,
    kaki_id: null,
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: "demo-lobang-3",
    from_user_id: DEMO_USER_ID,
    place_id: "demo-place-02",
    note: "Whole Kaki should try this before the lunch crowd finds out.",
    event_id: null,
    kaki_id: DEMO_KAKI_ID,
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
];

/** Recipients, snapshotted at send time — see 019_lobang_group_send.sql. */
export const demoLobangRecipients: {
  lobang_id: string;
  user_id: string;
  seen_at: string | null;
}[] = [
  { lobang_id: "demo-lobang-1", user_id: DEMO_USER_ID, seen_at: null },
  {
    lobang_id: "demo-lobang-2",
    user_id: DEMO_TEAMMATE_B,
    seen_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  // Group send to the whole Kaki, minus the sender (DEMO_USER_ID).
  { lobang_id: "demo-lobang-3", user_id: DEMO_TEAMMATE_A, seen_at: null },
  { lobang_id: "demo-lobang-3", user_id: DEMO_TEAMMATE_B, seen_at: null },
];

export const demoWishlist: WishlistEntry[] = [
  { user_id: DEMO_USER_ID, place_id: "demo-place-11", created_at: new Date().toISOString() },
  { user_id: DEMO_USER_ID, place_id: "demo-place-21", created_at: new Date().toISOString() },
];

export function buildDemoPlaces(): Place[] {
  return [...buildPlaces(), buildPendingPlace()];
}

export function buildDemoVisits(): Visit[] {
  return buildVisits();
}
