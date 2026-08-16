import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { BudgetBadge, Card, Chip, LinkButton, SectionHeading, Stars } from "@/components/ui";
import ShareLink from "@/components/ShareLink";
import { placeShareUrl } from "@/lib/shareUrl";
import { config } from "@/lib/config";
import { formatCuisine, googleMapsPlaceUrl } from "@/lib/utils";

/**
 * Public place preview — CHANGES_20260812.md §4, the app's first
 * unauthenticated page. `place.id` is the identifier (no separate invite
 * token, see `shareUrl.placeShareUrl`), and the data comes from
 * `getPublicPlace()`, which only ever returns the narrow, privacy-safe
 * `PublicPlace` shape — never the named review list, never notes or who
 * added it. Coordinates and `google_place_id` *are* included
 * (CHANGES_20260814.md §2) so a visitor gets the same "View on Google
 * Maps" link — opening the restaurant's actual listing when one's been
 * matched, a coordinate pin otherwise — as a signed-in visitor does. Every
 * place here is an already-public venue findable on Maps regardless, so
 * neither carries the same sensitivity as notes/authorship.
 *
 * A signed-in visitor who follows a shared link gets bounced straight to
 * the full `/places/[id]` page rather than seeing this cut-down version —
 * same reasoning as `/k/[token]` sending an existing member straight into
 * the group instead of showing them a join screen they don't need.
 */
export default async function PublicPlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (user) {
    redirect(`/places/${id}`);
  }

  const repo = await getRepoAsync();

  let place;
  try {
    place = await repo.getPublicPlace(id);
  } catch (error) {
    // A signed-out visitor gets the same "not available" state whether the
    // place genuinely doesn't exist or the lookup itself failed server-side
    // (e.g. a migration not yet applied) — a stranger following a shared
    // link can't act on a raw error either way, and a calm, branded message
    // beats Next's bare fallback page. Logged so it's still visible in
    // Vercel's function logs for whoever's debugging it.
    console.error("getPublicPlace failed", error);
    place = null;
  }

  if (!place) {
    return (
      <div className="space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold">This place isn&apos;t available</h1>
        <p className="text-stone text-sm">
          The link may be wrong, or the place may no longer be listed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{place.name}</h1>
        {place.address && (
          <p className="text-stone mt-1 text-sm">{place.address}</p>
        )}

        <div className="text-stone mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <BudgetBadge tier={place.budget_tier} />
          <Stars rating={place.avg_rating} size="md" />
          {place.visit_count > 0 && <span>{place.visit_count} visits</span>}
        </div>

        <a
          href={googleMapsPlaceUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="border-line bg-paper text-ink hover:bg-cream mt-3 inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-medium"
        >
          View on Google Maps
        </a>

        {(place.cuisine.length > 0 || place.custom_cuisine_tags.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {place.cuisine.map((c) => (
              <Chip key={c}>{formatCuisine(c)}</Chip>
            ))}
            {place.custom_cuisine_tags.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}
      </header>

      {place.best_dishes.length > 0 && (
        <Card>
          <SectionHeading>What to order</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {place.best_dishes.map((dish) => (
              <Chip key={dish}>{dish}</Chip>
            ))}
          </div>
        </Card>
      )}

      <Card className="space-y-3 text-center">
        <p className="text-sm">
          <span className="font-medium">{config.appName}</span> is how our
          team decides where to eat — sign in to vote on Jios, save this to
          your list, and see what the team thought.
        </p>
        <LinkButton
          href={`/login?next=${encodeURIComponent(`/places/${place.id}`)}`}
        >
          Join to see more
        </LinkButton>
      </Card>

      <ShareLink
        url={placeShareUrl(place.id)}
        label="Share this place"
        shareText={`Check out ${place.name}`}
      />
    </div>
  );
}
