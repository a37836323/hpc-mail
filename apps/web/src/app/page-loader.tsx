import { Spinner } from '@/components/ui/spinner';

export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={className ?? 'grid min-h-64 place-items-center'}>
      <Spinner className="size-6 text-ink-tertiary" />
    </div>
  );
}

export function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <Spinner className="size-7 text-accent" />
    </div>
  );
}
