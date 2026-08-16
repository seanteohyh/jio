import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { BudgetBadge, Card, Chip, LinkButton, SectionHeading, Stars } from "@/components/ui";
import ShareLink from "@/components/ShareLink";
import { lobangShareUrl } from "@/lib/shareUrl";
import { config } from "@/lib/config";
import { formatCuisine, googleMapsPlaceUrl } from "@/lib/utils";

/**
 * Public lobang preview — CHANGES_20260816.md §4, "Share this lobang"'s
 * third path. Shows everything `/p/[id]` shows plus who sent it and their
 * note, safe to render for a signed-out visitor because `from_display_name`
 * is resolved server-side from the unguessable token
 * (`getPublicLobang()`/`get_public_lobang()`, migration 051) — never a name
 * typed into a client-editable URL. That was the actual spoofing risk
 * flagged before this was scoped; a real, server-verified attribution
 * closes it rather than reopening it.
 *
 * Unlike `/p/[id]`, a signed-in visitor is *not* bounced to `/places/[id]`
 * — the attribution and note here are the whole point of this page and
 * don't exist anywhere else, so a teammate who opens a forwarded link
 * should see them too, not skip straight past. They get a link into the
 * full place page instead of the "join" pitch, which is the only thing
 * that actually differs for them.
 */
export default async function PublicLobangPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();
  const repo = await getRepoAsync();

  let lobang;
  try {
    lobang = await repo.getPublicLobang(token);
  } catch (error) {
    // Same reasoning as /p/[id]: a stranger following a link can't act on
    // a raw error, so a failed lookup (missing migration, etc.) reads the
    // same as a genuinely unknown link rather than crashing the page.
    console.error("getPublicLobang failed", error);
    lobang = null;
  }

  if (!lobang) {
    return (
      <div className="space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold">This link isn&apos;t available</h1>
        <p className="text-stone text-sm">
          The link may be wrong, or the place may no longer be listed.
        </p>
      </div>
    );
  }

  const { place } = lobang;

  return (
    <div className="space-y-5">
      <Card className="bg-cream space-y-1.5">
        <p className="text-sm">
          <span className="font-medium">{lobang.from_display_name}</span>
          <span className="text-stone"> thinks you&apos;d like this</span>
        </p>
        {lobang.note && (
          <p className="text-stone text-sm whitespace-pre-wrap italic">
            “{lobang.note}”
          </p>
        )}
      </Card>

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

      {user ? (
        <LinkButton href={`/places/${place.id}`}>
          Open in {config.appName}
        </LinkButton>
      ) : (
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
      )}

      <ShareLink
        url={lobangShareUrl(token)}
        label="Share this lobang"
        shareText={`${lobang.from_display_name} thinks you'd like ${place.name}`}
      />
    </div>
  );
}
