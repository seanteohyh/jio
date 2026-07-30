import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Nothing here
      </h1>
      <p className="text-dolch-muted text-sm">
        That page does not exist. It may have been a link to something that has
        since been deleted.
      </p>
      <LinkButton href="/">Back to the start</LinkButton>
    </div>
  );
}
