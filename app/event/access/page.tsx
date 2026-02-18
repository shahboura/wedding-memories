export default function EventAccessPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Event access required</h1>
      <p className="max-w-md text-muted-foreground">
        Please scan the event QR code or open the event link to access the gallery.
      </p>
      <p className="text-sm text-muted-foreground">
        If you already scanned the QR, refresh this page after the redirect completes.
      </p>
    </div>
  );
}
