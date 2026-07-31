import JioForm from "@/components/events/JioForm";

/**
 * The full-page way to start a Jio.
 *
 * The form itself lives in a shared component because the home screen renders
 * exactly the same thing inline — see the note in `JioForm`.
 */
export default function NewEventPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Start a Jio</h1>
        <p className="text-stone mt-1 text-sm">
          Pick a few options. Everyone ranks them, and the Borda count settles
          it.
        </p>
      </header>

      <JioForm variant="page" />
    </div>
  );
}
