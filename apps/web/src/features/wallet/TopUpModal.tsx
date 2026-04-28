import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';

export interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        <Card className="rounded-b-none border-x-0 border-b-0">
          <h2 className="mb-2 text-lg font-bold">Top up</h2>
          <p className="mb-4 text-sm text-tg-hint">
            Stars / TON top-up coming soon. For MVP you start with $100.00 welcome bonus.
          </p>
          <Button variant="primary" onClick={onClose} className="w-full">
            Got it
          </Button>
        </Card>
      </div>
    </div>
  );
}
